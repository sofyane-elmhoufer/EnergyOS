"""
Exécution sécurisée du code pandas généré par le LLM.

Le LLM écrit du code ; ce code n'est JAMAIS exécuté directement dans le
processus du serveur. Trois barrières successives :

1. Validation statique (AST) : liste blanche de syntaxes, aucun import,
   aucun attribut « _privé » / dunder, aucune fonction dangereuse
   (eval, open, getattr...), aucune méthode d'écriture de fichier
   (to_csv, to_excel, tofile...), accès à `pd` limité à une liste blanche.
2. Builtins restreints : seules des fonctions inoffensives sont disponibles
   (len, sum, round...). `__import__`, `open`, `eval` n'existent pas.
3. Processus séparé avec délai maximal : une boucle infinie ou un calcul
   trop lourd est interrompu (le processus est tué puis relancé) sans
   bloquer ni compromettre le serveur.
"""

from __future__ import annotations

import ast
import atexit
import logging
import multiprocessing as mp
import threading
from typing import Any

import pandas as pd

logger = logging.getLogger("ensa.sandbox")

MAX_CODE_CHARS = 6000
EXEC_TIMEOUT_S = 15
MAX_OUTPUT_CHARS = 4000
MAX_CHART_POINTS = 60


class UnsafeCodeError(ValueError):
    """Code refusé par la validation statique."""


# ---------------------------------------------------------------------------
# 1. Validation statique
# ---------------------------------------------------------------------------

_ALLOWED_NODES: tuple[type, ...] = (
    ast.Module, ast.Expr, ast.Assign, ast.AugAssign, ast.AnnAssign,
    ast.For, ast.While, ast.If, ast.Break, ast.Continue, ast.Pass,
    ast.FunctionDef, ast.Return, ast.Lambda, ast.arguments, ast.arg,
    ast.Try, ast.ExceptHandler, ast.Raise, ast.Assert, ast.Delete,
    ast.Compare, ast.BoolOp, ast.BinOp, ast.UnaryOp, ast.IfExp, ast.NamedExpr,
    ast.Call, ast.keyword, ast.Attribute, ast.Subscript, ast.Slice,
    ast.Name, ast.Constant, ast.List, ast.Tuple, ast.Dict, ast.Set, ast.Starred,
    ast.ListComp, ast.DictComp, ast.SetComp, ast.GeneratorExp, ast.comprehension,
    ast.JoinedStr, ast.FormattedValue,
    ast.expr_context, ast.operator, ast.cmpop, ast.boolop, ast.unaryop,
)

_BLOCKED_NAMES = {
    "eval", "exec", "compile", "open", "input", "breakpoint", "help",
    "globals", "locals", "vars", "dir", "getattr", "setattr", "delattr",
    "hasattr", "type", "object", "super", "classmethod", "staticmethod",
    "property", "memoryview", "bytearray", "exit", "quit", "id", "callable",
    "issubclass",
}

# Attributs qui exécutent du code texte, écrivent des fichiers, ouvrent des
# accès bas niveau ou donnent accès aux frames / modules internes.
_BLOCKED_ATTRS = {
    "format", "format_map", "query", "eval", "plot", "style", "hist",
    "boxplot", "tofile", "dump", "dumps", "ctypes", "mro", "save",
    "savetxt", "load", "loads", "system", "popen",
}
_BLOCKED_ATTR_PREFIXES = ("_", "gi_", "cr_", "ag_", "f_", "tb_", "co_", "func_", "read_")
_ALLOWED_TO_METHODS = {
    "to_string", "to_dict", "to_list", "to_frame", "to_numpy", "to_period",
    "to_timestamp", "to_pydatetime", "to_series", "to_datetime", "to_numeric",
    "to_timedelta",
}
# Paramètres qui désignent un fichier / une connexion.
_BLOCKED_KEYWORDS = {
    "buf", "path", "path_or_buf", "excel_writer", "filepath_or_buffer",
    "con", "file", "engine",
}
# Seules ces fonctions/classes de pandas sont accessibles via `pd.`.
_ALLOWED_PD_ATTRS = {
    "DataFrame", "Series", "Timestamp", "Timedelta", "NaT", "NA", "Grouper",
    "IndexSlice", "Categorical", "to_datetime", "to_numeric", "to_timedelta",
    "concat", "merge", "cut", "qcut", "isna", "notna", "isnull", "notnull",
    "date_range", "pivot_table", "crosstab", "unique", "factorize", "get_dummies",
    "melt",
}


def validate_code(code: str) -> ast.Module:
    """Vérifie le code ; lève UnsafeCodeError s'il contient quoi que ce soit d'interdit."""
    if len(code) > MAX_CODE_CHARS:
        raise UnsafeCodeError("code trop long")
    try:
        tree = ast.parse(code, mode="exec")
    except SyntaxError as exc:
        raise UnsafeCodeError(f"erreur de syntaxe ligne {exc.lineno}") from exc

    parents: dict[int, ast.AST] = {}
    for node in ast.walk(tree):
        for child in ast.iter_child_nodes(node):
            parents[id(child)] = node

    for node in ast.walk(tree):
        if not isinstance(node, _ALLOWED_NODES):
            raise UnsafeCodeError(f"syntaxe non autorisée : {type(node).__name__}")

        if isinstance(node, ast.FunctionDef) and node.decorator_list:
            raise UnsafeCodeError("décorateurs non autorisés")

        if isinstance(node, ast.Name):
            if node.id.startswith("_") or node.id in _BLOCKED_NAMES:
                raise UnsafeCodeError(f"nom interdit : {node.id}")
            if node.id == "pd":
                parent = parents.get(id(node))
                # `pd` ne peut être utilisé que sous la forme pd.<attribut autorisé>
                if not (isinstance(parent, ast.Attribute) and parent.value is node):
                    raise UnsafeCodeError("`pd` ne peut pas être copié ou passé en argument")
                if parent.attr not in _ALLOWED_PD_ATTRS:
                    raise UnsafeCodeError(f"pd.{parent.attr} n'est pas autorisé")
                if isinstance(node.ctx, (ast.Store, ast.Del)):
                    raise UnsafeCodeError("`pd` ne peut pas être réassigné")
            if node.id == "df" and isinstance(node.ctx, ast.Del):
                raise UnsafeCodeError("`df` ne peut pas être supprimé")

        if isinstance(node, ast.Attribute):
            attr = node.attr
            if attr.startswith(_BLOCKED_ATTR_PREFIXES) or attr in _BLOCKED_ATTRS:
                raise UnsafeCodeError(f"attribut interdit : {attr}")
            if attr.startswith("to") and attr.startswith("to_") and attr not in _ALLOWED_TO_METHODS:
                raise UnsafeCodeError(f"méthode d'export interdite : {attr}")

        if isinstance(node, ast.Call):
            for kw in node.keywords:
                if kw.arg in _BLOCKED_KEYWORDS:
                    raise UnsafeCodeError(f"paramètre interdit : {kw.arg}")
            # to_string(buf) : le 1er argument positionnel est un chemin de fichier
            if isinstance(node.func, ast.Attribute) and node.func.attr == "to_string" and node.args:
                raise UnsafeCodeError("to_string() ne doit pas recevoir d'argument positionnel")

        if isinstance(node, ast.Constant) and isinstance(node.value, (bytes,)):
            raise UnsafeCodeError("littéraux bytes non autorisés")

    return tree


# ---------------------------------------------------------------------------
# 2 + 3. Exécution dans un processus isolé
# ---------------------------------------------------------------------------

def _safe_builtins() -> dict[str, Any]:
    import builtins

    names = [
        "abs", "all", "any", "bool", "dict", "divmod", "enumerate", "filter",
        "float", "frozenset", "int", "isinstance", "len", "list", "map", "max",
        "min", "pow", "print", "range", "repr", "reversed", "round", "set",
        "slice", "sorted", "str", "sum", "tuple", "zip", "chr", "ord",
        "Exception", "ValueError", "KeyError", "IndexError", "ZeroDivisionError",
        "TypeError", "True", "False", "None",
    ]
    return {name: getattr(builtins, name) for name in names if hasattr(builtins, name)}


def _sanitize_chart(chart: Any) -> tuple[dict | None, str | None]:
    """
    Vérifie le graphique demandé par le LLM et le convertit en JSON pur, borné.
    Retourne (graphique, None) ou (None, explication de l'erreur à renvoyer au LLM).
    """
    if chart is None:
        return None, None
    if not isinstance(chart, dict):
        return None, "`chart` doit être un dict."
    kind = chart.get("type")
    x = chart.get("x")
    series = chart.get("series")
    data = chart.get("data")
    if hasattr(data, "to_dict"):
        data = data.reset_index().to_dict("records") if hasattr(data, "reset_index") else data.to_dict("records")
    if kind not in ("bar", "line"):
        return None, "chart['type'] doit valoir 'bar' ou 'line'."
    if not isinstance(x, str):
        return None, "chart['x'] doit être le nom (texte) de la colonne de l'axe X."
    if isinstance(series, str):
        series = [series]
    if not isinstance(series, list) or not series or not all(isinstance(s, str) for s in series):
        return None, "chart['series'] doit être une liste de noms de colonnes."
    if not isinstance(data, list) or not data:
        return None, "chart['data'] doit être une liste NON vide de dicts (to_dict('records'))."
    if len(data) > MAX_CHART_POINTS:
        return None, f"chart['data'] contient {len(data)} lignes : maximum {MAX_CHART_POINTS}."
    series = series[:4]
    rows = []
    for row in data:
        if not isinstance(row, dict):
            return None, "chart['data'] doit contenir des dicts."
        missing = [key for key in [x, *series] if key not in row]
        if missing:
            return None, (f"les clés {missing} n'existent pas dans chart['data'] ; clés disponibles : "
                          f"{list(row.keys())[:10]}. Utilise exactement les mêmes noms dans 'x', 'series' et 'data'.")
        clean = {}
        for key in [x, *series]:
            value = row[key]
            if hasattr(value, "item"):
                value = value.item()  # numpy -> python
            if key == x:
                clean[key] = str(value)[:60]
                continue
            if isinstance(value, bool) or not isinstance(value, (int, float)) or value != value:
                return None, f"la série '{key}' doit contenir uniquement des nombres (valeur trouvée : {str(value)[:30]})."
            clean[key] = round(float(value), 3)
        rows.append(clean)
    title = chart.get("title")
    return {
        "type": kind,
        "title": str(title)[:120] if title else "",
        "x": x[:60],
        "series": [s[:60] for s in series],
        "data": rows,
    }, None


def _worker_main(conn) -> None:
    """Boucle du processus isolé : reçoit (code, df), renvoie (sortie, erreur, graphique)."""
    import contextlib
    import io

    cache: dict[str, pd.DataFrame] = {}
    builtins_dict = _safe_builtins()

    while True:
        try:
            message = conn.recv()
        except EOFError:
            return
        kind = message[0]
        if kind == "stop":
            return
        if kind == "df":
            _, key, frame = message
            cache.clear()
            cache[key] = frame
            conn.send(("ok",))
            continue

        _, key, code = message
        try:
            validate_code(code)  # revalidé côté processus isolé (défense en profondeur)
            env: dict[str, Any] = {
                "__builtins__": builtins_dict,
                "df": cache[key].copy(),
                "pd": pd,
            }
            buffer = io.StringIO()
            with contextlib.redirect_stdout(buffer):
                exec(compile(code, "<llm>", "exec"), env)  # noqa: S102 - code validé + isolé
            output = buffer.getvalue()
            if "result" in env:
                output += "\nresult = " + str(env["result"])
            chart, chart_error = _sanitize_chart(env.get("chart"))
            conn.send(("done", output.strip()[:MAX_OUTPUT_CHARS], None, chart, chart_error))
        except UnsafeCodeError as exc:
            conn.send(("done", None, f"Code refusé ({exc})", None, None))
        except Exception as exc:  # erreur du code généré : renvoyée au LLM pour correction
            conn.send(("done", None, f"{type(exc).__name__}: {str(exc)[:300]}", None, None))


class _Sandbox:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._proc = None
        self._conn = None
        self._df_key: str | None = None

    def _start(self) -> None:
        ctx = mp.get_context("spawn")
        parent, child = ctx.Pipe()
        proc = ctx.Process(target=_worker_main, args=(child,), daemon=True, name="ensa-sandbox")
        proc.start()
        child.close()
        self._proc, self._conn, self._df_key = proc, parent, None

    def _kill(self) -> None:
        if self._proc is not None:
            self._proc.kill()
            self._proc.join(timeout=5)
        if self._conn is not None:
            self._conn.close()
        self._proc = self._conn = self._df_key = None

    def run(self, code: str, df: pd.DataFrame, df_key: str) -> tuple[str | None, str | None, dict | None, str | None]:
        """Retourne (sortie, erreur, graphique, erreur_graphique)."""
        validate_code(code)  # refus immédiat sans même démarrer le processus
        with self._lock:
            if self._proc is None or not self._proc.is_alive():
                self._kill()
                self._start()
            try:
                if self._df_key != df_key:
                    self._conn.send(("df", df_key, df))
                    if not self._conn.poll(60):
                        raise TimeoutError
                    self._conn.recv()
                    self._df_key = df_key
                self._conn.send(("run", df_key, code))
                if not self._conn.poll(EXEC_TIMEOUT_S):
                    logger.warning("Sandbox : délai dépassé, processus relancé")
                    self._kill()
                    return None, f"Calcul interrompu : plus de {EXEC_TIMEOUT_S} s. Simplifie le code.", None, None
                _, output, error, chart, chart_error = self._conn.recv()
                return output, error, chart, chart_error
            except (EOFError, OSError, TimeoutError, BrokenPipeError):
                logger.exception("Sandbox : processus isolé indisponible")
                self._kill()
                return None, "Le moteur de calcul a été relancé, réessaie.", None, None

    def close(self) -> None:
        with self._lock:
            if self._conn is not None and self._proc is not None and self._proc.is_alive():
                try:
                    self._conn.send(("stop",))
                except OSError:
                    pass
            self._kill()


sandbox = _Sandbox()
atexit.register(sandbox.close)

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import time


import pandas as pd

from app.services.sandbox import UnsafeCodeError, sandbox, validate_code


def main():
    df = pd.DataFrame({"Salle": ["A", "B", "A"], "Energie_kWh": [1.0, 2.0, 3.0]})

    attacks = [
        "import os\nos.system('calc')",
        "__import__('os').system('calc')",
        "().__class__.__bases__[0].__subclasses__()",
        "open('x.txt','w').write('hi')",
        "df.to_csv('x.csv')",
        "df.to_string('x.txt')",
        "df.to_string(buf='x.txt')",
        "p = pd\np.io",
        "pd.io.common.os.system('calc')",
        "pd.read_csv('C:/Windows/win.ini')",
        "df.query('Salle == \"A\"')",
        "'{0.__class__}'.format(df)",
        "g = (x for x in [1])\ng.gi_frame.f_globals",
        "eval('1+1')",
        "getattr(df, '__class__')",
        "df.values.ctypes",
        "df.values.tofile('x.bin')",
        "class A: pass",
        "def f():\n    yield 1",
        "with open('x') as f: pass",
        "print('x', file=None)",
        "df.plot()",
    ]
    for code in attacks:
        try:
            validate_code(code)
            print("NOT BLOCKED !!!", repr(code))
        except UnsafeCodeError as exc:
            print("blocked:", repr(code)[:50], "->", exc)

    ok = (
        "# test\n"
        "t = df[df['Salle'] == 'A']['Energie_kWh'].sum()\n"
        "g = df.groupby('Salle')['Energie_kWh'].sum().reset_index()\n"
        "print(f'total A = {t}')\n"
        "print(g.to_string())\n"
        "chart = {'type': 'bar', 'title': 'x', 'x': 'Salle', 'series': ['Energie_kWh'], 'data': g.to_dict('records')}\n"
    )
    t0 = time.time()
    print(sandbox.run(ok, df, "k1"), f"{time.time() - t0:.2f}s")
    t0 = time.time()
    print(sandbox.run("print(len(df))", df, "k1"), f"{time.time() - t0:.2f}s")
    print(sandbox.run("x = 1/0", df, "k1"))
    print(sandbox.run("print(compile_x)", df, "k1"))
    t0 = time.time()
    print(sandbox.run("while True:\n    pass", df, "k1"), f"{time.time() - t0:.2f}s")
    print(sandbox.run("print('after restart', len(df))", df, "k1"))
    sandbox.close()


if __name__ == "__main__":
    main()

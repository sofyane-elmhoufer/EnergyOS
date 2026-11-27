"""
Test hors ligne de l'envoi du devis par e-mail : un faux serveur SMTP local reçoit le message.
Aucun e-mail réel n'est envoyé. Lancer depuis la racine :
    backend/.venv/bin/python backend/tests/test_email_offline.py
"""

import base64
import email
import email.policy
import os
import socket
import sys
import threading
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

received: list[bytes] = []


def fake_smtp(server: socket.socket) -> None:
    """Serveur SMTP minimal : accepte un message et le garde en mémoire."""
    conn, _ = server.accept()
    stream = conn.makefile("rwb")

    def say(line: str) -> None:
        stream.write(line.encode() + b"\r\n")
        stream.flush()

    say("220 fake")
    data, in_data = [], False
    while line := stream.readline():
        if in_data:
            if line == b".\r\n":
                in_data = False
                received.append(b"".join(data))
                say("250 ok")
            else:
                data.append(line)
            continue
        command = line[:4].upper()
        if command == b"EHLO":
            say("250 fake")
        elif command == b"DATA":
            in_data = True
            say("354 go")
        elif command == b"QUIT":
            say("221 bye")
            break
        else:
            say("250 ok")
    conn.close()


server = socket.socket()
server.bind(("127.0.0.1", 0))
server.listen(1)
port = server.getsockname()[1]
threading.Thread(target=fake_smtp, args=(server,), daemon=True).start()

# Configuration AVANT l'import de l'application (les variables sont lues au chargement).
# Valeurs vides (et non supprimées) : backend/.env ne doit pas y injecter de vrais identifiants.
os.environ.update(SMTP_HOST="127.0.0.1", SMTP_PORT=str(port), SMTP_SECURITY="none", SMTP_FROM="devis@test.local",
                  SMTP_USER="", SMTP_PASSWORD="")

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

client = TestClient(app, base_url="http://localhost")
pdf = b"%PDF-1.4\n% test\n%%EOF"
simulation = {
    "monthly_bill": 1200, "building_type": "office", "city": "fes",
    "appliances": [{"type": "lighting", "quantity": 40}],
}
body = {
    "email": "client@test.local", "name": "Client Test", "reference": "DEV-20261127-A1B2C3",
    "pdf_base64": base64.b64encode(pdf).decode(), "simulation": simulation,
}

# Refus des entrées invalides
for override, expected in [
    ({"email": "pas-un-email"}, 422),
    ({"email": "a@b.co\nBcc: x@y.z"}, 422),            # injection d'en-tête
    ({"reference": "../../etc"}, 422),
    ({"pdf_base64": base64.b64encode(b"hello world").decode()}, 422),  # pas un PDF
    ({"extra": "x"}, 422),                              # champ inconnu
]:
    response = client.post("/api/simulation/send-devis", json={**body, **override})
    assert response.status_code == expected, (override, response.status_code, response.text)
print("OK refus des entrées invalides")

# Envoi réussi
response = client.post("/api/simulation/send-devis", json=body)
assert response.status_code == 200, response.text
assert response.json() == {"sent": True, "email": "client@test.local"}
threading.Event().wait(0.2)
assert len(received) == 1
message = email.message_from_bytes(received[0], policy=email.policy.default)
assert message["To"] == "client@test.local"
assert "DEV-20261127-A1B2C3" in message["Subject"]
text = message.get_body(("plain",)).get_content()
assert "Bonjour Client Test" in text and "Facture actuelle" in text
attachment = next(message.iter_attachments())
assert attachment.get_filename() == "Devis_DEV-20261127-A1B2C3.pdf"
assert attachment.get_content() == pdf
print("OK e-mail reçu avec le devis PDF en pièce jointe")

# Limite de débit (3 envois / minute / IP par défaut, dont celui ci-dessus).
# Le faux serveur est fermé : les envois suivants échouent (502) puis sont bloqués (429).
codes = [client.post("/api/simulation/send-devis", json=body).status_code for _ in range(4)]
assert codes[-1] == 429 and 502 in codes, codes
print("OK limite de débit :", codes)

# Sans configuration SMTP : réponse claire
from app import security  # noqa: E402

security.rate_limiter = security.RateLimiter()
os.environ["SMTP_HOST"] = ""
response = client.post("/api/simulation/send-devis", json=body)
assert response.status_code == 503, response.text
print("OK message clair sans configuration SMTP")
print("\nTEST E-MAIL HORS-LIGNE RÉUSSI")

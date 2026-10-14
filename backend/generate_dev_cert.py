"""One-off local dev helper: generates a self-signed TLS certificate for
localhost, used to secure the Flower gRPC channel between hospital nodes
and the central server.

# ponytail: single self-signed cert acting as its own root -- fine for a
# same-machine simulation. Upgrade path: a real CA-issued cert (or a proper
# local CA + per-node leaf certs) before this ever leaves localhost.
"""
import datetime
from pathlib import Path

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID

CERTS_DIR = Path(__file__).resolve().parent / "certs"


def generate() -> None:
    CERTS_DIR.mkdir(exist_ok=True)
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "localhost")])
    cert = (
        x509.CertificateBuilder()
        .subject_name(name)
        .issuer_name(name)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(datetime.datetime.now(datetime.timezone.utc))
        .not_valid_after(datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=365))
        .add_extension(x509.SubjectAlternativeName([x509.DNSName("localhost")]), critical=False)
        .add_extension(x509.BasicConstraints(ca=True, path_length=None), critical=True)
        .sign(key, hashes.SHA256())
    )

    (CERTS_DIR / "server.key").write_bytes(
        key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.TraditionalOpenSSL,
            encryption_algorithm=serialization.NoEncryption(),
        )
    )
    (CERTS_DIR / "server.crt").write_bytes(cert.public_bytes(serialization.Encoding.PEM))
    print(f"Wrote {CERTS_DIR / 'server.crt'} and {CERTS_DIR / 'server.key'} (self-signed, localhost, 365d)")


if __name__ == "__main__":
    generate()

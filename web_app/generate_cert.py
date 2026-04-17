import os
import socket
import ipaddress
from datetime import datetime, timedelta

try:
    from cryptography import x509
    from cryptography.x509.oid import NameOID
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.hazmat.primitives import serialization
except ImportError:
    print("cryptography module not found. Skipping cert generation.")
    exit(0)

def generate_self_signed_cert():
    if os.path.exists("cert.pem") and os.path.exists("key.pem"):
        print("[INFO] SSL Certificates already exist.")
        return

    print("[INFO] Generating new SSL Certificates for HTTPS...")
    
    # Get local IP
    hostname = socket.gethostname()
    try:
        local_ip = socket.gethostbyname(hostname)
    except:
        local_ip = "127.0.0.1"

    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    
    subject = issuer = x509.Name([
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, u"Hospital Equipment Verify"),
        x509.NameAttribute(NameOID.COMMON_NAME, local_ip),
    ])
    
    try:
        san = x509.SubjectAlternativeName([
            x509.DNSName(u"localhost"),
            x509.IPAddress(ipaddress.IPv4Address(local_ip)),
            x509.IPAddress(ipaddress.IPv4Address("127.0.0.1")),
        ])
    except:
        san = x509.SubjectAlternativeName([x509.DNSName(u"localhost")])

    cert = x509.CertificateBuilder().subject_name(
        subject
    ).issuer_name(
        issuer
    ).public_key(
        key.public_key()
    ).serial_number(
        x509.random_serial_number()
    ).not_valid_before(
        datetime.utcnow() - timedelta(days=1)
    ).not_valid_after(
        datetime.utcnow() + timedelta(days=3650)
    ).add_extension(
        san,
        critical=False,
    ).sign(key, hashes.SHA256())

    with open("key.pem", "wb") as f:
        f.write(key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.TraditionalOpenSSL,
            encryption_algorithm=serialization.NoEncryption(),
        ))
        
    with open("cert.pem", "wb") as f:
        f.write(cert.public_bytes(serialization.Encoding.PEM))

if __name__ == "__main__":
    generate_self_signed_cert()

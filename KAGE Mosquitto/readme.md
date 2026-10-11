# MQTT Setup (Mosquitto)

This note covers the complete KAGE MQTT setup from:

```text
Local MQTT
192.168.1.23:1883
No TLS
        ↓
Local MQTT + TLS
192.168.1.23:8883
        ↓
Domain / Internet / Managed MQTT Provider
```

---

# Part I (Local MQTT Without TLS)

Use this first to confirm that:

- Mosquitto works.
- Hub credentials work.
- MQTT topics work.
- ESP32 can reach the broker.
- Windows Firewall is configured correctly.

At this stage:

```text
Protocol: MQTT over TCP
Port: 1883
Encryption: None
Authentication: Username + Password
```

---

## 1. Project Structure

A simple KAGE Mosquitto directory:

```text
KAGE Mosquitto/
├── mosquitto.conf
└── passwd
```

Later, when TLS is added:

```text
KAGE Mosquitto/
├── mosquitto.conf
├── passwd
└── certs/
    ├── ca.crt
    ├── ca.key
    ├── broker.crt
    ├── broker.key
    ├── broker.csr
    └── broker-ext.cnf
```

---

# 2. Create MQTT Users

## First Hub Only

Use `-c` only when creating the password file for the first time.

```powershell
mosquitto_passwd -c ./passwd HUB-01
```

Enter the Hub Token/password when prompted.

## Adding More Hubs

Do **not** use `-c`.

```powershell
mosquitto_passwd ./passwd HUB-02
```

For another Hub:

```powershell
mosquitto_passwd ./passwd HUB-03
```

Using `-c` again would recreate the password file and remove the existing users.

---

# 3. Initial Non-TLS Mosquitto Configuration

Create:

```text
mosquitto.conf
```

with:

```conf
listener 1883

allow_anonymous false
password_file ./passwd
```

This gives:

```text
Mosquitto
│
├── Port 1883
├── Plain MQTT
└── Username/password authentication
```

---

# 4. Allow MQTT Through Windows Firewall

Open **PowerShell as Administrator**.

For normal MQTT:

```powershell
New-NetFirewallRule `
    -DisplayName "KAGE Mosquitto MQTT 1883" `
    -Direction Inbound `
    -Protocol TCP `
    -LocalPort 1883 `
    -Action Allow
```

We will also use port `8883` later for TLS, so allow it too:

```powershell
New-NetFirewallRule `
    -DisplayName "KAGE Mosquitto MQTT TLS 8883" `
    -Direction Inbound `
    -Protocol TCP `
    -LocalPort 8883 `
    -Action Allow
```

Therefore KAGE development allows:

```text
1883 → Plain MQTT
8883 → MQTT over TLS
```

Check them if necessary:

```powershell
Get-NetFirewallRule `
    -DisplayName "KAGE Mosquitto MQTT 1883"

Get-NetFirewallRule `
    -DisplayName "KAGE Mosquitto MQTT TLS 8883"
```

Test whether the broker machine is reachable:

```powershell
Test-NetConnection 192.168.1.23 -Port 1883
```

Later for TLS:

```powershell
Test-NetConnection 192.168.1.23 -Port 8883
```

Expected:

```text
TcpTestSucceeded : True
```

---

# 5. Start Mosquitto

From the `KAGE Mosquitto` directory:

```powershell
mosquitto -c ./mosquitto.conf -v
```

Expected:

```text
Opening ipv4 listen socket on port 1883.
mosquitto version ... running
```

---

# 6. Subscribe (Non-TLS)

Use the broker's LAN address:

```powershell
mosquitto_sub `
    -h 192.168.1.23 `
    -p 1883 `
    -u HUB-01 `
    -P "<Hub Token>" `
    -t "kage/#" `
    -v
```

`kage/#` means:

```text
Subscribe to everything underneath:

kage/
```

For example:

```text
kage/hub/HUB-01/status
kage/hub/HUB-01/pairing_response/...
kage/hub/HUB-02/status
```

### Important — Avoid the `localhost` Trap

For KAGE testing, prefer:

```text
192.168.1.23
```

instead of:

```text
localhost
```

We previously had two Mosquitto instances:

```text
localhost:1883 / [::1]:1883
→ Windows Mosquitto service

192.168.1.23:1883
→ manually started KAGE Mosquitto
```

The ESP32 was connected to one broker while `mosquitto_pub/sub -h localhost` was talking to another.

Therefore use the same LAN address as the Hub:

```text
192.168.1.23
```

when testing KAGE.

Useful check:

```powershell
Get-NetTCPConnection -LocalPort 1883 |
Format-Table LocalAddress, LocalPort, State, OwningProcess
```

---

# 7. Publish (Non-TLS)

```powershell
mosquitto_pub `
    -h 192.168.1.23 `
    -p 1883 `
    -u HUB-01 `
    -P "<Hub Token>" `
    -t "kage/hub/HUB-01/status" `
    -m "online"
```

This means:

```text
Connect to:
192.168.1.23:1883

Authenticate as:
HUB-01

Publish:
online

To:
kage/hub/HUB-01/status
```

---

# Part II (Moving from Plain MQTT to TLS)

Now upgrade:

```text
192.168.1.23:1883
Plain MQTT
        ↓
192.168.1.23:8883
MQTT over TLS
```

TLS provides:

```text
Encryption
+
Broker identity verification
```

KAGE still uses:

```text
Hub ID
+
Hub Token
```

for MQTT authentication.

Therefore:

```text
TLS certificate
→ verifies the broker

Hub ID + Hub Token
→ verifies/authenticates the Hub
```

---

# 9. Create the Certificate Directory

Create:

```text
certs/
```

Result:

```text
KAGE Mosquitto/
├── mosquitto.conf
├── passwd
└── certs/
```

---

# 10. Create the KAGE Certificate Authority

Generate the CA private key:

```powershell
openssl genrsa -out certs/ca.key 2048
```

Then generate the CA certificate:

```powershell
openssl req -x509 -new `
-key certs/ca.key `
-sha256 `
-days 3650 `
-out certs/ca.crt `
-subj "/O=Arasaka Corporation/OU=KAGE Workspace Systems/CN=KAGE Local CA" `
-addext "basicConstraints=critical,CA:TRUE" `
-addext "keyUsage=critical,keyCertSign,cRLSign" `
-addext "subjectKeyIdentifier=hash"
```

The important parts are:

```text
CA:TRUE
```

and:

```text
Certificate Sign
CRL Sign
```

Without proper CA extensions, the ESP32 certificate verification failed even though desktop OpenSSL could still accept the CA explicitly.

---

# 11. Verify the CA Certificate

```powershell
openssl x509 `
    -in ./certs/ca.crt `
    -noout `
    -ext basicConstraints `
    -ext keyUsage
```

Expected:

```text
X509v3 Basic Constraints: critical
    CA:TRUE

X509v3 Key Usage: critical
    Certificate Sign, CRL Sign
```

If it says:

```text
No extensions in certificate
```

the CA certificate is not correct for this setup.

---

# 12. Windows OpenSSL Config Error

If OpenSSL gives:

```text
Can't open "...openssl.cnf"
```

and Conda is being used, check:

```powershell
Test-Path "$env:CONDA_PREFIX\Library\ssl\openssl.cnf"
```

If:

```text
True
```

set:

```powershell
$env:OPENSSL_CONF =
"$env:CONDA_PREFIX\Library\ssl\openssl.cnf"
```

Then retry the OpenSSL command.

Alternatively specify the config directly where necessary:

```powershell
-config "$env:CONDA_PREFIX\Library\ssl\openssl.cnf"
```

---

# 13. Create the Broker Private Key

```powershell
openssl genrsa -out certs/broker.key 2048
```

---

# 14. Create the Broker CSR

```powershell
openssl req -new `
    -key certs/broker.key `
    -out certs/broker.csr
```

For the current local broker:

```text
Country Name:
.

State:
.

Locality:
.

Organization:
Arasaka Corporation

Organizational Unit:
KAGE Workspace Systems

Common Name:
192.168.1.23

Email:
.
```

Leave:

```text
Challenge password
```

blank.

The CA should be:

```text
CN = KAGE Local CA
```

while the broker should be:

```text
CN = 192.168.1.23
```

They are different certificates.

---

# 15. Create Broker Certificate Extensions

Create:

```text
certs/broker-ext.cnf
```

For the working local ESP32 setup:

```ini
basicConstraints = critical,CA:FALSE
keyUsage = critical,digitalSignature,keyEncipherment
extendedKeyUsage = serverAuth

subjectAltName = IP:192.168.1.23,DNS:192.168.1.23

subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid,issuer
```

The important local setting is:

```ini
subjectAltName = IP:192.168.1.23,DNS:192.168.1.23
```

Normally:

```ini
IP:192.168.1.23
```

is the correct IP SAN.

However, with the ESP32 TLS stack used by KAGE, certificate verification only worked reliably after also adding:

```ini
DNS:192.168.1.23
```

Therefore keep both for this local development certificate.

---

# 16. Sign the Broker Certificate

```powershell
openssl x509 -req `
    -in certs/broker.csr `
    -CA certs/ca.crt `
    -CAkey certs/ca.key `
    -CAcreateserial `
    -out certs/broker.crt `
    -days 825 `
    -sha256 `
    -extfile certs/broker-ext.cnf
```

This creates:

```text
broker.crt
```

signed by:

```text
KAGE Local CA
```

---

# 17. Verify the Broker Certificate

Check the chain:

```powershell
openssl verify `
    -CAfile ./certs/ca.crt `
    ./certs/broker.crt
```

Expected:

```text
./certs/broker.crt: OK
```

Check the SAN:

```powershell
openssl x509 `
    -in ./certs/broker.crt `
    -noout `
    -ext subjectAltName
```

Expected:

```text
X509v3 Subject Alternative Name:
    IP Address:192.168.1.23, DNS:192.168.1.23
```

Check the other extensions:

```powershell
openssl x509 `
    -in ./certs/broker.crt `
    -noout `
    -ext basicConstraints `
    -ext keyUsage `
    -ext extendedKeyUsage `
    -ext subjectAltName
```

Expected approximately:

```text
Basic Constraints:
    CA:FALSE

Key Usage:
    Digital Signature, Key Encipherment

Extended Key Usage:
    TLS Web Server Authentication

Subject Alternative Name:
    IP Address:192.168.1.23
    DNS:192.168.1.23
```

---

# 18. Mosquitto Configuration During Migration

During development, keep **both listeners**:

```conf
# =========================================================
# Plain MQTT
# =========================================================

listener 1883

allow_anonymous false
password_file ./passwd


# =========================================================
# MQTT over TLS
# =========================================================

listener 8883

allow_anonymous false
password_file ./passwd

cafile ./certs/ca.crt
certfile ./certs/broker.crt
keyfile ./certs/broker.key
```

This gives:

```text
Mosquitto
│
├── 1883
│   └── Plain MQTT
│
└── 8883
    └── MQTT over TLS
```

This is useful while migrating because old clients can temporarily remain on:

```text
1883
```

while KAGE Hubs are tested on:

```text
8883
```

Once production TLS is fully established, plaintext `1883` should not be exposed publicly.

---

# 19. Restart Mosquitto After Certificate Changes

Whenever you modify:

```text
broker.crt
broker.key
ca.crt
mosquitto.conf
```

restart Mosquitto.

Stop the running process:

```text
Ctrl + C
```

then:

```powershell
mosquitto -c ./mosquitto.conf -v
```

Expected:

```text
Opening ipv4 listen socket on port 1883.
Opening ipv4 listen socket on port 8883.
mosquitto version ... running
```

---

# 20. Verify TLS Directly

Before debugging the ESP32, verify the broker itself.

```powershell
openssl s_client `
    -connect 192.168.1.23:8883 `
    -CAfile ./certs/ca.crt `
    -verify_ip 192.168.1.23 `
    -verify_return_error
```

Expected:

```text
Verification: OK
```

and:

```text
Verify return code: 0 (ok)
```

This confirms:

```text
Broker certificate
        ↓
signed by KAGE Local CA
        ↓
certificate valid
        ↓
192.168.1.23 identity valid
```

---

# 21. Subscribe Using TLS

```powershell
mosquitto_sub `
    -h 192.168.1.23 `
    -p 8883 `
    --cafile ./certs/ca.crt `
    -u HUB-01 `
    -P "<Hub Token>" `
    -t "kage/#" `
    -v
```

The important addition compared with `1883` is:

```powershell
--cafile ./certs/ca.crt
```

---

# 22. Publish Using TLS

```powershell
mosquitto_pub `
    -h 192.168.1.23 `
    -p 8883 `
    --cafile ./certs/ca.crt `
    -u HUB-01 `
    -P "<Hub Token>" `
    -t "kage/hub/HUB-01/status" `
    -m "online"
```

Flow:

```text
mosquitto_pub
        ↓
192.168.1.23:8883
        ↓
Verify broker with ca.crt
        ↓
Establish encrypted TLS
        ↓
Authenticate HUB-01
        ↓
Publish MQTT message
```

---

# 28. Successful TLS Connection

A successful Mosquitto log looks similar to:

```text
New connection from 192.168.1.31:xxxxx on port 8883.

New client connected from 192.168.1.31:xxxxx
as HUB-01

Will message specified

kage/hub/HUB-01/status

Client HUB-01 negotiated TLSv1.2
cipher ECDHE-RSA-AES256-GCM-SHA384

Sending CONNACK to HUB-01

Received SUBSCRIBE from HUB-01

kage/hub/HUB-01/pairing_response/+
```

This confirms:

```text
Wi-Fi                              ✅
Port 8883                          ✅
TLS handshake                      ✅
CA verification                    ✅
Broker identity verification       ✅
MQTT Hub authentication            ✅
Last Will                          ✅
Subscriptions                      ✅
```

---

# Part III — Using a Domain Instead of the Local IP

Using:

```text
mqtt.kage.example
```

is preferable to permanently using:

```text
192.168.1.23
```

because the server IP can change without changing Hub firmware.

---

# 29. DNS

Create a DNS record:

```text
mqtt.kage.example
        ↓
Broker IP address
```

---

# 30. Domain Broker Certificate

The broker certificate must contain the same hostname used by the client.

For:

```text
mqtt.kage.example
```

use:

```ini
basicConstraints = critical,CA:FALSE
keyUsage = critical,digitalSignature,keyEncipherment
extendedKeyUsage = serverAuth

subjectAltName = DNS:mqtt.kage.example

subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid,issuer
```

The broker CSR Common Name can also be:

```text
mqtt.kage.example
```

Then re-sign:

```powershell
openssl x509 -req `
    -in certs/broker.csr `
    -CA certs/ca.crt `
    -CAkey certs/ca.key `
    -CAcreateserial `
    -out certs/broker.crt `
    -days 825 `
    -sha256 `
    -extfile certs/broker-ext.cnf
```

Restart Mosquitto afterward.

---

# 31. Domain and Certificate Must Match

If the ESP32 connects using:

```cpp
mqttServer = "mqtt.kage.example";
```

the certificate must contain:

```text
DNS:mqtt.kage.example
```

The identity flow is:

```text
mqtt.kage.example
        ↓
Broker presents certificate
        ↓
Certificate SAN contains:
DNS:mqtt.kage.example
        ↓
Identity verified
```

---

# 32. Supporting Both Domain and Local IP

A certificate can contain both:

```ini
subjectAltName = DNS:mqtt.kage.example,IP:192.168.1.23
```

If the ESP32 local-IP compatibility workaround is still required:

```ini
subjectAltName = DNS:mqtt.kage.example,IP:192.168.1.23,DNS:192.168.1.23
```

For normal production use through the domain, the important identity is:

```text
DNS:mqtt.kage.example
```

---

# 33. Command-Line Client Using the Domain

```powershell
mosquitto_sub `
    -h mqtt.kage.example `
    -p 8883 `
    --cafile ./certs/ca.crt `
    -u HUB-01 `
    -P "<Hub Token>" `
    -t "kage/#" `
    -v
```

Publishing:

```powershell
mosquitto_pub `
    -h mqtt.kage.example `
    -p 8883 `
    --cafile ./certs/ca.crt `
    -u HUB-01 `
    -P "<Hub Token>" `
    -t "kage/hub/HUB-01/status" `
    -m "online"
```

---

# Part IV (Making the Broker Accessible Over the Internet)

A domain alone does **not** make a local Mosquitto broker internet-accessible.

For a self-hosted broker:

```text
KAGE Hub
    ↓
Internet
    ↓
mqtt.kage.example
    ↓
Public IP
    ↓
Router
    ↓ TCP 8883 port forwarding
192.168.1.23:8883
    ↓
Mosquitto
```

Required infrastructure:

```text
DNS record
        ↓
Public IP

Router
        ↓
TCP 8883 forwarded to MQTT server

Windows Firewall
        ↓
TCP 8883 allowed

Mosquitto
        ↓
TLS listener on 8883
```

Do **not** expose plaintext:

```text
1883
```

to the public Internet.

Port `1883` can remain available for local development if required.

---

# Final KAGE Development Configuration

During development:

```text
                    MOSQUITTO
                        │
          ┌─────────────┴─────────────┐
          │                           │
       TCP 1883                    TCP 8883
          │                           │
     Plain MQTT                  MQTT + TLS
          │                           │
 Username/password       Certificate verification
                                      +
                             Username/password
```

Windows Firewall allows:

```text
TCP 1883
TCP 8883
```

KAGE ESP32 Hub should ultimately use:

```text
192.168.1.23:8883
```

or preferably later:

```text
mqtt.kage.example:8883
```

These must remain secret:

```text
ca.key
broker.key
passwd
Hub Tokens
Wi-Fi passwords
other private credentials
```

A suitable `.gitignore`:

```gitignore
# Private cryptographic keys
*.key

# Mosquitto credentials
passwd

# Environment / secrets
.env
.env.*

secrets.*
credentials.*
```

The most sensitive certificate-related file is:

```text
ca.key
```

because anyone possessing the CA private key could issue certificates that KAGE Hubs would trust.
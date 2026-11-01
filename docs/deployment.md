# Deploying the fga console

This guide puts the console into production next to a running fga: its
own machine, HTTPS for people, the organisation's login for sign-in, and a
certificate that names it to fga.

```
people ──HTTPS──> fga-console ──HTTPS + console certificate──> fga-storage      (file API)
   │                   │                                       fga-admin serve  (admin API)
   │                   └──HTTPS──> login service (OIDC): discovery, keys, tokens
   └──HTTPS──> login service: the person signs in there, never at the console
```

fga decides every request. The console holds each signed-in person's
tokens on the server and passes the access token to fga with each call; it
keeps no files, holds no file keys and never sees a password.

## 1. Certificates

The console needs three things:

| What | Used for | Setting |
|---|---|---|
| An HTTPS certificate for the console's public name | people's browsers | `tls.cert_file`, `tls.key_file` |
| A client certificate naming the console | fga's admin API checks it against its `consoles` list (URI SAN, else common name) | `fga_tls.cert_file`, `fga_tls.key_file` |
| The CA that fga's services' certificates chain to | the console trusts only fga's own servers | `fga_tls.ca_file` |

The console presents its certificate to every fga service it reaches, and
each of them checks a presented certificate against its own
`tls.client_ca_file`. So the CA that issues it must be in the
`client_ca_file` of fga-storage and of `fga-admin serve`; otherwise they
refuse the connection. For example, with that CA's files `consoles-ca.crt`
and `consoles-ca.key`:

```bash
openssl req -new -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes -keyout console.key -subj "/CN=fga-console" -out console.csr
```
```bash
printf 'subjectAltName=URI:spiffe://example.org/fga-console\nextendedKeyUsage=clientAuth\n' > console.ext
```
```bash
openssl x509 -req -in console.csr -CA consoles-ca.crt -CAkey consoles-ca.key -CAcreateserial -days 365 -extfile console.ext -out console.crt
```

Then name the console in fga's admin API settings (`admin.json`):

```json
"consoles": ["spiffe://example.org/fga-console"]
```

Keep `console.key` readable only by the console's service account (mode
0600). fga's services require TLS 1.3; the console uses it to reach them.

## 2. The organisation's login (OIDC)

Register the console with the login service (Keycloak, Entra ID, Okta,
Auth0 and others) as a **confidential client**:

- client ID `fga-console`, with a client secret;
- grant: authorization code with PKCE (S256), and refresh tokens;
- redirect URI `https://console.example.org/auth/callback`;
- post-sign-out redirect URI `https://console.example.org/`.

The **access tokens** it issues are what fga checks, so they must fit
fga's first-hop authentication:

- a JWT signed with EdDSA, ES256 or RS256 by a key in the provider's key set;
- `aud` includes `fga-storage`, and `fga-admin` for administrators (one
  token with both audiences serves both APIs);
- claims `sub` (the person's fga identity ID), `jti`, `iat`, `exp`, and
  `fga_tenant` (the tenant, for example `t-acme`);
- a lifetime within fga's `max_lifetime` (1 hour by default);
- JOSE type `at+jwt`. Look at the `typ` header of a sample access token:
  if the provider types them `JWT`, fga's `token_issuer` needs
  `"token_types": ["JWT"]`, and then its ID tokens must never carry fga's
  audiences.

In Keycloak, for example: an *audience* mapper for `fga-storage` and one for
`fga-admin`, a *hardcoded claim* mapper for `fga_tenant`, and an access
token lifespan of at most an hour. Providers that choose an access token's
audience by a sign-in parameter take it from `oidc.auth_params`, such as
`{"audience": "fga"}` (Auth0) or `{"resource": "https://fga.example.org"}`.

Point fga at the provider in `fga-storage`'s and `fga-admin serve`'s
`token_issuer`:

```json
"token_issuer": {"issuer": "https://login.example.org/realms/acme",
                 "jwks_url": "https://login.example.org/realms/acme/protocol/openid-connect/certs"}
```

The console reads the **ID token** to know who signed in. Its claim named
by `oidc.person_claim` (default `sub`) must equal the access token's `sub`,
the name fga knows the person by.

## 3. The console's settings

`/etc/fga-console/console.json`:

```json
{
  "version": 1,
  "profile": "production",
  "listen": "0.0.0.0:443",
  "public_url": "https://console.example.org",
  "tls": {"cert_file": "/etc/fga-console/https.crt", "key_file": "/etc/fga-console/https.key"},
  "tenant": "t-acme",
  "organisation": "Acme",
  "storage_url": "https://fga-store-1.internal:28441",
  "admin_url": "https://fga-core-1.internal:8450",
  "fga_tls": {"ca_file": "/etc/fga-console/fga-ca.crt",
              "cert_file": "/etc/fga-console/console.crt", "key_file": "/etc/fga-console/console.key"},
  "oidc": {"issuer": "https://login.example.org/realms/acme", "client_id": "fga-console",
           "client_secret_file": "/etc/fga-console/oidc-secret"},
  "spaces": ["shared", "reports"],
  "data_dir": "/var/lib/fga-console",
  "services": [
    {"name": "fga-storage", "purpose": "Stores files and documents", "host": "fga-store-1",
     "health": "https://fga-store-1.internal:28441/readyz"}
  ]
}
```

| Setting | Meaning |
|---|---|
| `profile` | `production` refuses plain HTTP, development sign-in, and a missing HTTPS certificate or console certificate |
| `public_url` | the console's origin as people reach it; sign-in returns to `public_url/auth/callback` |
| `spaces` | the spaces the Files page offers; fga still decides, per person, which of them they may list |
| `data_dir` | the console's own records: profiles, a rule draft, which shares were given together |
| `services` | health addresses for the Servers page |
| `session_hours` | how long a sign-in lasts at most (default 8); idle sessions end after 30 minutes |
| `max_upload_mb` | the largest upload (default 512) |
| `oidc.scopes` | default `openid profile` |
| `oidc.token_auth` | `basic` (default) or `post`, as the provider expects the client secret |

The console checks its settings when it starts and names every problem.

## 4. Running it

Build it from the repository, outside the repository's folder:

```bash
go build -o /usr/local/bin/fga-console ./cmd/fga-console
```

A systemd unit, `/etc/systemd/system/fga-console.service`:

```ini
[Unit]
Description=fga console
After=network-online.target

[Service]
User=fga-console
ExecStart=/usr/local/bin/fga-console -config /etc/fga-console/console.json
Restart=on-failure
AmbientCapabilities=CAP_NET_BIND_SERVICE
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=/var/lib/fga-console

[Install]
WantedBy=multi-user.target
```

```bash
systemctl enable --now fga-console
```

Then check:

- `https://console.example.org/` shows "Sign in with Acme";
- signing in returns to the console, and Files lists the person's spaces;
- an administrator listed in fga's `admin.json` sees Administration, and
  Servers shows every service answering.

## 5. Operating it

- **Logs** go to standard error (the journal under systemd). They name
  routes, results and people; they never hold tokens or keys.
- **Sessions** live in memory: restarting the console signs everyone out.
- **Back up** `data_dir`; it holds the profiles, a rule draft and the share
  batches. Everything else lives in fga.
- **Rule changes** leave the console as an exported draft. Sign it on the
  computer that keeps the publisher key (`fga policy sign`), then restart
  fga-decision with it; the publisher key never reaches the console.
- **Server settings** leave the console as files; put them on the server
  and restart the service there. The console never changes a running
  server.
- **Development sign-in** (`dev_signin`) is for a demo on one machine: the
  console mints passes itself with the development issuer's key. It is
  refused in production and off loopback.

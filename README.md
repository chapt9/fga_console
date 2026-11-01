# fga console

A web console for [fga](https://github.com/chapt9/fga). People sign in and
work with what fga lets them see; administrators manage people, rights,
spaces and rules.

The console is its own program, `fga-console`, and can run on its own
machine. It talks to fga only over fga's HTTP APIs, with each signed-in
person's own pass, never to fga's database. fga decides every request; the
console never judges access, keeps no files and holds no file keys.

```
browser ──HTTPS──> fga-console ──HTTPS──> fga-storage (file API) ──> fga-decision, fga-keys, fga-kms
                    sessions,               fga-admin serve (admin API)
                    passes
```

## Status

Parts 1 to 3 work against a running fga; part 4 is under way. To put the
console into production, see [docs/deployment.md](docs/deployment.md).

### Part 1: people's own pages

- development sign-in: pick a person, and the console mints short-lived
  passes in fga's format with the development issuer's key;
- **Files**: the spaces fga lets the person list, folders, search,
  download, preview of small text files, upload (spaces encrypted by fga),
  delete, sensitivity (lowering may need an approval), who a file is shared
  with, and opening a file shared with you by its name;
- **Give access**: many files at once (filters, Choose all, whole folders,
  shift-click ranges, several spaces). fga decides each share and the page
  shows its answer per file. **Access you gave** takes a whole batch back;
- **Approvals**: the requests fga lets the person decide.

End-to-end encrypted spaces are listed, but their files are still opened
and uploaded with the fga program, which holds the person's keys (part 4).

### Part 2: the administrator's pages

Who is an administrator is decided by fga's admin API (its `admin.json`),
never by the console. An administrator's actions go to the admin API with
their own pass, and fga checks and records each one.

- **Overview** from fga's own counts, latest events and service health;
- **People**: rights (each a set of fga capabilities), projects and team
  leads (the `projects` and `leads` attributes the rules test), roles,
  disabling; filters such as "cannot share", and changes for many people
  at once. Taking a right never takes a capability another kept right
  needs. Disabling the last person who can open some end-to-end encrypted
  files asks first, with the number of files per space, because fga keeps
  no other copy of their keys;
- **Invitations** (with the organisation's login only): see "Inviting
  people" below;
- **Rights and profiles**: the console's rights, and profiles (ready-made
  sets of rights) kept in the console's data folder;
- **AI agents**: permissions to act for someone (fga delegations);
- **Spaces**: list and create;
- **Rules**: the signed rules in plain words; editing makes a draft, kept
  by the console and exported for signing outside it;
- **Audit log**: fga's latest events;
- **Servers**: each configured service's health, checked live, and
  settings files to export (never pushed to a running server).

### Part 3: production

- **Sign-in with the organisation's login** (OpenID Connect, authorization
  code flow with PKCE): the console checks the ID token (signature,
  issuer, audience, times, nonce), keeps the person's tokens on the
  server, passes the access token to fga, renews it before it expires, and
  signs out through the login service. A sign-in started in one browser
  cannot be finished in another.
- **HTTPS** for people, with `__Host-` cookies and strict transport
  security.
- **The console's certificate to fga**: TLS 1.3, trusting only fga's CA;
  fga's admin API names the console by it.
- **A production profile** that refuses plain HTTP, development sign-in
  and missing certificates, and names every problem at start.

### Part 4: the web console only (under way)

The aim: nobody needs SSH, the command line or a password; everyone works
in the console and sees only what their rights allow.

- **Pages by rights** (done): the console asks fga's `GET /v1/me` with the
  person's own pass, at most once a minute, and shows each page and button
  only to people holding its right. The right **Use the web console**
  (fga capability `principal.self` `read`) decides who may use the
  console's own pages at all; it is in every default profile except "No
  rights". Administrators keep the administrator pages, which fga's admin
  API decides.
- **Invitations** (done): see "Inviting people".
- **Keys in the browser** (started): `web/fga-profile1.mjs` is fga's
  client encryption profile 1 written a second time for the browser, on
  WebCrypto only. It is checked against fga's Go SDK in both directions
  (see "Tests") and in a real browser. No page uses it yet: the custody
  record in fga and the pages that make, unlock and use the keys (with a
  key file the person keeps) come next. The design is fga's
  `docs/design/browser-client.md`.

Still needing changes in fga first: projects as something fga knows,
removing spaces, the access graph, and a check-access call.

### Gaps in fga's file API

The console shows what fga's file API offers, and nothing made up:

- there is no "spaces I may see": the console asks fga about each space in
  its configuration;
- there is no "files shared with me": a person opens such a file by name;
- a listing gives a file's name, stored (encrypted) size and date, not its
  owner or sensitivity;
- there is no "what may I do with this file?", so for a single file fga's
  refusal is shown in plain words instead;
- there is no person's own activity, and no directory search for people.

## Running it

### What it needs

- Go (the version in `go.mod`) to build it; nothing else at run time.
- A running fga at commit `ecf4617` or later (it needs `GET /v1/me` and the
  `principal.self` type): `fga-storage` (file API) with `fga-decision`,
  `fga-keys` and `fga-kms` behind it, and `fga-admin serve` (admin API) for
  the administrator pages. fga's README, "Run the storage roles locally",
  shows how; `scripts/smoke.sh` there writes a working configuration for
  each role, and fga's `docs/design/admin-api.md` describes `admin.json`.
- fga's signed rules must allow people to read their own record. fga's
  example bundle has the rule (`examples/local/bundle/policies/self.json`):

  ```json
  {"id":"own-record","effect":"allow","actions":["read"],"roles":["*"],"when":"resource.attributes.principal == principal.id"}
  ```

  Adding the `principal.self` type changed the registry digests signed
  bundles carry, so a bundle signed before fga `825038e` must be signed
  again (`fga policy sign`).
- Node.js only to run the browser-crypto tests.

### Build and start

Build it outside the repository and start it with a configuration file:

    go build -o /tmp/fga-console ./cmd/fga-console
    /tmp/fga-console -config console.json

It logs one line per API request (its route, status and time, never a
file name) and stops cleanly on Ctrl-C or SIGTERM.

### A development setup on one machine

With fga's roles on loopback, fga's admin API on port 18450 and `root` as
its administrator, this `console.json` uses development sign-in (pick a
person, no login service):

```json
{"version": 1, "listen": "127.0.0.1:28600", "tenant": "t-acme", "organisation": "Acme (demo)",
 "storage_url": "http://127.0.0.1:28441", "admin_url": "http://127.0.0.1:18450",
 "spaces": ["shared", "reports"], "data_dir": "data",
 "services": [{"name": "fga-storage", "purpose": "Stores files and documents", "host": "this machine",
               "health": "http://127.0.0.1:28441/readyz"}],
 "dev_signin": {"issuer": "fga-dev", "key_id": "tok-1", "key_file": "<fga-dev-issuer-key>",
                "people": ["root", "alice", "bob", "carl", "lena"]}}
```

- `key_file` is the private key of fga's development token issuer (the
  one fga's roles list as `fga-dev`, key ID `tok-1`).
- fga's admin API must name this console: in development, its
  `dev_console_id` (listed in its `consoles`); in production, the
  console's certificate (part 3).
- Development sign-in, and plain HTTP to fga, are refused unless the
  address is on this machine (loopback).

Then:

1. Open `http://127.0.0.1:28600` and pick `root` (the administrator).
2. Under **People**, give each person their rights, including **Use the
   web console**; or at the command line:
   `fga-admin -db URL grant -tenant t-acme -actor alice -type principal.self -actions read`.
3. Sign out, pick that person, and they see the pages their rights allow.
   Without **Use the web console** they see a page saying so, and the
   console refuses their requests.

### Settings

| Setting | Meaning |
|---|---|
| `version` | `1` |
| `profile` | `development` (default) or `production`, which requires HTTPS, the organisation's login and certificates to fga |
| `listen` | address and port the console serves |
| `public_url` | address people reach the console at (sign-in returns there; invitation links use it) |
| `tls` | `cert_file`, `key_file`: the console's HTTPS certificate |
| `tenant`, `organisation` | fga tenant, and the name shown on the pages |
| `storage_url` | fga's file API (`fga-storage`) |
| `admin_url`, `admin_audience` | fga's admin API (`fga-admin serve`) and its token audience (default `fga-admin`); without them there are no administrator pages |
| `fga_tls` | `ca_file`, `cert_file`, `key_file`: how the console reaches fga over HTTPS, with its own certificate |
| `spaces` | the spaces the console offers; each person sees those fga lets them list |
| `services` | `name`, `purpose`, `host`, `health` of fga's services, for the Servers page |
| `data_dir` | the console's own records: which shares were given together, profiles, the rule draft, invitations |
| `session_hours` | how long a sign-in lasts, 1 to 24 (default 8) |
| `max_upload_mb` | largest upload (default 512) |
| `oidc` | the organisation's login: `issuer`, `client_id`, `client_secret_file`, optional `scopes`, `auth_params`, `token_auth` (`basic` or `post`), `person_claim` (default `sub`) |
| `dev_signin` | development sign-in: `issuer`, `key_id`, `key_file`, `people` |

### Signing in with the organisation's login

Set `oidc` instead of `dev_signin`, and `public_url`. The login service
must issue access tokens fga accepts: `aud` with `fga-storage` (and
`fga-admin` for administrators), `sub` the person's fga name, and an
`fga_tenant` claim. Point fga's `token_issuer` at the same service.
[docs/deployment.md](docs/deployment.md) has the details, with Keycloak as
the example. Things found while running it with a local Keycloak 26:

- Keycloak types its access tokens `JWT`, so fga's `token_issuer` needs
  `"token_types": ["JWT"]`.
- fga fetches a key set only over HTTPS (`jwks_url`); a login service on
  plain HTTP needs its key set saved to a file (`jwks_file`).
- A sign-in that uses passkeys only cannot set up someone's first passkey
  from a user name alone (Keycloak refuses, rightly); the first passkey is
  registered through the login service's emailed one-time link.
- fga's roles accept one token issuer each.

### Inviting people

With the organisation's login, an administrator adds people without typing
the name the login knows them by:

1. **People** → **Invite someone**: a name, a profile, roles, projects and
   how long the link works (1 to 30 days). The console shows a one-time
   link once and keeps only its digest.
2. The person opens the link and signs in at the organisation's login. The
   console records the name the login gives them and shows that they wait
   for an administrator. fga does not know them yet, so they can do
   nothing.
3. Under **Invitations** the administrator presses **Add to fga**. The
   console creates the person in fga with the invitation's roles and
   projects and grants the profile's rights, through fga's admin API with
   the administrator's own pass. A person fga already knows is never
   replaced. The person sees their pages at once.

## The console's API

The pages use the console's own HTTP API under `/api`; scripts can use it
the same way. It is not fga's API: the console turns each call into calls
to fga with the signed-in person's pass, and fga decides them.

- **Sessions**: a cookie (`fga_console_session`, or
  `__Host-fga_console_session` over HTTPS) set at sign-in.
- **Changes** (anything but `GET`) must carry the header `X-Fga-Console: 1`
  and come from the console's own origin; other sites cannot send it.
  Sign-out is the exception: it needs only the session cookie, which other
  sites cannot send either (`SameSite=Strict`).
- **Answers** are JSON, except a download, which is the file itself
  (always as an attachment). Errors are `{"error": "CODE"}`: fga's own codes are
  passed through, and the console adds `UNAUTHENTICATED` (not signed in),
  `CROSS_SITE`, `INVALID_REQUEST`, `NOT_AN_ADMINISTRATOR`,
  `NO_CONSOLE_ACCESS` (no **Use the web console**), `UNKNOWN_PERSON`,
  `TOO_LARGE`, `UNAVAILABLE` (fga cannot be reached), `CONFLICT`,
  `ALREADY_KNOWN` and `INVITATIONS_NEED_LOGIN`. fga's admin API answers
  errors in words, which are passed through as they are.

| Method and path | What | Who |
|---|---|---|
| `GET /api/session` | who is signed in, `admin`, `access`, `rights`, `invited` | anyone |
| `POST /api/signin` `{"person"}` | development sign-in | people in `dev_signin` |
| `GET /auth/login`, `GET /auth/callback` | sign-in with the organisation's login | anyone |
| `GET /invite/{secret}` | an invitation's link: starts the sign-in | anyone |
| `POST /api/signout` | ends the session (answers the login service's sign-out address, if any) | signed in |
| `GET /api/spaces` | the configured spaces fga lets the person list, with their encryption | console users |
| `GET /api/files?space=&prefix=&continuation=` | a space's files | console users |
| `PUT /api/files?space=&key=[&replace=1]` | upload the request body (needs a length; without `replace=1` an existing file is never overwritten; header `X-Fga-Label` sets its sensitivity) | console users |
| `DELETE /api/files?space=&key=` | delete a file | console users |
| `GET /api/files/content?space=&key=` | download a file | console users |
| `GET /api/files/info?space=&key=` | a file's details | console users |
| `PUT /api/files/label?space=&key=` `{"label"}` | change its sensitivity | console users |
| `GET /api/shares?space=&key=`, `DELETE /api/shares?space=&key=&grantee=` | who a file is shared with; take one share back | console users |
| `POST /api/shares` `{"grantee","actions","days","files":[{"space","key"}]}` | give access to many files; fga's answer per file | console users |
| `GET /api/batches`, `POST /api/batches/{id}/take-back` | access the person gave, together; take a batch back | console users |
| `GET /api/approvals`, `POST /api/approvals/{id}` `{"decision"}` | requests the person may decide; `approve` or `reject` | console users |
| `GET /api/admin/people`, `PUT /api/admin/people/{id}`, `POST …/{id}/grant`, `…/revoke`, `…/disable` | fga's admin API: people, rights, disabling (`{"confirm_unreadable": true}` after a last-reader refusal) | administrators |
| `GET`, `POST /api/admin/delegations`, `POST …/{id}/revoke` | AI agents' permissions | administrators |
| `GET`, `POST /api/admin/spaces`; `GET /api/admin/rules`; `GET /api/admin/events` | spaces, signed rules, audit events | administrators |
| `GET /api/admin/rights`, `PUT /api/admin/profiles` | the console's rights and profiles | administrators |
| `GET`, `PUT`, `DELETE /api/admin/rules/draft` | the rule draft | administrators |
| `GET /api/admin/servers` | services' health | administrators |
| `GET`, `POST /api/admin/invitations`; `POST …/{id}/confirm`, `…/cancel` | invitations | administrators |

"Console users" are signed-in people whom fga lets read their own record
(**Use the web console**).

With development sign-in, from the command line:

```bash
curl -s -c cookies -H 'X-Fga-Console: 1' -d '{"person":"alice"}' http://127.0.0.1:28600/api/signin
```

```bash
curl -s -b cookies http://127.0.0.1:28600/api/session
```

```bash
curl -s -b cookies 'http://127.0.0.1:28600/api/files?space=shared'
```

```bash
curl -s -b cookies -X PUT -H 'X-Fga-Console: 1' --data-binary @notes.txt 'http://127.0.0.1:28600/api/files?space=shared&key=q4/notes.txt'
```

```bash
curl -s -b cookies -o notes.txt 'http://127.0.0.1:28600/api/files/content?space=shared&key=q4/notes.txt'
```

```bash
curl -s -b cookies -X POST -H 'X-Fga-Console: 1' http://127.0.0.1:28600/api/signout
```

## Tests

```bash
go test ./...
```

runs the console's tests against stand-ins for fga's file and admin APIs
that check every pass the console sends, and for a login service, which
can be told to misbehave.

```bash
node --test test/
```

checks the browser's profile 1 (`web/fga-profile1.mjs`) against vectors
written by fga's Go SDK (`test/vectors`, copied from the fga commit named in
`test/vectors/SOURCE`): exact bytes, fga's samples open, fga's negative
samples fail with the same error, and re-encrypting fga's samples gives
Tink's ciphertext byte for byte. The other direction runs in fga:

```bash
node test/produce-fga-samples.mjs <fga>/sdk/go/crypto/testdata/browser-produced-v1.json
```

writes what the browser makes, and fga's `go test ./sdk/go/crypto -run TestBrowserProduced`
opens and verifies it. After fga's vectors change
(`go test ./sdk/go/crypto -run TestBrowserVectors -update` there), copy
`browser-v1.json` and `browser-v1-two-segments.bin` into `test/vectors` and
update `SOURCE`.

## Layout

| Path | What |
|---|---|
| `cmd/fga-console` | the program |
| `internal/console` | configuration, sign-in (development and OIDC), sessions, the console's API, rights and profiles, fga's `/v1/me`, invitations |
| `docs/deployment.md` | putting the console into production |
| `web` | the pages (plain JavaScript, CSS and SVG, no third-party code), built into the program; `fga-profile1.mjs` is the browser's encryption |
| `test` | the browser-encryption tests and fga's vectors (not built into the program) |
| `design-mockup` | the design mockup the pages were drawn from; not served |

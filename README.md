# fga console

A web console for [fga](https://github.com/chapt9/fga). People sign in and
work with what fga lets them see; administrators will manage people, rights,
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

All three parts work against a running fga. To put it into production,
see [docs/deployment.md](docs/deployment.md).

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

End-to-end encrypted spaces are listed, but their files are opened and
uploaded with the fga program, which holds the person's keys.

### Part 2: the administrator's pages

Who is an administrator is decided by fga's admin API (its `admin.json`),
never by the console. An administrator's actions go to the admin API with
their own pass, and fga checks and records each one.

- **Overview** from fga's own counts, latest events and service health;
- **People**: rights (each a set of fga capabilities), projects and team
  leads (the `projects` and `leads` attributes the rules test), roles,
  disabling; filters such as "cannot share", and changes for many people
  at once. Taking a right never takes a capability another kept right needs;
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

Still needing changes in fga first: projects as something fga knows,
removing spaces, the access graph, and a check-access call.

### Gaps in fga's file API

The console shows what fga's file API offers, and nothing made up:

- there is no "spaces I may see": the console asks fga about each space in
  its configuration;
- there is no "files shared with me": a person opens such a file by name;
- a listing gives a file's name, stored (encrypted) size and date, not its
  owner or sensitivity;
- fga's `GET /v1/me` tells the console a person's own rights, so each
  page and button shows only to people holding its right, and only people
  with the right "Use the web console" (`principal.self` `read`) use the
  console's own pages. There is still no "what may I do with this file?",
  so for a single file fga's refusal is shown in plain words instead;
- there is no person's own activity, and no directory search for people.

## Running it

Build it outside the repository and start it with a configuration file:

    go build -o /tmp/fga-console ./cmd/fga-console
    /tmp/fga-console -config console.json

For the fga demo (development profile, loopback only), with fga's admin
API on port 18450 and `root` as its administrator:

```json
{"version": 1, "listen": "127.0.0.1:28600", "tenant": "t-acme", "organisation": "Acme (demo)",
 "storage_url": "http://127.0.0.1:28441", "admin_url": "http://127.0.0.1:18450",
 "spaces": ["shared", "reports"], "data_dir": "data",
 "services": [{"name": "fga-storage", "purpose": "Stores files and documents", "host": "this machine",
               "health": "http://127.0.0.1:28441/readyz"}],
 "dev_signin": {"issuer": "fga-dev", "key_id": "tok-1", "key_file": "<demo>/issuer.key",
                "people": ["root", "alice", "bob", "carl", "lena"]}}
```

The admin API must name this console: in development, its
`dev_console_id` (listed in its `consoles`); in production, the console's
certificate (part 3).

Development sign-in, and plain HTTP to fga, are refused unless the address
is on this machine (loopback). `data_dir` keeps the console's own small
records (which shares were given together, profiles, a rule draft); fga
keeps everything else.

`go test ./...` runs the console's tests against stand-ins for fga's file
and admin APIs that check every pass the console sends, and for a login
service, which can be told to misbehave.

## Layout

| Path | What |
|---|---|
| `cmd/fga-console` | the program |
| `internal/console` | configuration, sign-in (development and OIDC), sessions, the console's API, rights and profiles |
| `docs/deployment.md` | putting the console into production |
| `web` | the pages (plain JavaScript, CSS and SVG, no third-party code), built into the program |
| `design-mockup` | the design mockup the pages were drawn from; not served, kept for parts 2 and 3 |

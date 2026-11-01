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
                    sessions,               fga-admin serve (admin API, part 2)
                    passes
```

## Status

Part 1 of 3 works against a running fga:

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

Next: part 2, the administrator's pages over fga's admin API (`fga-admin
serve`); part 3, sign-in with the organisation's login (OIDC), certificates
between the console and fga, and a deployment guide.

### Gaps in fga's file API

The console shows what fga's file API offers, and nothing made up:

- there is no "spaces I may see": the console asks fga about each space in
  its configuration;
- there is no "files shared with me": a person opens such a file by name;
- a listing gives a file's name, stored (encrypted) size and date, not its
  owner or sensitivity;
- there is no "what may I do here?", so buttons are not greyed out in
  advance; fga's refusal is shown in plain words instead;
- there is no person's own activity, and no directory search for people.

## Running it

Build it outside the repository and start it with a configuration file:

    go build -o /tmp/fga-console ./cmd/fga-console
    /tmp/fga-console -config console.json

For the fga demo (development profile, loopback only):

```json
{"version": 1, "listen": "127.0.0.1:28600", "tenant": "t-acme", "organisation": "Acme (demo)",
 "storage_url": "http://127.0.0.1:28441", "spaces": ["shared", "reports"], "data_dir": "data",
 "dev_signin": {"issuer": "fga-dev", "key_id": "tok-1", "key_file": "<demo>/issuer.key",
                "people": ["alice", "bob", "carl", "lena"]}}
```

Development sign-in, and plain HTTP to fga, are refused unless the address
is on this machine (loopback). `data_dir` keeps the console's own small
records (which shares were given together); fga keeps everything else.

`go test ./...` runs the console's tests against a stand-in for fga's file
API that checks every pass the console sends.

## Layout

| Path | What |
|---|---|
| `cmd/fga-console` | the program |
| `internal/console` | configuration, passes, sessions, the console's API |
| `web` | the pages (plain JavaScript, CSS and SVG, no third-party code), built into the program |
| `design-mockup` | the design mockup the pages were drawn from; not served, kept for parts 2 and 3 |

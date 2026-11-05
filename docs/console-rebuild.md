# Console rebuild: plan

Status: plan for the owner's OK, 4 November 2026. Nothing is built yet.

To be reworked: on 5 November 2026 the owner decided that all data is end-to-end encrypted and the servers never work on content. This plan still assumes normal folders whose content the console shows. See [agents-and-sensitive-data.md](agents-and-sensitive-data.md) for what that means for AI agents. It turns the clickable prototype (`design-mockup/end-user/`, not connected to fga) into the real console, connected to the running fga. The screens and rules come from [end-user-design.md](end-user-design.md).

## Approach

- **Same repository, new web pages.** Keep the Go server in `internal/console`, which already does sign-in (development and OIDC), sessions, passes, invitations and the admin proxies. Replace `web/` with the new design; the old pages stay in git history. Work on a new branch, `end-user-ui`, made from `data-builder` (the latest console work, not yet merged).
- **Same rules as today.** Plain JS, CSS and SVG, with no npm and no third-party code. Strict CSP. Pages are embedded in the binary. Plain words come from `web/words.js`.
- **fga decides.** Every request goes to fga with the signed-in person's own pass, never on someone else's behalf. The console adds server routes only to pass requests on.
- **Checked against the real fga.** Each stop ends with a click-through of the running demo, never stand-ins.
- **The prototype is temporary.** It stays uncommitted as a reference and is deleted when the rebuild is done.

## What fga offers, and where it goes

Most rows use routes that the console can already call. The "Console now" column says whether today's console uses them.

### For everyone, with the person's own pass

| fga function | Route(s) | Console now | New page |
|---|---|---|---|
| Who am I: rights, teams, status | `GET /v1/me` | yes | My access, sidebar |
| May I…? | fga-decision `POST /v1/check` | no | My access picture, share check |
| List, stat, open, upload, replace, delete files | `GET /objects`, `GET/PUT/DELETE /object`, `/object/content` | yes | Files |
| Versions and history of a file | `GET /object/versions` (history read with history rights) | no | File panel, "Versions" |
| Take copies out (export) | `GET/POST /object/export`, `POST /document/export(/content)` | partly | File panel, "Download a copy" |
| Sensitivity: set, raise, lower (lower may need approval) | `PUT /object/label`, `PUT /document/unit/label`, `PUT /derived/label` | yes for files | File panel, document sections |
| Approvals inbox | `GET /v1/approvals`, `POST /v1/approvals/{id}` | yes | Requests |
| Shares with an end date, take back | `POST/GET/DELETE /grants` | yes | Share dialog, Who has access, Shared by me |
| Space encryption setting | `GET/PUT /encryption` | no | Space settings (owner) |
| Text documents split into sections | `POST /documents`, `/documents/text`, `/document-uploads/{i}/finalize`, `GET /document/units`, `/units/select`, `/unit/content`, `/document/manifest`, `/original/content`, `DELETE /document` | no | Files: a document opens as sections, each with its own sensitivity |
| Document history | `GET /document/versions` | no | Document panel, "Versions" |
| Search names and details | `GET /documents/search` | no | "Find a file" on Home and Files |
| Outputs made from a file (summaries, extracts) | `POST/GET /derived/content`, `PUT /derived/label` | no | File panel, "Made from this file" |
| Live sources: layout and latest readings by part | `GET /v1/sources/{s}`, document unit routes | partly | Files: a source shows its parts |
| Data tools: list, try, call | `GET /v1/data-tools`, `POST /data-tools/preview`, `POST /data-tools/{n}/call` | preview only | Source page, "Tools on this data" |
| Business tools: list, run, and close unknown calls | fga-tools `GET /v1/tools`, `POST /v1/invocations`, `GET /v1/invocations/{id}`, `POST …/resolve`, `POST …/write-off` | no | Tools page; Requests for team leads |
| Locked folders: keys, envelopes, packages | keys role `/v1/recipients…`, `/v1/signing-keys…`, `/v1/envelopes…`; storage `/uploads…`, `…/package`, `…/ciphertext` | crypto only | The browser add-on, never the console's pages (E3) |
| Devices posting readings | `POST /v1/sources/{s}/readings(/begin)` | no | Not a web task (devices do it); shown as "How to send" on the source page |
| Classifier label proposals | `POST /object/label-proposals` | no | Not a web task (a classifier's signature); proposals can't be listed yet |

### For administrators, through the admin API

| fga function | Route(s) | Console now | New page |
|---|---|---|---|
| Who is an administrator | `GET /v1/admin/whoami` | yes | sidebar |
| People: list, create, change roles and attributes | `GET/PUT /v1/admin/identities…` | yes | People, person page, Change access |
| Disable a person, with the last-reader warning | `POST …/disable` (+ `confirm_unreadable`) | yes | Person page |
| Rights: grant and revoke presets or capabilities | `POST …/capabilities/grant`, `…/revoke` | yes | Change access |
| Assistants acting for a person | `GET/POST /v1/admin/delegations`, `POST …/revoke` | yes | Assistants; the person's own assistant page |
| Spaces: list, create (project, sensitivity, encryption) | `GET/POST /v1/admin/buckets` | yes | Teams and spaces |
| Turn on AI assistants for the organisation | `POST /v1/admin/mcp/enable` | no | Assistants, settings |
| Data sources: add, change, try a sample, review, turn off | `/v1/admin/sources…` | yes | Data sources (the current builder pages, restyled) |
| Data tools: add, change, review, turn off | `/v1/admin/data-tools…` | yes | Data tools (the current builder pages, restyled) |
| Signed rules in force | `GET /v1/admin/policy` | yes | Rule changes, "Rules in force" |
| Latest events | `GET /v1/admin/events` | yes | Activity |
| Console's own: invitations, rights profiles, rules draft and export, server health | console routes | yes | People (invite), Change access, Rule changes, Servers |

### Only on the server today (`fga-admin` commands)

These have no web route, and the admin API leaves bootstrap and recovery to `fga-admin` on purpose (ADM-003):
- key setup: `journal init`, `kek init/rotate`, `key protect/unprotect`, `backup-key generate`, `audit-key generate`;
- recovery: `backup`, `restore`, `reconcile`, `reclaim`;
- audit files: `audit export/verify/status`;
- signing keys and classifiers: `epoch raise`, `signing-key add/retire/compromise`, `classifier add/revoke`;
- revoking someone's key: `recipient revoke`.

The new **Server tasks** page lists each one in plain words, with what it does, when it's needed and the command to run on the server. It also shows any status the console can read, such as health and the version of the rules in force. The web page doesn't run them, so fga needs no change (decision E2).

## Stops

Each stop is explained before coding, built on `end-user-ui`, checked against the running demo, and committed. It's pushed only with the owner's OK.

1. **Shell, sign-in, Home and My access.**
   - New `web/`: sidebar by rights, plain words, light and dark themes.
   - My access: rights from `/v1/me`, and the picture from `POST /v1/check` with the person's own pass.
   - Needs a console setting for the decision role's address. The demo's `fga-decision` gets `public_audience`, a config line.
2. **Files.**
   - Spaces and files; upload, replace and delete; open; versions; download a copy.
   - Sensitivity, with lowering that may need an approval.
   - Who has access; sharing with a check first and an end date; Shared by me; take back.
   - Space settings for owners.
3. **Documents, live sources and search.**
   - A document opens as sections, each with its own sensitivity.
   - Document history; "made from this file" outputs.
   - A source shows its parts; "Tools on this data"; "Find a file" uses fga's search.
4. **Requests and tools.**
   - The approvals inbox (sensitivity and tool approvals).
   - "Ask the owner" requests, kept by the console and answered with a normal share.
   - The Tools page; team leads close unknown tool calls (resolve, write off).
5. **Assistants.**
   - A person's own assistant page, and the administrator's Assistants page (add, stop).
   - Turning AI assistants on; which data tools are published and who may use them.
6. **Administration.**
   - People: search and pages, the facts page, Change access, disable with the warning, invitations.
   - Teams and spaces; Data sources and Data tools (restyled builder pages).
   - Rule changes: draft, export for signing, rules in force.
   - Activity, Servers and Server tasks.
7. **Locked folders through the add-on.** The console never opens locked files. It shows them (names, sensitivity, who has access) and hands each open, upload or share to the add-on (E3).

## Decisions for the owner

- **E1.** Rebuild `web/` in the same repository and keep the Go server (recommended), rather than starting a new repository. The Go server already holds sign-in, OIDC, invitations and the admin proxies, and it's tested.
- **E2.** Server-only tasks appear on the read-only Server tasks page, with the command to run, and aren't run from the web. Moving any of them to the web later is a change to fga's admin API, decided one at a time, and only if it stays small.
- **E3.** Owner's decision, 4 November 2026: locked (end-to-end encrypted) folders are opened only by an installed browser add-on, never by the console's web pages.
  - **Keys.** Each person's private keys are stored in fga, encrypted, never on the console server. The add-on downloads them when needed and unlocks them inside its own sandbox. The unlocker (a passkey, or a secret kept only on the person's devices) never goes to any server.
  - **Path.** The design note decides whether the add-on fetches the keys straight from fga, or through the console. If through the console, it passes the encrypted bytes on and stores nothing.
  - **Files.** The add-on fetches, checks and decrypts files itself, and shows them in its own window. A hacked console sees only scrambled bytes, never a key.
  - **Repository.** The add-on lives in its own repository, `mosaic-key-store` (owner's working name, 5 November 2026), with its own releases.
  - **First step.** A design note for the owner's OK, now `docs/design.md` in mosaic-key-store. It also settles where the encrypted keys are kept: an ordinary owner-only "key boxes" space (no fga code), or the custody record of `browser-client.md` (C1).
  - **What it replaces.** The in-page browser client of fga's `docs/design/browser-client.md` (stops 4c and 4d of the web-only console plan). In the add-on, a small Rust WASM module does the crypto (owner's decision of 5 November 2026, A-4 in mosaic-key-store's `docs/design.md`), and the console's `web/fga-profile1.mjs` is then retired.
  - **Until then.** Locked files open with the fga program.
- **E4.** D1–D6 from [end-user-design.md](end-user-design.md) apply as written:
  - the administrator's view is built from facts;
  - the line shown on click lists facts, never "because";
  - "you can't see this" appears only where fga lets the person know the item exists;
  - access requests are kept by the console;
  - the assistant page offers "Stop";
  - the share-count route for administrators is optional.
- **E5.** Whether each stop waits for the owner's OK, or all stops 1–6 are built in one go and checked at the end.

## Not changed

- fga's code, apart from the demo's `public_audience` config line in stop 1, and anything agreed later under E2, E3 or D6.
- What fga decides: the console shows fga's answers and never works them out itself.

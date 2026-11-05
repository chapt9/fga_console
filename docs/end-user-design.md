# End-user design: plan

Status: plan for the owner's OK, 4 November 2026. Nothing is built yet. The screens below come from sketches the owner reviewed in a design session on that date.

## Why

The console works, but it is laid out around fga's own pieces (rights, rules, spaces, sources, tools), and its pages are lists. The owner's verdict: "technically it is ok, but intuitive for end users, no." This plan makes the console start from one person or one thing and use everyday words.

## Principles

- **Simple and organized.** Start from one person or one thing, never from all of them. Use a few boxes instead of long lists; when a list is needed, it is searchable and paged.
- **Plain words.** Use the words of a file-sharing app: team, can view, can edit, share, confidential, locked folder. Technical names stay behind the existing "Technical names" switch (`web/words.js`).
- **fga decides, and only for the person asking.** fga answers "may I…?" only with the asking person's own pass. There is never a request on someone else's behalf, and the console never re-evaluates rules itself.
- **Who sees what.**
  - Administrators see everyone.
  - A person sees their own page, plus the names of the people they shared with: the names only, never those people's own access.
- **Few fga changes.** A change to fga is acceptable only if it is a few lines. Anything bigger is left out and listed as open.

## The screens

1. **Person page** (for example Alice).
   - Header: name, team and status.
   - **Rights**: yes/no chips such as Sign in, Open files, Upload, Share, Take copies out, Delete, Approve, Use AI tools.
   - **What Alice can reach**: a small picture with one box for Alice and arrows to at most about six place boxes. Each place box shows its name and one short line ("can edit", "can view", "temperature only"). Files shared with Alice one by one are a single dashed box ("3 files shared with Alice"). Clicking a box shows one line of facts below the picture.
   - **Shared by Alice**: the names of the people Alice shared with, what each may do, and until when. A name is not a link to that person's access.
2. **File view.**
   - **Who has access** shows the owner and the names of the people the file was shared with.
   - **Share** opens a dialog: pick a name, then choose "can view" or "can edit" and an end date. Before anything is sent, the dialog says whether fga would allow the share, in plain words.
3. **Home page.** Shows what's waiting for you (approvals), recent files, and your teams.
4. **Ask for access.** You say why and for how long. The owner allows or declines. Allowing is the owner's normal share, with that end date.
5. **Assistant page.** Shows what an assistant may do for its person, what it did today, and a stop button.

## Where each part gets its data

| Part | Source | Decided by fga for the viewer | fga code change |
|---|---|---|---|
| Rights chips | `GET /v1/me` (own page) or `GET /v1/admin/identities` (administrator) | facts, no decision | none |
| "What Alice can reach", own page | fga-decision `POST /v1/check` with Alice's own pass: one check per place and action | yes | none; fga-decision needs `public_audience` in its config |
| "What Alice can reach", administrator | identities (teams), buckets (spaces per project), ownership | facts, no decision | none |
| Files shared with Alice, administrator | not available today: the admin API lists no shares | — | optional small route, see D6 |
| Shared by Alice | `list-grants` on Alice's own things (native API `GET /v1/buckets/{b}/grants?key=…`) | yes | none; but it is one call per file, see stop 1 |
| Share dialog check | `POST /v1/check` as the sharer, for the share operation (`<type>.record-grant`) | yes | none, to confirm in stop 3 |
| End date of a share | share grants already carry `expires_at` | yes | none |
| Approvals on the home page | existing Approvals page | yes | none |
| Access requests | kept by the console (data dir); the owner's answer is a normal share | yes, for the share | none |
| Assistant page | delegations in the admin API; audit events | facts | none, to confirm whether a person can read their own delegations |

`POST /v1/check` (`internal/decisionsvc/http.go`) authenticates the caller by bearer token. It removes any other subject or delegation from the request and answers allowed or denied with a generic reason, never the rule. That matches the principles: it never decides for someone else, and it reveals no rules.

## Own page and administrator view

- On a person's **own page**, the arrows and their short lines are fga's answers for that person.
- On an **administrator's** view of the same person, the picture has the same layout, but it is built from facts: teams, the spaces of those teams, ownership and rights. It uses fact words ("team space", "owner") instead of answers that only a decision could give ("can edit", "temperature only"). The page says so in one line.

## Stops

Each stop is explained before coding, built on its own branch, checked against the running demo with real fga, and pushed only with the owner's OK.

1. **Own person page.**
   - The rights chips come from `/v1/me`.
   - The picture comes from `POST /v1/check` with the person's own pass.
   - Shared by me comes from `list-grants`.
   - The demo's `fga-decision` gets `public_audience`, a config line, not code.
   - To settle first:
     - which operations stand for view, edit and share on a space;
     - how "temperature only" is checked on a source's field groups;
     - whether the console can reach the public route in a TLS deployment;
     - which audience an OIDC login gives the console;
     - how to find which of a person's files carry shares without one `list-grants` call per file. If there is no cheap way, "Shared by me" shows the shares on the files the person opens, rather than a full list.
   - Done when the pages of Alice, Bob and Lena in the demo match what fga's file routes really allow, tried action by action.
2. **Administrator's person page.** Same layout from facts, for every person, searchable. Optionally, if D6 is agreed: a count of shares per person and space.
3. **File view.** Who has access, and the share dialog with its check before sending and an end date.
4. **Home page.**
5. **Ask for access.**
6. **Assistant page.**

The vocabulary changes in `web/words.js` (team for project, confidential for restricted, locked folder for an end-to-end encrypted space) go in with the stop that first shows each word.

## Decisions for the owner

- **D1.** On an administrator's view, the picture is built from facts and uses fact words; only the person's own page shows fga's answers. (Recommended. The alternative is impossible without deciding for someone else.)
- **D2.** The line shown on click lists facts ("Alice is in the Greenhouse team") and never says "because": fga does not say which rule decided, and the console must not guess.
- **D3.** A "you can't see this" message appears only where fga lets the person know that the item exists. Otherwise the item does not appear at all, and the message names no owner.
- **D4.** Access requests are kept by the console. Allowing one is the owner's normal share with the requested end date, so fga still decides.
- **D5.** The assistant page offers "Stop", not "Pause", if revoking a delegation is final (to confirm). Starting again needs a new delegation from an administrator.
- **D6.** Optional fga change: a read-only admin route giving, per person, the number of unexpired shares per space. This needs a catalog query, a handler, a test and a line in `docs/design/admin-api.md`. If it is more than a few lines, it is dropped, and shares appear only on the owner's own pages.

## Not in this plan

- A new menu. The earlier ideas (an "ask who can" page, an access matrix, a change tray) were set aside as not intuitive.
- Organisation-wide pictures of everyone and everything.
- "Shared with you" on the home page: fga can list a resource's grants for its owner, but not the grants given to a person.
- Locked folders: opened by a separate browser add-on, never by the console's pages (owner's decision, 4 November 2026; see [console-rebuild.md](console-rebuild.md), E3).

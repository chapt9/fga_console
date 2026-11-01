# fga console

A web console for [fga](https://github.com/chapt9/fga): users sign in and
work with what the policy lets them see; administrators manage identities,
roles, permission sets, delegations, buckets and tools, and edit policy
either in forms or in a node graph.

The console is a separate program and can run on its own machine. It talks
to fga only over fga's HTTP APIs (mutual TLS in production), never to fga's
database.

## Status

Stop 1 of 5: a clickable mockup over demo data, to agree on the design.
It has no server and sends nothing anywhere; `web/policy.js` stands in for
fga's decision role so the pages behave as fga would decide.

To look at it, serve `web/` with any static file server, for example:

    python3 -m http.server --directory web --bind 127.0.0.1 8080

and open http://127.0.0.1:8080.

The demo organisation has about 300 people in eight projects, a dozen
spaces and some 250 files of different kinds. Sign in as:

- alice: a member who may also create projects of their own;
- bob: a member who may also send data outside;
- carl: a member without the right to share;
- lena: team lead of Apollo, who approves requests and runs the project;
- sam: a file steward, who can give people access to single files in
  their projects without being able to open them;
- gus: a guest with no rights at all;
- the administrator, for people, rights, roles, AI agents, projects,
  spaces, tools, rules, servers, the audit log and the access graph.

What someone may do is the smaller of two things: their **rights** (the
most they may ever do, such as sharing or creating projects, given per
person or from a profile) and the **rules** (where a right applies: in
which projects, on whose files). Team leads are chosen per project.

Every page uses plain words from `web/words.js`; "Technical names" shows
fga's own names beside them. The access graph has three views (rules, one
person, one file) so it stays readable with hundreds of people. Giving
access takes many files at once: filters with "Choose all", whole folders,
shift-click ranges and several spaces, and can be taken back as a batch.

### Needs fga changes

The mockup shows these, marked "Needs a change in fga" where they appear:

- projects as something fga knows, with operations people may be allowed:
  create a project (and lead it), add and remove members, choose team
  leads, create spaces in it; a new project can never take an existing
  project's name;
- removing a space, a tool or an external address, and turning the AI
  assistant tools off;
- a remote admin API for tools (today `fga-tools` commands on its host);
- a place in the signed rules for role names and descriptions.

Rights work with fga as it is: each is a set of capabilities
(`fga-admin grant -type -actions`); profiles exist only in the console.

Server settings are never pushed: the console checks them and exports
the settings file, which is put in place on the server before a restart.

## Plan

1. Design mockup (this).
2. fga: a narrow admin API (`fga-admin serve`), mutual TLS plus an
   administrator's token, every change audited.
3. Console server: sign-in (development picker first, OpenID Connect
   later), sessions, the user's pages.
4. Admin forms over the admin API.
5. The access graph over the same API; rule changes exported as a draft
   bundle that is signed offline.

The frontend is plain JavaScript, CSS and SVG with no third-party code,
served with a strict content security policy.

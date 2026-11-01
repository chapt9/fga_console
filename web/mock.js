// Demo data for the console mockup: the rules of fga's example policy
// bundle and a directory matching the local demo tenant. There is no
// server behind the mockup; nothing here leaves the page.
"use strict";

window.FGA_MOCK = (() => {
  const SAME_PROJECT = "resource.attributes.project in principal.attributes.projects";
  const OWNER = "resource.attributes.owner == principal.id";
  const GRANTEE = action => `has(resource.attributes.shared_with) && principal.id in resource.attributes.shared_with.${action}`;
  const rule = (type, id, effect, actions, roles, when = "", set = "business") => ({ set, type, id, effect, actions, roles, when });

  const rules = [
    rule("storage.bucket", "members-use-bucket", "allow", ["create-object", "list"], ["member"], SAME_PROJECT),
    rule("storage.bucket", "leads-approve-buckets", "allow", ["approve"], ["lead"], SAME_PROJECT),
    rule("storage.bucket", "leads-manage-buckets", "allow", ["manage", "share"], ["lead"], SAME_PROJECT),
    rule("storage.object", "owner-all", "allow", ["read", "stat", "discover", "read-history", "discover-history", "new-version",
      "delete", "delete-version", "share", "label", "export"], ["*"], OWNER),
    rule("storage.object", "owner-lowers-with-approval", "allow", ["relabel"], ["*"], OWNER),
    rule("storage.object", "members-propose-labels", "allow", ["propose-label"], ["member"], SAME_PROJECT),
    rule("storage.object", "leads-approve-objects", "allow", ["approve"], ["lead"], SAME_PROJECT),
    rule("storage.object", "members-read", "allow", ["read", "stat", "discover"], ["member"], SAME_PROJECT),
    rule("storage.object", "auditors-history", "allow", ["read-history", "discover-history"], ["auditor"]),
    rule("storage.object", "contractors-never-read", "deny", ["read"], ["contractor"]),
    rule("storage.object", "grantees-read", "allow", ["read"], ["*"], GRANTEE("read")),
    rule("storage.object", "grantees-stat", "allow", ["stat"], ["*"], GRANTEE("stat")),
    rule("storage.object", "grantees-discover", "allow", ["discover"], ["*"], GRANTEE("discover")),
    rule("document.version", "owner-versions", "allow", ["read-units", "raw-read", "discover", "share", "export"], ["*"], OWNER),
    rule("document.version", "members-read-versions", "allow", ["read-units", "discover"], ["member"], SAME_PROJECT),
    rule("document.version", "leads-approve-versions", "allow", ["approve"], ["lead"], SAME_PROJECT),
    rule("document.text_unit", "owner-lowers-units-with-approval", "allow", ["relabel"], ["*"], OWNER),
    rule("document.text_unit", "leads-approve-units", "allow", ["approve"], ["lead"], SAME_PROJECT),
    rule("document.text_unit", "owner-units", "allow", ["read", "share", "label", "export-key"], ["*"], OWNER),
    rule("document.text_unit", "members-read-units-below-restricted", "allow", ["read"], ["member"],
      SAME_PROJECT + " && resource.attributes.label_rank < 3"),
    rule("document.derived", "owner-lowers-derived-with-approval", "allow", ["relabel"], ["*"], OWNER),
    rule("document.derived", "leads-approve-derived", "allow", ["approve"], ["lead"], SAME_PROJECT),
    rule("document.derived", "owner-derived", "allow", ["deliver", "declassify", "label", "new-version", "share"], ["*"], OWNER),
    rule("document.derived", "members-receive-derived", "allow", ["deliver"], ["member"], SAME_PROJECT),
    rule("document.derived", "leads-receive-declassified", "allow", ["declassify"], ["lead"], SAME_PROJECT),
    rule("text.entry", "owner-entries", "allow", ["read", "update", "use-in-model", "share"], ["*"], OWNER),
    rule("text.entry", "members-read-entries", "allow", ["read"], ["member"], SAME_PROJECT),
    rule("text.entry", "leads-approve-entries", "allow", ["approve"], ["lead"], SAME_PROJECT),
    rule("crypto.envelope", "create-for-sharers", "allow", ["create"], ["*"]),
    rule("crypto.envelope", "release-to-recipient", "allow", ["release"], ["*"], "resource.attributes.recipient_principal == principal.id"),
    rule("crypto.envelope", "owner-retires", "allow", ["retire"], ["*"], OWNER),
    rule("crypto.envelope", "owner-releases-for-export", "allow", ["release"], ["*"], OWNER),
    rule("crypto.recipient", "only-active-keys-receive", "deny", ["receive-key"], ["*"], 'resource.attributes.status != "ACTIVE"', "ceiling"),
    rule("crypto.recipient", "own-key", "allow", ["enroll", "activate", "receive-key", "revoke", "discover"], ["*"],
      "resource.attributes.principal == principal.id"),
    rule("crypto.recipient", "members-find-keys", "allow", ["discover"], ["member"]),
    rule("crypto.signing-key", "members-verify-signers", "allow", ["discover"], ["member"]),
    rule("crypto.signing-key", "own-signing-key", "allow", ["discover", "enroll", "activate", "retire"], ["*"],
      "resource.attributes.principal == principal.id"),
    rule("network.destination", "members-send-approved", "allow", ["send"], ["member"], "resource.attributes.approved == true"),
    rule("agent.tool", "members-use-mcp", "allow", ["discover", "invoke"], ["member"], 'resource.attributes.kind == "mcp"'),
    rule("agent.tool", "members-use-tools", "allow", ["discover", "invoke"], ["member"], 'resource.attributes.kind == "executor"'),
    rule("agent.tool", "leads-settle-tools", "allow", ["approve", "resolve", "write-off"], ["lead"], 'resource.attributes.kind == "executor"'),
  ];

  // Permission sets are what fga-admin grant hands out: the upper bound of
  // what an actor may ever do, before any rule is asked.
  const permSets = {
    storage: { name: "storage preset", builtin: true, caps: {
      "storage.bucket": ["create-object", "list", "share"],
      "storage.object": ["read", "stat", "discover", "read-history", "discover-history", "new-version", "delete", "delete-version",
        "share", "label", "relabel", "propose-label", "export"],
      "crypto.envelope": ["create", "release", "retire"],
      "document.version": ["read-units", "raw-read", "discover", "share", "export"],
      "document.text_unit": ["read", "share", "label", "relabel", "propose-label", "export-key"],
      "document.derived": ["deliver", "declassify", "label", "relabel", "new-version", "share"],
      "text.entry": ["read", "use-in-model", "update", "share"],
      "crypto.recipient": ["enroll", "activate", "receive-key", "revoke", "discover"],
      "crypto.signing-key": ["discover", "enroll", "activate", "retire"],
      "agent.tool": ["discover", "invoke"],
    } },
    approver: { name: "approver preset", builtin: true, caps: Object.fromEntries(["storage.bucket", "storage.object", "document.text_unit",
      "document.derived", "document.version", "text.entry", "crypto.envelope", "crypto.recipient", "crypto.signing-key", "agent.tool"]
      .map(t => [t, ["approve"]])) },
    "manage-buckets": { name: "manage buckets", caps: { "storage.bucket": ["manage"] } },
    "send-hooks": { name: "send to destinations", caps: { "network.destination": ["send"] } },
  };

  const types = {};
  for (const r of rules) types[r.type] = [...new Set([...(types[r.type] || []), ...r.actions])];
  for (const set of Object.values(permSets)) {
    for (const [t, acts] of Object.entries(set.caps)) types[t] = [...new Set([...(types[t] || []), ...acts])];
  }

  const principals = [
    { id: "alice", kind: "user", roles: ["member"], attributes: { projects: ["p1"] }, grants: ["storage"], status: "active" },
    { id: "bob", kind: "user", roles: ["member"], attributes: { projects: ["p1"] }, grants: ["storage", "send-hooks"], status: "active" },
    { id: "lena", kind: "user", roles: ["member", "lead"], attributes: { projects: ["p1"] }, grants: ["storage", "approver", "manage-buckets"], status: "active" },
    { id: "carl", kind: "user", roles: ["member"], attributes: { projects: ["p2"] }, grants: ["storage"], status: "active" },
    { id: "gus", kind: "user", roles: ["guest"], attributes: { projects: ["p1"] }, grants: [], status: "active" },
    { id: "agent-7", kind: "agent", roles: ["agent"], attributes: {}, grants: ["storage"], status: "active" },
  ];

  const delegations = [
    { id: "dlg-bob", actor: "agent-7", subject: "bob", audience: "local-dev", expires: "2026-11-02T11:00:00Z", status: "active", grants: {
      "agent.tool": ["discover", "invoke"], "storage.bucket": ["list"], "storage.object": ["read", "stat", "discover"],
      "document.version": ["read-units", "discover"], "document.text_unit": ["read"] } },
  ];

  const labels = ["public", "internal", "confidential", "restricted"];
  const buckets = [
    { name: "shared", project: "p1", mode: "server" },
    { name: "reports", project: "p1", mode: "client" },
    { name: "research", project: "p2", mode: "server" },
  ];
  const noShares = () => ({ read: [], stat: [], discover: [] });
  const objects = [
    { bucket: "shared", key: "q4/plan.txt", kind: "object", owner: "alice", label: "internal", size: 17, modified: "2026-11-01T10:42:00Z",
      shared_with: noShares(), body: "Q4 plan: ship it" },
    { bucket: "shared", key: "q4/notes.md", kind: "document", owner: "alice", label: "internal", size: 38, modified: "2026-11-01T10:51:00Z",
      shared_with: noShares(), body: "First paragraph.\n\nSecond paragraph." },
    { bucket: "shared", key: "q4/budget.xlsx", kind: "object", owner: "bob", label: "confidential", size: 48213, modified: "2026-10-30T15:07:00Z",
      shared_with: noShares(), body: "(spreadsheet, 48 KB)" },
    { bucket: "reports", key: "q3/report.txt", kind: "object", owner: "alice", label: "confidential", size: 17, modified: "2026-10-28T09:12:00Z",
      shared_with: noShares(), body: "" },
    { bucket: "reports", key: "q3/summary.txt", kind: "derived", owner: "alice", label: "internal", size: 32, modified: "2026-10-28T09:20:00Z",
      shared_with: noShares(), body: "" },
    { bucket: "research", key: "r/experiment.csv", kind: "object", owner: "carl", label: "internal", size: 9120, modified: "2026-10-31T13:30:00Z",
      shared_with: noShares(), body: "run,result\n1,0.82\n2,0.79" },
  ];

  const approvals = [
    { id: "a1f3c9", bucket: "reports", key: "q3/report.txt", from: "confidential", to: "internal", requester: "alice",
      created: "2026-11-01T11:00:05Z", state: "pending" },
  ];

  const tools = [{ id: "notify", version: 1, kind: "executor", description: "post a notification", destination: "hooks", reviewed: true }];
  const destinations = [{ id: "hooks", url: "http://127.0.0.1:28447", cidrs: "127.0.0.0/8", approved: true }];

  const services = [
    { name: "fga-decision", role: "policy decisions", addr: "127.0.0.1:27443", ok: true },
    { name: "fga-storage", role: "objects and documents", addr: "127.0.0.1:28441", ok: true },
    { name: "fga-keys", role: "key service", addr: "127.0.0.1:28442", ok: true },
    { name: "fga-kms", role: "key-encryption keys", addr: "127.0.0.1:28449", ok: true },
    { name: "fga-mcp", role: "MCP gateway", addr: "127.0.0.1:28446", ok: true },
    { name: "fga-tools", role: "tool executor", addr: "127.0.0.1:28448", ok: true },
  ];

  const ev = (time, actor, action, resource, decision, why) => ({ at: `2026-11-01T${time}Z`, actor, action, resource, decision, why });
  const audit = [
    ev("11:02:31", "bob", "invoke", "tool notify", "allow", "members-use-tools"),
    ev("11:02:10", "gus", "invoke", "tool notify", "deny", "no rule allows: default deny"),
    ev("11:01:44", "agent-7", "read-units", "shared/q4/notes.md", "allow", "members-read-versions, for bob under dlg-bob"),
    ev("11:00:05", "alice", "relabel", "reports/q3/report.txt", "deny", "approval required"),
    ev("10:59:30", "carl", "read", "shared/q4/plan.txt", "allow", "grantees-read"),
    ev("10:59:02", "alice", "share", "shared/q4/plan.txt", "allow", "owner-all"),
    ev("10:58:40", "carl", "read", "shared/q4/plan.txt", "deny", "no rule allows: default deny"),
    ev("10:58:12", "bob", "read", "shared/q4/plan.txt", "allow", "members-read"),
    ev("10:57:51", "alice", "new-version", "shared/q4/plan.txt", "allow", "owner-all"),
  ];

  // Example resources for the access check, per resource type: the demo
  // objects where they exist, otherwise one representative resource.
  const examples = {
    "crypto.envelope": [{ id: "env-q3-report-bob", attributes: { owner: "alice", recipient_principal: "bob" } }],
    "crypto.recipient": [{ id: "bob's recipient key", attributes: { principal: "bob", status: "ACTIVE" } },
      { id: "a revoked key of bob", attributes: { principal: "bob", status: "REVOKED" } }],
    "crypto.signing-key": [{ id: "alice's signing key", attributes: { principal: "alice" } }],
    "text.entry": [{ id: "q4/chat.log entry 1", attributes: { project: "p1", owner: "alice" } }],
    "document.text_unit": [{ id: "q4/notes.md unit 1 (internal)", attributes: { project: "p1", owner: "alice", label_rank: 1 } },
      { id: "q4/notes.md unit 2 (restricted)", attributes: { project: "p1", owner: "alice", label_rank: 3 } }],
    "network.destination": [{ id: "hooks", attributes: { approved: true } }],
    "agent.tool": [{ id: "tool notify", attributes: { kind: "executor" } }, { id: "MCP documents.read", attributes: { kind: "mcp" } }],
  };

  const state = {
    tenant: "t-acme",
    bundle: { epoch: 1, keyId: "publisher-1", activated: "2026-11-01T09:58:00Z", labels },
    rules, permSets, types, principals, delegations, buckets, objects, approvals, tools, destinations, services, audit, examples,
    admins: ["admin"], extraRoles: [],
  };
  return { initialState: () => structuredClone(state) };
})();

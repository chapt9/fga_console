// Demo data for the console mockup: the rules of fga's example policy
// bundle (with a file-steward role added), and a generated organisation of
// about 300 people, a dozen spaces and a few hundred files. A fixed seed
// makes every reload the same. There is no server behind the mockup;
// nothing here leaves the page.
"use strict";

window.FGA_MOCK = (() => {
  let seed = 20261101;
  const rnd = () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pick = list => list[Math.floor(rnd() * list.length)];
  const chance = p => rnd() < p;
  const between = (a, b) => a + rnd() * (b - a);
  const weighted = pairs => {
    let r = rnd() * pairs.reduce((s, [, w]) => s + w, 0);
    for (const [v, w] of pairs) if ((r -= w) < 0) return v;
    return pairs[0][0];
  };
  const NOW = Date.parse("2026-11-01T12:00:00Z");
  const iso = ms => new Date(ms).toISOString();

  // ---------------------------------------------------------------- policy

  const SAME_PROJECT = "resource.attributes.project in principal.attributes.projects";
  const OWNER = "resource.attributes.owner == principal.id";
  const GRANTEE = action => `has(resource.attributes.shared_with) && principal.id in resource.attributes.shared_with${/^[a-z]+$/.test(action) ? `.${action}` : `["${action}"]`}`;
  const NOT_SELF = "(!has(resource.attributes.grantee) || resource.attributes.grantee != principal.id)";
  // Team leads are chosen per project: a person's leads attribute lists the
  // projects they lead, so leading Apollo gives nothing in Borealis.
  const LEADS = "resource.attributes.project in principal.attributes.leads";
  const LEADS_ANY = "has(principal.attributes.leads) && principal.attributes.leads != []";
  const rule = (type, id, name, effect, actions, roles, when = "", set = "business") => ({ set, type, id, name, effect, actions, roles, when });

  const rules = [
    rule("storage.bucket", "members-use-bucket", "Members use their projects' spaces", "allow", ["create-object", "list"], ["member"], SAME_PROJECT),
    rule("storage.bucket", "leads-approve-buckets", "Team leads approve requests on their spaces", "allow", ["approve"], ["*"], LEADS),
    rule("storage.bucket", "leads-manage-buckets", "Team leads manage their projects' spaces", "allow", ["manage", "share"], ["*"], LEADS),
    rule("storage.bucket", "stewards-browse", "File stewards browse their projects' spaces", "allow", ["list"], ["steward"], SAME_PROJECT),
    rule("storage.object", "owner-all", "Owners do anything with their files", "allow", ["read", "stat", "discover", "read-history", "discover-history",
      "new-version", "delete", "delete-version", "share", "label", "export"], ["*"], OWNER),
    rule("storage.object", "owner-lowers-with-approval", "Owners may lower a file's sensitivity", "allow", ["relabel"], ["*"], OWNER),
    rule("storage.object", "members-propose-labels", "Members suggest a sensitivity", "allow", ["propose-label"], ["member"], SAME_PROJECT),
    rule("storage.object", "leads-approve-objects", "Team leads approve requests on files", "allow", ["approve"], ["*"], LEADS),
    rule("storage.object", "members-read", "Members find and open their projects' files", "allow", ["read", "stat", "discover"], ["member"], SAME_PROJECT),
    rule("storage.object", "auditors-history", "Auditors see the history of files", "allow", ["read-history", "discover-history"], ["auditor"]),
    rule("storage.object", "contractors-never-read", "Contractors never open files", "deny", ["read"], ["contractor"]),
    rule("storage.object", "grantees-read", "People a file is shared with may open it", "allow", ["read"], ["*"], GRANTEE("read")),
    rule("storage.object", "grantees-stat", "People a file is shared with may see its details", "allow", ["stat"], ["*"], GRANTEE("stat")),
    rule("storage.object", "grantees-discover", "People a file is shared with may find it", "allow", ["discover"], ["*"], GRANTEE("discover")),
    rule("storage.object", "stewards-see", "File stewards find their projects' files", "allow", ["discover", "stat"], ["steward"], SAME_PROJECT),
    rule("storage.object", "stewards-share", "File stewards share their projects' files, never with themselves", "allow", ["share"], ["steward"],
      `${SAME_PROJECT} && ${NOT_SELF}`),
    rule("document.version", "owner-versions", "Owners do anything with their documents", "allow", ["read-units", "raw-read", "discover", "share", "export"], ["*"], OWNER),
    rule("document.version", "members-read-versions", "Members read their projects' documents", "allow", ["read-units", "discover"], ["member"], SAME_PROJECT),
    rule("document.version", "leads-approve-versions", "Team leads approve requests on documents", "allow", ["approve"], ["*"], LEADS),
    rule("document.version", "grantees-read-units", "People a document is shared with may read it", "allow", ["read-units"], ["*"], GRANTEE("read-units")),
    rule("document.version", "grantees-find-documents", "People a document is shared with may find it", "allow", ["discover"], ["*"], GRANTEE("discover")),
    rule("document.version", "stewards-documents", "File stewards find and share their projects' documents", "allow", ["discover", "share"], ["steward"],
      `${SAME_PROJECT} && ${NOT_SELF}`),
    rule("document.text_unit", "owner-lowers-units-with-approval", "Owners may lower a section's sensitivity", "allow", ["relabel"], ["*"], OWNER),
    rule("document.text_unit", "leads-approve-units", "Team leads approve requests on sections", "allow", ["approve"], ["*"], LEADS),
    rule("document.text_unit", "owner-units", "Owners do anything with their sections", "allow", ["read", "share", "label", "export-key"], ["*"], OWNER),
    rule("document.text_unit", "members-read-units-below-restricted", "Members read sections below Restricted", "allow", ["read"], ["member"],
      SAME_PROJECT + " && resource.attributes.label_rank < 3"),
    rule("document.derived", "owner-lowers-derived-with-approval", "Owners may lower a summary's sensitivity", "allow", ["relabel"], ["*"], OWNER),
    rule("document.derived", "leads-approve-derived", "Team leads approve requests on summaries", "allow", ["approve"], ["*"], LEADS),
    rule("document.derived", "owner-derived", "Owners do anything with their summaries", "allow", ["deliver", "declassify", "label", "new-version", "share"], ["*"], OWNER),
    rule("document.derived", "members-receive-derived", "Members receive their projects' summaries", "allow", ["deliver"], ["member"], SAME_PROJECT),
    rule("document.derived", "leads-receive-declassified", "Team leads receive declassified summaries", "allow", ["declassify"], ["*"], LEADS),
    rule("text.entry", "owner-entries", "Owners do anything with their text entries", "allow", ["read", "update", "use-in-model", "share"], ["*"], OWNER),
    rule("text.entry", "members-read-entries", "Members read their projects' text entries", "allow", ["read"], ["member"], SAME_PROJECT),
    rule("text.entry", "leads-approve-entries", "Team leads approve requests on text entries", "allow", ["approve"], ["*"], LEADS),
    rule("crypto.envelope", "create-for-sharers", "Anyone may create key shares", "allow", ["create"], ["*"]),
    rule("crypto.envelope", "release-to-recipient", "A key share is handed to the person it is for", "allow", ["release"], ["*"],
      "resource.attributes.recipient_principal == principal.id"),
    rule("crypto.envelope", "owner-retires", "Owners retire their key shares", "allow", ["retire"], ["*"], OWNER),
    rule("crypto.envelope", "owner-releases-for-export", "Owners may take their key shares out", "allow", ["release"], ["*"], OWNER),
    rule("crypto.recipient", "only-active-keys-receive", "Only active keys receive file keys", "deny", ["receive-key"], ["*"], 'resource.attributes.status != "ACTIVE"', "ceiling"),
    rule("crypto.recipient", "own-key", "People manage their own personal keys", "allow", ["enroll", "activate", "receive-key", "revoke", "discover"], ["*"],
      "resource.attributes.principal == principal.id"),
    rule("crypto.recipient", "members-find-keys", "Members find other people's keys", "allow", ["discover"], ["member"]),
    rule("crypto.signing-key", "members-verify-signers", "Members find signing keys", "allow", ["discover"], ["member"]),
    rule("crypto.signing-key", "own-signing-key", "People manage their own signing keys", "allow", ["discover", "enroll", "activate", "retire"], ["*"],
      "resource.attributes.principal == principal.id"),
    rule("network.destination", "members-send-approved", "Members send data to approved addresses", "allow", ["send"], ["member"], "resource.attributes.approved == true"),
    rule("agent.tool", "members-use-mcp", "Members use the AI assistant tools", "allow", ["discover", "invoke"], ["member"], 'resource.attributes.kind == "mcp"'),
    rule("agent.tool", "members-use-tools", "Members run registered tools", "allow", ["discover", "invoke"], ["member"], 'resource.attributes.kind == "executor"'),
    rule("agent.tool", "leads-settle-tools", "Team leads settle tool runs", "allow", ["approve", "resolve", "write-off"], ["*"], `${LEADS_ANY} && resource.attributes.kind == "executor"`),
    rule("directory.project", "anyone-creates-projects", "People with the right may create projects", "allow", ["create"], ["*"]),
    rule("directory.project", "leads-run-projects", "Team leads run their projects", "allow", ["create-space", "manage-members", "manage-leads", "rename"], ["*"], LEADS),
  ];

  // Rights are the most a person may ever do, whatever the rules say: each
  // is a set of fga capabilities (fga-admin grant -type -actions). The rules
  // then decide where a right applies: in which projects, on whose files.
  const right = (name, help, caps) => ({ name, help, builtin: true, caps });
  const APPROVABLE = ["storage.bucket", "storage.object", "document.version", "document.text_unit", "document.derived", "text.entry"];
  const permSets = {
    open: right("Open files", "Find, see and open what the rules allow them, and keep their own keys", {
      "storage.bucket": ["list"], "storage.object": ["read", "stat", "discover", "read-history", "discover-history"],
      "document.version": ["read-units", "discover"], "document.text_unit": ["read"], "document.derived": ["deliver"], "text.entry": ["read"],
      "crypto.envelope": ["release"], "crypto.recipient": ["enroll", "activate", "receive-key", "revoke", "discover"], "crypto.signing-key": ["discover"] }),
    upload: right("Upload and replace", "Add files and new versions of them", {
      "storage.bucket": ["create-object"], "storage.object": ["new-version"], "document.derived": ["new-version"], "text.entry": ["update"] }),
    delete: right("Delete", "Delete files and their old versions", { "storage.object": ["delete", "delete-version"] }),
    share: right("Share with others", "Give other people access to single files", {
      "storage.bucket": ["share"], "storage.object": ["share"], "document.version": ["share"], "document.text_unit": ["share"],
      "document.derived": ["share"], "text.entry": ["share"], "crypto.envelope": ["create", "retire"] }),
    sensitivity: right("Change sensitivity", "Mark things more or less sensitive; less needs an approval", {
      "storage.object": ["label", "relabel", "propose-label"], "document.text_unit": ["label", "relabel", "propose-label"],
      "document.derived": ["label", "relabel", "declassify"] }),
    export: right("Take copies out", "Export files and download originals", {
      "storage.object": ["export"], "document.version": ["raw-read", "export"], "document.text_unit": ["export-key"] }),
    approve: right("Approve requests", "Decide on requests that need a second person", {
      ...Object.fromEntries(APPROVABLE.map(t => [t, ["approve"]])), "agent.tool": ["approve", "resolve", "write-off"] }),
    ai: right("Use AI and tools", "Run tools, and let AI assistants work with their files", { "agent.tool": ["discover", "invoke"], "text.entry": ["use-in-model"] }),
    send: right("Send data outside", "Send data to approved external addresses", { "network.destination": ["send"] }),
    "manage-buckets": right("Manage spaces", "Change the settings of spaces", { "storage.bucket": ["manage"] }),
    "create-projects": right("Create projects", "Start new projects, and lead them", { "directory.project": ["create"] }),
    "lead-projects": right("Run projects they lead", "Create spaces and choose members and team leads, in projects they lead", {
      "directory.project": ["create-space", "manage-members", "manage-leads", "rename"] }),
    signing: right("Sign files", "Register and use their own signing keys", { "crypto.signing-key": ["enroll", "activate", "retire"] }),
  };

  // Profiles are ready-made sets of rights to start from; a person's rights
  // can then differ one by one. fga knows only the rights.
  const MEMBER = ["open", "upload", "delete", "share", "sensitivity", "ai", "signing"];
  const profiles = {
    none: { name: "No rights", help: "Can sign in, and do nothing else", rights: [] },
    reader: { name: "Reader", help: "Finds and opens what the rules allow", rights: ["open"] },
    member: { name: "Member", help: "Works with files: opens, uploads, deletes and shares", rights: MEMBER },
    "member-no-share": { name: "Member who cannot share", help: "Like a member, but never gives others access", rights: MEMBER.filter(r => r !== "share") },
    lead: { name: "Team lead", help: "A member who also approves requests and runs projects",
      rights: [...MEMBER, "approve", "export", "manage-buckets", "create-projects", "lead-projects"] },
    steward: { name: "File steward", help: "Gives people access to single files, and opens nothing", rights: ["open", "share"] },
    agent: { name: "AI agent", help: "Opens files and runs tools for the people it acts for", rights: ["open", "ai"] },
  };

  const types = {};
  for (const r of rules) types[r.type] = [...new Set([...(types[r.type] || []), ...r.actions])];
  for (const s of Object.values(permSets)) {
    for (const [t, acts] of Object.entries(s.caps)) types[t] = [...new Set([...(types[t] || []), ...acts])];
  }

  // ---------------------------------------------------------------- people

  const projects = [
    { id: "apollo", name: "Apollo", description: "The new customer portal" }, { id: "borealis", name: "Borealis", description: "Sensor research" },
    { id: "cobalt", name: "Cobalt", description: "Design system and releases" }, { id: "delta", name: "Delta", description: "Data and models" },
    { id: "finance", name: "Finance", description: "Budgets, forecasts and the board" }, { id: "legal", name: "Legal", description: "Contracts and agreements" },
    { id: "hr", name: "People and HR", description: "Handbook and payroll" }, { id: "marketing", name: "Marketing", description: "Campaigns and brand" },
  ];
  const projectWeights = [["apollo", 50], ["borealis", 45], ["cobalt", 40], ["delta", 35], ["finance", 30], ["legal", 20], ["hr", 25], ["marketing", 35]];

  const rightsOf = (profile, ...extra) => [...profiles[profile].rights, ...extra];
  const person = (id, roles, projs, grants, extra = {}, leads = []) =>
    ({ id, kind: "user", roles, attributes: { projects: projs, ...(leads.length ? { leads } : {}) }, grants, status: "active", ...extra });
  const principals = [
    person("alice", ["member"], ["apollo"], rightsOf("member", "create-projects", "lead-projects")),
    person("bob", ["member"], ["apollo"], rightsOf("member", "send")),
    person("lena", ["member"], ["apollo"], rightsOf("lead"), {}, ["apollo"]),
    person("carl", ["member"], ["borealis"], rightsOf("member-no-share")),
    person("sam", ["steward"], ["apollo", "borealis", "finance"], rightsOf("steward")),
    person("gus", ["guest"], ["apollo"], rightsOf("none")),
  ];
  const FIRST = ["anna", "omar", "mei", "lukas", "sara", "jonas", "amira", "felix", "nina", "tariq", "elena", "viktor", "hana", "diego", "ingrid",
    "kofi", "leila", "mateo", "olga", "pavel", "rosa", "sven", "yuki", "zara", "adam", "bea", "chen", "dara", "emil", "fatima", "goran", "hugo",
    "iris", "jamal", "kira", "lars", "maya", "nils", "oskar", "priya", "rafael", "sofia", "tomas", "ulla", "vera", "wei", "ximena", "yusuf",
    "zoe", "aaron", "britt", "carmen", "dmitri", "eva", "farid", "greta", "henrik", "ida", "jens", "noor"];
  const LAST = ["berg", "haddad", "lin", "novak", "costa", "meyer", "okafor", "silva", "tanaka", "weber", "kowalski", "rossi", "nyberg", "garcia",
    "ahmed", "larsen", "moreau", "petrov", "schmidt", "yilmaz", "dubois", "ivanova", "jensen", "kim", "lopez", "mbeki", "nakamura", "olsen",
    "park", "quist", "reyes", "sato", "torres", "ueda", "vogel", "walsh", "xu", "young", "zeller", "holm"];
  const taken = new Set(principals.map(p => p.id));
  while (principals.length < 306) {
    const id = `${pick(FIRST)}.${pick(LAST)}`;
    if (taken.has(id)) continue;
    taken.add(id);
    const first = weighted(projectWeights), projs = chance(0.12) ? [first, weighted(projectWeights)] : [first];
    const r = rnd();
    let roles = ["member"], grants = rightsOf(chance(0.08) ? "member-no-share" : "member"), leads = [];
    if (r < 0.065) { grants = rightsOf("lead"); leads = [first]; }
    else if (r < 0.095) { roles = ["member", "contractor"]; grants = rightsOf("member-no-share"); }
    else if (r < 0.11) { roles = ["auditor"]; grants = rightsOf("reader"); }
    else if (r < 0.125) { roles = ["guest"]; grants = rightsOf("none"); }
    else if (r < 0.135) { roles = ["steward"]; grants = rightsOf("steward"); }
    if (roles.includes("member") && chance(0.04)) grants.push("send");
    principals.push(person(id, roles, [...new Set(projs)], grants, chance(0.02) ? { status: "disabled" } : {}, leads));
  }
  const agentIds = ["agent-7", "agent-12", "agent-21", "agent-33", "agent-40", "agent-51", "agent-64", "agent-78"];
  for (const id of agentIds) principals.push({ id, kind: "agent", roles: ["agent"], attributes: {}, grants: rightsOf("agent"), status: "active" });

  const members = proj => principals.filter(p => p.kind === "user" && p.status === "active" && p.roles.includes("member") &&
    p.attributes.projects.includes(proj));
  // Every project has at least one team lead.
  for (const pr of projects) {
    if (principals.some(p => (p.attributes.leads || []).includes(pr.id))) continue;
    const p = members(pr.id)[0];
    p.attributes.leads = [...(p.attributes.leads || []), pr.id];
    p.grants = [...new Set([...p.grants, ...profiles.lead.rights])];
  }

  const delegations = [
    { id: "dlg-bob", actor: "agent-7", subject: "bob", audience: "local-dev", expires: "2026-11-02T11:00:00Z", status: "active", grants: {
      "agent.tool": ["discover", "invoke"], "storage.bucket": ["list"], "storage.object": ["read", "stat", "discover"],
      "document.version": ["read-units", "discover"], "document.text_unit": ["read"] } },
  ];
  for (const id of agentIds.slice(1)) {
    const subject = pick(members(weighted(projectWeights)));
    delegations.push({ id: `dlg-${subject.id.split(".")[0]}-${id.split("-")[1]}`, actor: id, subject: subject.id, audience: "local-dev",
      expires: iso(NOW + between(2, 160) * 3600e3), status: "active", grants: {
        "storage.bucket": ["list"], "storage.object": ["read", "stat", "discover"], ...(chance(0.5) ? { "agent.tool": ["discover", "invoke"] } : {}) } });
  }

  // ---------------------------------------------------------------- spaces and files

  const labels = ["public", "internal", "confidential", "restricted"];
  const SPACES = [
    ["shared", "apollo", "server", ["q4", "q3", "team", "design", "meetings"], 30,
      ["plan", "roadmap", "kickoff", "status-update", "risks", "minutes", "team-photo", "contacts", "retro", "offsite-agenda", "hiring-plan", "budget"]],
    ["reports", "apollo", "client", ["q3", "q4", "board"], 12, ["report", "kpis", "board-deck", "revenue", "customer-review"]],
    ["research", "borealis", "server", ["r", "experiments", "papers", "data"], 30,
      ["experiment", "results", "paper-draft", "literature-review", "dataset", "protocol", "lab-notes", "poster", "sensor-readings"]],
    ["designs", "cobalt", "server", ["ui", "brand", "specs"], 22, ["wireframes", "mockup", "style-guide", "logo", "icons", "user-flows", "spec"]],
    ["releases", "cobalt", "server", ["2026", "notes"], 14, ["release-notes", "changelog", "build", "checklist", "rollout-plan"]],
    ["datasets", "delta", "server", ["raw", "clean", "models"], 22, ["customers", "transactions", "sensor-readings", "training-set", "eval-results", "schema", "model-card"]],
    ["budgets", "finance", "server", ["2026", "2027", "forecasts"], 22, ["budget", "forecast", "cost-centres", "headcount", "capex", "opex", "variance"]],
    ["board", "finance", "client", ["minutes", "packs"], 10, ["minutes", "board-pack", "resolutions", "strategy"]],
    ["contracts", "legal", "server", ["suppliers", "customers", "ndas"], 26, ["supplier-agreement", "nda", "master-agreement", "statement-of-work", "amendment", "terms", "data-processing"]],
    ["payroll", "hr", "client", ["2026", "templates"], 10, ["payroll", "salary-bands", "bonus-plan", "payslip-template"]],
    ["handbook", "hr", "server", ["policies", "onboarding"], 16, ["code-of-conduct", "travel-policy", "leave-policy", "onboarding-checklist", "it-security", "benefits"]],
    ["campaigns", "marketing", "server", ["autumn", "spring", "assets"], 26, ["campaign-brief", "media-plan", "banner", "video-teaser", "social-calendar", "press-release", "results"]],
  ];
  const EXT_HINTS = [
    [/photo|logo|icons|banner|poster|mockup|wireframes/, ["png", "jpg", "png", "pdf"]],
    [/teaser/, ["mp4"]],
    [/dataset|transactions|readings|customers|training-set|eval-results/, ["csv", "zip", "json", "csv"]],
    [/budget|forecast|headcount|capex|opex|variance|kpis|revenue|salary|payroll|cost|contacts|social-calendar|media-plan|bonus/, ["xlsx", "xlsx", "csv"]],
    [/deck|pack|kickoff|strategy|roadmap|results|review/, ["pptx", "pdf"]],
    [/minutes|retro|agenda|lab-notes|changelog|release-notes|status-update/, ["docx", "md", "txt"]],
    [/schema|model-card|build/, ["json", "md", "zip"]],
    [/agreement|nda|terms|amendment|statement|processing|policy|conduct|security|benefits/, ["pdf", "pdf", "docx"]],
  ];
  const extFor = stem => (EXT_HINTS.find(([re]) => re.test(stem)) || [, ["pdf", "docx", "pdf", "md", "xlsx"]])[1];
  const SIZES = { pdf: [80e3, 6e6], docx: [15e3, 9e5], xlsx: [2e4, 2e6], csv: [2e3, 5e6], pptx: [5e5, 2e7], txt: [200, 2e4], md: [300, 3e4],
    png: [5e4, 8e6], jpg: [5e4, 6e6], zip: [1e6, 2e8], json: [1e3, 5e5], mp4: [5e6, 4e8] };
  const SUFFIX = ["-2026-08", "-2026-09", "-2026-10", "-v2", "-final", "-draft", ""];

  const buckets = SPACES.map(([name, project, mode]) => ({ name, project, mode }));
  const objects = [];
  const text = (stem, ext) => ext === "csv" ? "id,value,when\n1,0.82,2026-10-01\n2,0.79,2026-10-02\n3,0.91,2026-10-03"
    : ext === "json" ? `{"name": "${stem}", "version": 3, "fields": ["id", "value", "when"]}`
    : ["md", "txt"].includes(ext) ? `${stem.replace(/-/g, " ")}\n\nFirst paragraph of the demo text.\n\nSecond paragraph, with the details.` : null;

  function addObject(o) {
    const k = fileKindOf(o.key);
    objects.push({ kind: "object", label: "internal", body: text(o.key.split("/").pop().replace(/\.[^.]+$/, ""), k), ...o });
  }
  const fileKindOf = key => (/\.([a-z0-9]+)$/.exec(key) || [, ""])[1];

  addObject({ bucket: "shared", key: "q4/plan.txt", owner: "alice", size: 17, modified: "2026-11-01T10:42:00Z", body: "Q4 plan: ship it" });
  addObject({ bucket: "shared", key: "q4/notes.md", kind: "document", owner: "alice", size: 38, modified: "2026-11-01T10:51:00Z" });
  addObject({ bucket: "shared", key: "q4/budget.xlsx", owner: "bob", label: "confidential", size: 48213, modified: "2026-10-30T15:07:00Z" });
  addObject({ bucket: "reports", key: "q3/report.pdf", owner: "alice", label: "confidential", size: 1843000, modified: "2026-10-28T09:12:00Z" });
  addObject({ bucket: "reports", key: "q3/summary.txt", kind: "derived", owner: "alice", size: 3200, modified: "2026-10-28T09:20:00Z" });
  addObject({ bucket: "research", key: "r/experiment.csv", owner: "carl", size: 9120, modified: "2026-10-31T13:30:00Z" });

  for (const [name, project, , folders, count, stems] of SPACES) {
    const owners = members(project);
    const labelBias = ["payroll", "board", "contracts"].includes(name) ? [["internal", 2], ["confidential", 5], ["restricted", 3]]
      : name === "handbook" ? [["public", 5], ["internal", 4], ["confidential", 1]]
      : [["public", 2], ["internal", 10], ["confidential", 5], ["restricted", 1]];
    let made = 0, tries = 0;
    while (made < count && tries++ < count * 6) {
      const stem = pick(stems), ext = pick(extFor(stem));
      const key = `${pick(folders)}/${stem}${pick(SUFFIX)}.${ext}`;
      if (objects.some(o => o.bucket === name && o.key === key)) continue;
      const [lo, hi] = SIZES[ext];
      const kind = ["md", "txt", "docx"].includes(ext) && chance(0.35) ? "document" : ext === "txt" && chance(0.3) ? "derived" : "object";
      addObject({ bucket: name, key, kind, owner: pick(owners).id, label: weighted(labelBias), size: Math.round(lo * Math.pow(hi / lo, rnd())),
        modified: iso(NOW - between(0.1, 120) * 864e5) });
      made++;
    }
  }

  // Shares: grants on single files (fga share grants, SHR-001). Each names
  // the grantee, what they may do and until when.
  const shares = [];
  const everyone = principals.filter(p => p.kind === "user" && p.status === "active");
  for (const o of objects) {
    const space = buckets.find(b => b.name === o.bucket);
    if (o.kind !== "object" || space.mode !== "server" || !chance(0.08)) continue;
    const n = chance(0.3) ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const g = pick(everyone);
      if (g.id === o.owner || shares.some(s => s.bucket === o.bucket && s.key === o.key && s.grantee === g.id)) continue;
      shares.push({ bucket: o.bucket, key: o.key, grantee: g.id, actions: chance(0.7) ? ["read", "stat", "discover"] : ["discover", "stat"],
        expires: iso(NOW + between(1, 60) * 864e5), grantor: o.owner, created: iso(NOW - between(0.1, 20) * 864e5) });
    }
  }

  const approvals = [
    { id: "a1f3c9", bucket: "reports", key: "q3/report.pdf", from: "confidential", to: "internal", requester: "alice", created: "2026-11-01T11:00:05Z", state: "pending" },
  ];
  for (const o of objects.filter(x => x.label !== "public" && x.bucket !== "reports" && x.kind === "object")) {
    if (approvals.length >= 7 || !chance(0.04)) continue;
    approvals.push({ id: Math.floor(rnd() * 0xffffff).toString(16).padStart(6, "0"), bucket: o.bucket, key: o.key, from: o.label,
      to: labels[labels.indexOf(o.label) - 1], requester: o.owner, created: iso(NOW - between(0.05, 3) * 864e5), state: "pending" });
  }

  // ---------------------------------------------------------------- tools and servers

  const tools = [
    { id: "notify", name: "Send a notification", description: "Posts a message to the team's chat", destination: "hooks", reviewed: true },
    { id: "create-ticket", name: "Create a ticket", description: "Opens a ticket at the service desk", destination: "tickets", reviewed: true },
    { id: "invoice-lookup", name: "Look up an invoice", description: "Finds an invoice by its number", destination: "billing", reviewed: true },
    { id: "translate", name: "Translate text", description: "Translates a short text", destination: "translator", reviewed: false },
  ];
  const destinations = [
    { id: "hooks", url: "http://127.0.0.1:28447", cidrs: "127.0.0.0/8", approved: true },
    { id: "tickets", url: "https://desk.example.com/api", cidrs: "203.0.113.0/24", approved: true },
    { id: "billing", url: "https://billing.example.org/v2", cidrs: "192.0.2.0/24", approved: true },
    { id: "translator", url: "https://translate.example.net", cidrs: "198.51.100.0/24", approved: false },
  ];
  const mcp = { enabled: true, tools: ["resources.list", "resources.read", "documents.search", "documents.read", "text.read", "documents.export"] };

  const issuer = { issuer: "https://login.example.org/", jwks_url: "https://login.example.org/.well-known/jwks.json" };
  const tls = name => ({ cert_file: `/etc/fga/tls/${name}.crt`, key_file: `/etc/fga/tls/${name}.key`, client_ca_file: "/etc/fga/tls/clients-ca.crt" });
  const db = "postgres://fga:SECRET@db-1.internal:5432/fga";
  const decisionPeer = { url: "https://fga-core-1.internal:27443" };
  const server = (role, name, purpose, host, listen, extra = {}) => ({ role, name, purpose, host, status: "running",
    settings: { version: 1, profile: "production", listen, tls: tls(role), database_url: db, token_issuer: issuer, ...extra } });
  const servers = [
    server("decision", "fga-decision", "Decides every request", "fga-core-1", "0.0.0.0:27443", { bundle_dir: "/etc/fga/bundle" }),
    server("storage", "fga-storage", "Stores files and documents", "fga-store-1", "0.0.0.0:28441",
      { decision: decisionPeer, blob_dir: "/var/lib/fga/blobs", journal_dir: "/var/lib/fga/journal" }),
    server("keys", "fga-keys", "Hands out file keys", "fga-core-1", "0.0.0.0:28442", { decision: decisionPeer, journal_dir: "/var/lib/fga/journal" }),
    server("kms", "fga-kms", "Keeps the master keys", "fga-vault-1", "0.0.0.0:28449", { kek_file: "/etc/fga/kek/ring.json" }),
    server("mcp", "fga-mcp", "Connects AI assistants", "fga-edge-1", "0.0.0.0:28446", { decision: decisionPeer, storage_url: "https://fga-store-1.internal:28441" }),
    server("tools", "fga-tools", "Runs tools", "fga-edge-1", "0.0.0.0:28448", { decision: decisionPeer }),
    server("admin", "fga-admin", "Serves this console's changes", "fga-core-1", "0.0.0.0:8450",
      { journal_dir: "/var/lib/fga/journal", audience: "fga-admin", consoles: ["spiffe://example.org/fga-console"], admins: { "t-acme": ["admin"] } }),
  ];

  const state = {
    org: { id: "t-acme", name: "Acme (demo)" },
    bundle: { epoch: 1, keyId: "publisher-1", activated: "2026-11-01T09:58:00Z", labels },
    rules, permSets, profiles, types, projects, principals, delegations, buckets, objects, shares, approvals, tools, destinations, mcp, servers,
    audit: [], roleInfo: {}, extraRoles: [],
  };
  return { initialState: () => structuredClone(state), now: NOW };
})();

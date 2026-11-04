// Plain words for everything fga names in code: kinds of things, actions,
// roles, permission sets, sensitivity labels and rule conditions. Every
// page takes its words from here, so one thing is always called the same.
// The technical name stays on hover, and beside the word when "Technical
// names" is switched on.
"use strict";

window.FGA_WORDS = (() => {
  const TYPES = {
    "storage.bucket": ["Space", "Spaces", "a space", "A storage area that holds one project's files"],
    "storage.object": ["File", "Files", "a file", "A stored file, such as a PDF, a spreadsheet or an image"],
    "document.version": ["Document", "Documents", "a document", "A text document that fga splits into sections, so access can differ per section"],
    "document.text_unit": ["Document section", "Document sections", "a section of a document", "One section of a document, with its own sensitivity"],
    "document.derived": ["Summary", "Summaries", "a summary", "A summary or extract made from documents"],
    "text.entry": ["Text entry", "Text entries", "a text entry", "One entry of a text collection, such as a chat log"],
    "crypto.envelope": ["Key share", "Key shares", "a key share", "A file's key, encrypted for one person, in end-to-end encrypted spaces"],
    "crypto.recipient": ["Personal key", "Personal keys", "a personal key", "A person's encryption key, for receiving key shares"],
    "crypto.signing-key": ["Signing key", "Signing keys", "a signing key", "A key that proves who made a file or a label"],
    "network.destination": ["External address", "External addresses", "an external address", "A web address outside fga that tools may send data to"],
    "agent.tool": ["Tool", "Tools", "a tool", "An action people or AI agents can run, such as sending a notification"],
    "directory.project": ["Project", "Projects", "a project", "A team with its own spaces: its members use the files in them"],
  };

  const ACTIONS = {
    list: ["See what's inside", "See the list of files in it"],
    "create-object": ["Upload", "Add new files to it"],
    approve: ["Approve requests", "Decide on requests that need a second person"],
    manage: ["Change settings", "Change its settings"],
    share: ["Share", "Give other people access to it"],
    read: ["Open", "Open and download it"],
    stat: ["See details", "See its size, owner and dates"],
    discover: ["Find", "See that it exists, in lists and searches"],
    "read-history": ["Open old versions", "Open earlier versions of it"],
    "discover-history": ["See version history", "See the list of its earlier versions"],
    "new-version": ["Replace", "Upload a new version of it"],
    delete: ["Delete", "Delete it"],
    "delete-version": ["Delete old versions", "Delete earlier versions of it"],
    label: ["Raise sensitivity", "Mark it as more sensitive"],
    relabel: ["Lower sensitivity", "Mark it as less sensitive"],
    "propose-label": ["Suggest sensitivity", "Suggest a sensitivity for someone else to set"],
    export: ["Export", "Take a copy out of fga"],
    "read-units": ["Read", "Read its sections"],
    "raw-read": ["Download original", "Download the file as it was uploaded"],
    "export-key": ["Export key", "Take its key out of fga"],
    deliver: ["Receive", "Receive it"],
    declassify: ["Receive declassified", "Receive a copy with the sensitive parts removed"],
    update: ["Edit", "Change it"],
    "use-in-model": ["Use with AI", "Give it to an AI model"],
    create: ["Create", "Create it"],
    release: ["Hand out", "Hand the key to the person it is meant for"],
    retire: ["Retire", "Stop using it"],
    enroll: ["Register", "Register a new key"],
    activate: ["Activate", "Put a registered key to use"],
    "receive-key": ["Receive keys", "Receive keys to files shared with them"],
    revoke: ["Revoke", "Stop the key from being used"],
    send: ["Send data", "Send data to this address"],
    invoke: ["Run", "Run it"],
    resolve: ["Resolve", "Settle a run whose result is not known"],
    "write-off": ["Write off", "Accept the cost of a failed run"],
    "create-space": ["Create spaces", "Create a new space in the project"],
    "manage-members": ["Add and remove members", "Choose who belongs to the project"],
    "manage-leads": ["Choose team leads", "Choose who leads the project"],
    rename: ["Rename", "Change its name and description"],
    "post-reading": ["Send readings", "Send readings from a device or system into it"],
  };
  const TYPE_ACTIONS = {
    "document.text_unit": { read: ["Read", "Read this section"] },
    "text.entry": { read: ["Read", "Read the entry"] },
    "directory.project": { create: ["Create projects", "Start a new project, and lead it"] },
  };

  const ROLES = {
    "*": ["Everyone", "Everyone", "Every active person and agent"],
    member: ["Member", "Members", "Works in a project: finds, opens and uploads its files"],
    lead: ["Team lead", "Team leads", "Approves requests and manages the project's spaces"],
    auditor: ["Auditor", "Auditors", "Sees the history of files, in every project"],
    contractor: ["Contractor", "Contractors", "Works for a project but may never open files"],
    guest: ["Guest", "Guests", "Can sign in; sees only what is shared with them"],
    agent: ["AI agent", "AI agents", "Software that acts for a person"],
    steward: ["File steward", "File stewards", "Gives people access to single files, without being able to open them"],
    source: ["Sending system", "Sending systems", "A device or system that sends readings to its data sources, and may do nothing else"],
  };

  // Names of rights fga itself defines; the console's own rights carry
  // their names in the data.
  const SETS = {};

  const LABELS = {
    public: ["Public", "Anyone in the organisation may know it"],
    internal: ["Internal", "For the project's people"],
    confidential: ["Confidential", "For named people only"],
    restricted: ["Restricted", "The most sensitive; extra rules apply"],
  };

  const ENCRYPTION = {
    server: ["Encrypted by fga", "fga encrypts the files and decides who may read them"],
    client: ["End-to-end encrypted", "Files are encrypted on people's own computers; only people given a key can read them"],
  };

  const STAGES = {
    default: "No rule allows it",
    bound: "Not one of their rights",
    disabled: "The person is disabled",
    unknown: "Unknown person",
  };

  const FILE_KINDS = {
    pdf: ["PDF", "pdf"], docx: ["Word document", "doc"], doc: ["Word document", "doc"], xlsx: ["Spreadsheet", "sheet"],
    csv: ["CSV data", "sheet"], pptx: ["Presentation", "slides"], txt: ["Text", "file"], md: ["Markdown text", "file"],
    png: ["Image", "image"], jpg: ["Image", "image"], svg: ["Image", "image"], zip: ["Archive", "archive"],
    json: ["JSON data", "code"], mp4: ["Video", "video"],
  };

  // Condition phrases: what the console can say in words, the expression
  // it stands for, and the kinds of things it fits.
  // sharedKey names an action inside shared_with: CEL needs ["read-units"]
  // where a plain .name would read as a subtraction.
  const sharedKey = a => (/^[a-z]+$/.test(a) ? `.${a}` : `["${a}"]`);
  const honorsShare = (rule, a) => rule.when.includes(`shared_with${sharedKey(a)}`);
  const PROJECT_TYPES = ["storage.bucket", "storage.object", "document.version", "document.text_unit", "document.derived", "text.entry"];
  const OWNED_TYPES = ["storage.object", "document.version", "document.text_unit", "document.derived", "text.entry", "crypto.envelope"];
  const GRANTABLE = {
    "storage.bucket": ["list"], "storage.object": ["read", "stat", "discover"], "document.version": ["read-units", "discover"],
    "document.text_unit": ["read"], "text.entry": ["read"], "document.derived": ["deliver"],
  };
  const CONDITIONS = [
    { id: "project", text: "it belongs to one of their projects", expr: "resource.attributes.project in principal.attributes.projects", types: [...PROJECT_TYPES, "agent.tool"],
      textFor: { "directory.project": "they are a member of it", "agent.tool": "its data source belongs to one of their projects" } },
    { id: "leads", text: "they lead its project", expr: "resource.attributes.project in principal.attributes.leads",
      types: [...PROJECT_TYPES, "directory.project"], textFor: { "directory.project": "they lead it" } },
    { id: "leads-any", text: "they lead a project", expr: "has(principal.attributes.leads) && principal.attributes.leads != []", types: ["agent.tool"] },
    { id: "owner", text: "they own it", expr: "resource.attributes.owner == principal.id", types: OWNED_TYPES },
    { id: "shared", text: "it was shared with them", oneAction: true, types: Object.keys(GRANTABLE),
      expr: a => `has(resource.attributes.shared_with) && principal.id in resource.attributes.shared_with${sharedKey(a)}` },
    { id: "below-restricted", text: "it is less sensitive than Restricted", expr: "resource.attributes.label_rank < 3", types: ["document.text_unit", "storage.object"] },
    { id: "not-self", text: "they are not giving access to themselves", types: Object.keys(GRANTABLE),
      expr: "(!has(resource.attributes.grantee) || resource.attributes.grantee != principal.id)" },
    { id: "recipient", text: "it is meant for them", expr: "resource.attributes.recipient_principal == principal.id", types: ["crypto.envelope"] },
    { id: "own-key", text: "it is their own key", expr: "resource.attributes.principal == principal.id", types: ["crypto.recipient", "crypto.signing-key"] },
    { id: "inactive-key", text: "the key is not active", expr: 'resource.attributes.status != "ACTIVE"', types: ["crypto.recipient"] },
    { id: "approved", text: "the address is approved", expr: "resource.attributes.approved == true", types: ["network.destination"] },
    { id: "tool", text: "it is a registered tool", expr: 'resource.attributes.kind == "executor"', types: ["agent.tool"] },
    { id: "mcp", text: "it is an AI assistant tool", expr: 'resource.attributes.kind == "mcp"', types: ["agent.tool"] },
    { id: "data", text: "it is a data tool", expr: 'resource.attributes.kind == "data"', types: ["agent.tool"] },
  ];
  // A data tool's source is a condition with a value: "source:<id>".
  const sourceCondition = id => ({ id: `source:${id}`, text: `it serves the data source ${id}`, expr: `resource.attributes.source == "${id}"`, types: ["agent.tool"] });
  const PATTERNS = [
    [/^resource\.attributes\.project in principal\.attributes\.projects$/, "project"],
    [/^resource\.attributes\.project in principal\.attributes\.leads$/, "leads"],
    [/^has\(principal\.attributes\.leads\) && principal\.attributes\.leads != \[\]$/, "leads-any"],
    [/^resource\.attributes\.owner == principal\.id$/, "owner"],
    [/^(?:has\(resource\.attributes\.shared_with\) && )?principal\.id in resource\.attributes\.shared_with(?:\.[a-z]+|\["[a-z-]+"\])$/, "shared"],
    [/^resource\.attributes\.label_rank < 3$/, "below-restricted"],
    [/^\(!has\(resource\.attributes\.grantee\) \|\| resource\.attributes\.grantee != principal\.id\)$/, "not-self"],
    [/^resource\.attributes\.recipient_principal == principal\.id$/, "recipient"],
    [/^resource\.attributes\.principal == principal\.id$/, "own-key"],
    [/^resource\.attributes\.status != "ACTIVE"$/, "inactive-key"],
    [/^resource\.attributes\.approved == true$/, "approved"],
    [/^resource\.attributes\.kind == "executor"$/, "tool"],
    [/^resource\.attributes\.kind == "mcp"$/, "mcp"],
    [/^resource\.attributes\.kind == "data"$/, "data"],
    [/^resource\.attributes\.source == "([a-z0-9][a-z0-9-]{0,39})"$/, m => `source:${m[1]}`],
  ];

  // Names given in the console (new roles, permission sets) take
  // precedence over the built-in words.
  const custom = { roles: {}, sets: {} };

  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const human = id => cap(String(id).replace(/[-_.]+/g, " "));
  const plural = s => (/s$/.test(s) ? s : /y$/.test(s) && !/[aeiou]y$/.test(s) ? s.slice(0, -1) + "ies" : s + "s");

  function type(t) {
    const o = TYPES[t];
    return o ? { one: o[0], many: o[1], a: o[2], help: o[3] } : { one: human(t), many: plural(human(t)), a: human(t), help: "" };
  }
  function action(a, t) {
    const o = (TYPE_ACTIONS[t] || {})[a] || ACTIONS[a];
    return o ? { label: o[0], help: o[1] } : { label: human(a), help: "" };
  }
  function role(r) {
    const c = custom.roles[r];
    if (c) return { one: c.name, many: c.many || plural(c.name), help: c.help || "" };
    const o = ROLES[r];
    return o ? { one: o[0], many: o[1], help: o[2] } : { one: human(r), many: plural(human(r)), help: "" };
  }
  function set(id, sets) {
    const c = custom.sets[id] || (sets && sets[id]);
    if (SETS[id]) return { name: SETS[id][0], help: SETS[id][1] };
    return { name: c ? c.name : human(id), help: c && c.help ? c.help : "" };
  }
  const label = l => (LABELS[l] ? { name: LABELS[l][0], help: LABELS[l][1] } : { name: human(l), help: "" });
  const encryption = m => ({ name: ENCRYPTION[m][0], help: ENCRYPTION[m][1] });
  const fileKind = key => {
    const ext = (/\.([a-z0-9]+)$/i.exec(key) || [, ""])[1].toLowerCase();
    const o = FILE_KINDS[ext];
    return o ? { name: o[0], icon: o[1], ext } : { name: "File", icon: "file", ext };
  };

  // splitAnd splits an expression at the && that are outside brackets.
  function splitAnd(expr) {
    const parts = [];
    let depth = 0, str = false, start = 0;
    for (let i = 0; i < expr.length; i++) {
      const c = expr[i];
      if (c === '"' && expr[i - 1] !== "\\") str = !str;
      if (str) continue;
      if (c === "(" || c === "[") depth++;
      if (c === ")" || c === "]") depth--;
      if (depth === 0 && expr.startsWith("&&", i)) { parts.push(expr.slice(start, i).trim()); start = i + 2; i++; }
    }
    parts.push(expr.slice(start).trim());
    return parts.filter(Boolean);
  }

  // matchCondition reads an expression as condition phrases. Parts it
  // cannot read stay as a custom condition, shown as written.
  function matchCondition(expr) {
    const norm = String(expr || "").replace(/\s+/g, " ").trim();
    if (!norm) return { ids: [], custom: "", grantAction: null };
    const parts = splitAnd(norm), ids = [], rest = [];
    let grantAction = null;
    for (let i = 0; i < parts.length;) {
      let hit = null;
      for (let j = parts.length; j > i && !hit; j--) {
        const cand = parts.slice(i, j).join(" && ");
        const p = PATTERNS.find(([re]) => re.test(cand));
        if (p) hit = { id: typeof p[1] === "function" ? p[1](p[0].exec(cand)) : p[1], next: j, cand };
      }
      if (hit) {
        ids.push(hit.id);
        if (hit.id === "shared") { const g = /shared_with(?:\.([a-z]+)|\["([a-z-]+)"\])$/.exec(hit.cand); grantAction = g[1] || g[2]; }
        i = hit.next;
      } else rest.push(parts[i++]);
    }
    return { ids, custom: rest.join(" && "), grantAction };
  }

  const condition = id => (id.startsWith("source:") ? sourceCondition(id.slice(7)) : CONDITIONS.find(c => c.id === id));
  const conditionsFor = t => CONDITIONS.filter(c => c.types.includes(t));
  const condText = (c, t) => (c.textFor && c.textFor[t]) || c.text;

  // describe gives a condition in words: null when the rule always applies.
  function describe(expr, t) {
    const m = matchCondition(expr);
    if (!m.ids.length && !m.custom) return null;
    const phrases = m.ids.map(id => condText(condition(id), t));
    if (m.custom) phrases.push("a custom condition holds");
    return { text: phrases.join(" and "), custom: m.custom };
  }

  // conditionExpr builds an expression from chosen phrases and a custom part.
  function conditionExpr(ids, customText, actions) {
    const parts = ids.map(id => {
      const c = condition(id);
      return typeof c.expr === "function" ? c.expr(actions[0]) : c.expr;
    });
    if (customText && customText.trim()) parts.push(customText.trim());
    return parts.join(" && ");
  }

  // rule gives a rule's parts in words, for sentences and nodes.
  function rule(r) {
    const roles = r.roles.length ? r.roles.map(x => role(x).many) : ["Nobody"];
    const who = roles.length > 1 ? `${roles.slice(0, -1).join(", ")} and ${roles[roles.length - 1]}` : roles[0];
    return {
      who, verb: r.effect === "deny" ? "may never" : "may",
      kind: r.set === "ceiling" ? "Hard limit" : r.effect === "deny" ? "Never allows" : "Allows",
      actions: r.actions.map(a => action(a, r.type).label), what: type(r.type).a,
      when: describe(r.when, r.type),
    };
  }

  // ruleTitle suggests a name for a rule from its parts.
  function ruleTitle(r) {
    const w = rule(r);
    const acts = w.actions.length ? w.actions.slice(0, 2).join(", ").toLowerCase() + (w.actions.length > 2 ? "…" : "") : "do nothing";
    return `${w.who} ${w.verb} ${acts} on ${type(r.type).many.toLowerCase()}`;
  }

  return {
    TYPES, ACTIONS, ROLES, LABELS, GRANTABLE, CONDITIONS, custom, sharedKey, honorsShare,
    type, action, role, set, label, encryption, fileKind, describe, matchCondition, condition, conditionsFor, condText, conditionExpr,
    rule, ruleTitle, stage: s => STAGES[s] || human(s), human, plural, cap,
  };
})();

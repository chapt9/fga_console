// The fga console mockup: the shared parts (state, words, decisions,
// routing, the page shell, drawers, pending changes), sign-in and the
// pages every user has. admin.js adds the administrator's pages and
// graphview.js the access graph. Every allow and deny on these pages comes
// from policy.js deciding against the demo rules, so the pages show what
// fga would decide. Nothing is sent anywhere.
"use strict";

(() => {
  const M = window.FGA_MOCK, P = window.FGA_POLICY, W = window.FGA_WORDS;
  const app = document.getElementById("app");
  const S = M.initialState();
  const baseline = structuredClone(S);   // the state as last applied; discarding returns to it
  const started = Date.now();
  const A = window.FGA_APP = { S, W, P, baseline, me: null, tech: false, acts: {}, routes: {}, changes: [] };
  const acts = A.acts;
  W.custom.roles = S.roleInfo;

  // ---------------------------------------------------------------- helpers

  const ICONS = {
    mark: '<path d="M12 3l7 3v6c0 4.4-3 7.4-7 9-4-1.6-7-4.6-7-9V6z"/><path d="M9 12l2 2 4-4"/>',
    files: '<path d="M4 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/>',
    folder: '<path d="M4 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/>',
    inbox: '<path d="M4 13l2.2-7h11.6L20 13v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/><path d="M4 13h5l1 2h4l1-2h5"/>',
    activity: '<path d="M3 12h4l3-7 4 14 3-7h4"/>',
    home: '<path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1z"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c1.9.8 3.1 2.5 3.5 5.2"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4.4 4.2-6.5 8-6.5s7 2.1 8 6.5"/>',
    bot: '<rect x="5" y="8" width="14" height="11" rx="3"/><path d="M12 4v4M9 13h.01M15 13h.01M9.5 16.5h5"/>',
    role: '<path d="M12 3l7 3v6c0 4.4-3 7.4-7 9-4-1.6-7-4.6-7-9V6z"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l8-8M16 7l3 3"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    bucket: '<rect x="3" y="5" width="18" height="6" rx="1.5"/><rect x="3" y="13" width="18" height="6" rx="1.5"/><path d="M7 8h.01M7 16h.01"/>',
    bolt: '<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>',
    policy: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M10 12h5M10 16h5"/>',
    graph: '<circle cx="5" cy="6" r="2.2"/><circle cx="5" cy="18" r="2.2"/><circle cx="19" cy="12" r="2.2"/><path d="M7.2 6.5c5 .5 5.5 5 9.6 5.3M7.2 17.5c5-.5 5.5-5 9.6-5.3"/>',
    audit: '<path d="M8 4h8M8 4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2"/><path d="M9 11l2 2 4-4M9 17h6"/>',
    logout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 8l-4 4 4 4M6 12h10"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    search: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>',
    lock: '<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    server: '<rect x="4" y="4" width="16" height="7" rx="1.5"/><rect x="4" y="13" width="16" height="7" rx="1.5"/><path d="M8 7.5h.01M8 16.5h.01"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
    upload: '<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>',
    share: '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.3 10.8l7.4-3.6M8.3 13.2l7.4 3.6"/>',
    tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
    fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    layout: '<rect x="3" y="4" width="6" height="6" rx="1.2"/><rect x="15" y="4" width="6" height="6" rx="1.2"/><rect x="9" y="14" width="6" height="6" rx="1.2"/><path d="M6 10v2h12v-2M12 12v2"/>',
    play: '<path d="M7 5l12 7-12 7z"/>',
    file: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4"/>',
    doc: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M10 12h5M10 16h3"/>',
    pdf: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4"/><path d="M9.5 17v-4h1.5a1.2 1.2 0 0 1 0 2.4H9.5"/>',
    sheet: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 10h16M4 15h16M10 4v16"/>',
    slides: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M12 16v4M8 20h8"/>',
    image: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5-8 8"/>',
    archive: '<rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4"/>',
    video: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3"/>',
    code: '<path d="M8 8l-4 4 4 4M16 8l4 4-4 4"/>',
    derived: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4"/><path d="M10 16l2-4 2 4"/>',
    flask: '<path d="M9 3h6M10 3v6L5 18a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3L14 9V3"/><path d="M7.5 14h9"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    chevron: '<path d="M9 6l6 6-6 6"/>',
    back: '<path d="M15 6l-6 6 6 6"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 15H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 9 4.6V4.5a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 19.4 9H19.5a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 2z"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    warn: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17h.01"/>',
    tech: '<path d="M8 8l-4 4 4 4M16 8l4 4-4 4M13.5 6l-3 12"/>',
    more: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
  };
  const icon = (n, cls = "") => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ""}</svg>`;
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const hue = id => [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 8;
  const displayName = id => id === "admin" ? "Administrator" : /^agent-/.test(id) ? `Agent ${id.slice(6)}`
    : String(id).split(".").map(W.cap).join(" ");
  const initials = id => id === "admin" ? "A" : /^agent-/.test(id) ? "AI" : String(id).split(".").map(s => s[0]).join("").slice(0, 2);
  const avatar = (id, cls = "") => id === "admin"
    ? `<span class="avatar admin ${cls}">A</span>`
    : `<span class="avatar c${hue(id)} ${cls}" title="${esc(displayName(id))}">${esc(initials(id))}</span>`;
  const clock = () => M.now + (Date.now() - started);
  const nowIso = () => new Date(clock()).toISOString();
  const when = iso => new Date(iso).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const day = iso => new Date(iso).toLocaleDateString([], { day: "numeric", month: "short" });
  const time = iso => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const ago = iso => {
    const s = (clock() - Date.parse(iso)) / 1000;
    if (s < 90) return "just now";
    if (s < 5400) return `${Math.round(s / 60)} min ago`;
    if (s < 129600) return `${Math.round(s / 3600)} h ago`;
    return day(iso);
  };
  const bytes = n => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : n < 1073741824 ? `${(n / 1048576).toFixed(1)} MB` : `${(n / 1073741824).toFixed(1)} GB`);
  const val = id => { const el = document.getElementById(id); return el ? el.value : ""; };
  const checked = sel => [...document.querySelectorAll(sel)].filter(x => x.checked);
  const unique = (base, taken) => { if (!taken(base)) return base; let i = 2; while (taken(`${base}-${i}`)) i++; return `${base}-${i}`; };
  const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
  const currentPath = () => (location.hash.slice(1) || "/login").split("?")[0];
  const go = path => { if (location.hash.slice(1) === path) route(); else location.hash = path; };
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many || W.plural(one)}`;

  // Technical names: shown beside the plain word when switched on, and in
  // the hover text always.
  const tech = code => (A.tech ? ` <code class="tech">${esc(code)}</code>` : "");
  const typeName = (t, many) => `<span title="${esc(W.type(t).help)} · ${esc(t)}">${esc(many ? W.type(t).many : W.type(t).one)}</span>${tech(t)}`;
  const actChip = (a, t, cls = "") => { const w = W.action(a, t); return `<span class="chip ${cls}" title="${esc(w.help)} · ${esc(a)}">${esc(w.label)}${tech(a)}</span>`; };
  const roleName = (r, many) => esc(many ? W.role(r).many : W.role(r).one);
  const roleChip = (r, cls = "") => `<span class="chip role-chip ${cls}" title="${esc(W.role(r).help)} · ${esc(r)}">${roleName(r)}${tech(r)}</span>`;
  const labelChip = l => `<span class="chip label-chip label-${esc(l)}" title="${esc(W.label(l).help)}">${esc(W.label(l).name)}</span>`;
  const projectName = id => (S.projects.find(p => p.id === id) || { name: id }).name;
  const projChip = id => `<span class="chip proj-chip" title="Project ${esc(projectName(id))} · ${esc(id)}">${esc(projectName(id))}${tech(id)}</span>`;
  const setName = id => esc(W.set(id, S.permSets).name);
  const ruleTitle = r => r.name || W.ruleTitle(r);

  const person = id => S.principals.find(p => p.id === id);
  const bucketOf = name => S.buckets.find(b => b.name === name);
  const findObj = (bucket, key) => S.objects.find(o => o.bucket === bucket && o.key === key);
  const rank = l => S.bundle.labels.indexOf(l);
  const allRoles = () => [...new Set([...S.principals.flatMap(p => p.roles), ...S.rules.flatMap(r => r.roles), ...S.extraRoles,
    ...Object.keys(S.roleInfo)])].filter(r => r !== "*").sort((a, b) => W.role(a).one.localeCompare(W.role(b).one));
  const rolesText = id => {
    const p = person(id);
    if (!p) return "";
    const projects = p.attributes.projects || [];
    return `${p.roles.map(r => W.role(r).one).join(", ") || "No role"}${projects.length ? ` · ${projects.map(projectName).join(", ")}` : ""}`;
  };
  const people = () => S.principals.filter(p => p.kind === "user");
  const matchPerson = (p, q) => !q || p.id.includes(q.toLowerCase()) || displayName(p.id).toLowerCase().includes(q.toLowerCase());

  function toast(text, tone = "") {
    const t = document.createElement("div");
    t.className = `toast ${tone}`;
    t.innerHTML = `${icon(tone === "bad" ? "x" : "check")}<span>${esc(text)}</span>`;
    document.getElementById("toasts").appendChild(t);
    setTimeout(() => t.remove(), 4600);
  }

  // ---------------------------------------------------------------- decisions

  const capsOf = (p, type) => [...new Set(p.grants.flatMap(g => (S.permSets[g] && S.permSets[g].caps[type]) || []))];
  const objType = o => ({ object: "storage.object", document: "document.version", derived: "document.derived" })[o.kind];
  const openAction = o => ({ object: "read", document: "read-units", derived: "deliver" })[o.kind];
  const findAction = o => ({ object: "discover", document: "discover", derived: "deliver" })[o.kind];
  const activeShares = o => S.shares.filter(s => s.bucket === o.bucket && s.key === o.key && Date.parse(s.expires) > clock());

  // objRes is a file as the rules see it. extra.grant adds a planned share,
  // and extra.grantee names the person a share would go to.
  function objRes(o, extra = {}) {
    const type = objType(o), shared = {};
    for (const a of W.GRANTABLE[type] || []) shared[a] = [];
    const grants = activeShares(o).concat(extra.grant ? [extra.grant] : []);
    for (const g of grants) for (const a of g.actions) if (shared[a] && !shared[a].includes(g.grantee)) shared[a].push(g.grantee);
    return { type, id: `${o.bucket}/${o.key}`, attributes: { project: bucketOf(o.bucket).project, owner: o.owner, label: o.label,
      label_rank: rank(o.label), shared_with: shared, ...(extra.grantee ? { grantee: extra.grantee } : {}) } };
  }
  const bucketRes = b => ({ type: "storage.bucket", id: b.name, attributes: { project: b.project } });

  function decide(pid, action, resource) {
    const p = person(pid);
    if (!p) return { allowed: false, stage: "unknown", trace: [{ ok: false, text: `${displayName(pid)} is not in the directory` }] };
    return P.decide({ principal: p, caps: capsOf(p, resource.type), action, resource, rules: S.rules });
  }

  // decideFor decides for an agent acting for a person: the rules see the
  // person, and the agent may do only what both its own permission sets and
  // its permission to act allow.
  function decideFor(dlgId, action, resource) {
    const d = S.delegations.find(x => x.id === dlgId), agent = person(d.actor), subject = person(d.subject);
    if (!agent || !subject) return { allowed: false, stage: "unknown", trace: [{ ok: false, text: "No agent or no person yet" }] };
    const caps = capsOf(agent, resource.type).filter(a => (d.grants[resource.type] || []).includes(a));
    const res = P.decide({ principal: subject, caps, action, resource, rules: S.rules });
    res.trace.unshift({ ok: true, text: `${displayName(agent.id)} acts for ${displayName(subject.id)}: the rules look at ${displayName(subject.id)}` });
    return res;
  }

  const whyText = res => (res.rule ? ruleTitle(res.rule) : W.stage(res.stage));

  // plainTrace rewrites a decision's steps in plain words.
  function plainTrace(res, pid, action, type) {
    const who = displayName(pid), what = W.action(action, type).label.toLowerCase(), thing = W.type(type).a;
    const steps = [];
    if (res.stage === "disabled") return [{ ok: false, text: `${who} is disabled` }];
    if (res.stage === "unknown") return res.trace;
    if (res.stage === "bound") return [{ ok: false, text: `None of ${who}'s permission sets includes "${what}" on ${thing}` }];
    steps.push({ ok: true, text: `A permission set of ${who} includes "${what}" on ${thing}` });
    if (res.stage === "ceiling") steps.push({ ok: false, text: `Hard limit: ${ruleTitle(res.rule)}` });
    else if (res.stage === "deny") steps.push({ ok: false, text: `Forbidden by "${ruleTitle(res.rule)}"; a forbidding rule always wins` });
    else if (res.stage === "allow") {
      const w = W.rule(res.rule);
      steps.push({ ok: true, text: `Allowed by "${ruleTitle(res.rule)}"${w.when ? `, because ${w.when.text}` : ""}` });
      steps.push({ ok: true, text: "No rule forbids it" });
    } else steps.push({ ok: false, text: `No rule allows it for ${who}, so it is not allowed` });
    return steps;
  }

  // whoCan decides one action on one resource for every active person,
  // grouped by the rule that decided: the basis of "who has access".
  function whoCan(resource, action) {
    const allowed = new Map(), forbidden = new Map();
    let others = 0;
    for (const p of S.principals) {
      if (p.status !== "active" || p.kind !== "user") continue;
      const res = decide(p.id, action, resource);
      const into = res.allowed ? allowed : res.rule ? forbidden : null;
      if (!into) { others++; continue; }
      if (!into.has(res.rule.id)) into.set(res.rule.id, { rule: res.rule, people: [] });
      into.get(res.rule.id).people.push(p.id);
    }
    return { allowed: [...allowed.values()], forbidden: [...forbidden.values()], others };
  }

  function record(actor, action, type, resource, res, why) {
    S.audit.unshift({ at: nowIso(), actor, action, type, resource, decision: res.allowed ? "allow" : "deny", why: why || whyText(res) });
  }
  const recordAdmin = (text, target) => S.audit.unshift({ at: nowIso(), actor: "admin", action: "admin", type: "admin", resource: target,
    decision: "allow", why: text, admin: true });

  // applyBoth makes a directory change from a form in the working state and
  // in the applied baseline: forms apply at once through the admin API.
  function applyBoth(fn) { fn(S); fn(baseline); }

  // ---------------------------------------------------------------- pending changes

  function change(area, text) {
    A.changes.push({ area, text });
    updateChangesBtn();
  }
  function updateChangesBtn() {
    const b = document.getElementById("changesBtn");
    if (!b) return;
    const n = A.changes.length;
    b.classList.toggle("hidden", !n);
    b.innerHTML = `${icon("policy", "sm")}Unsaved changes <span class="badge warn">${n}</span>`;
  }

  acts.reviewChanges = () => {
    const dir = A.changes.filter(c => c.area === "directory"), pol = A.changes.filter(c => c.area === "policy");
    const list = items => `<ul class="change-list">${items.map(c => `<li>${icon("arrow", "sm")}<span>${esc(c.text)}</span></li>`).join("")}</ul>`;
    openDrawer("Unsaved changes",
      `<h4>People and permissions · ${dir.length}</h4>` + (dir.length ? `<p class="muted small">Made in the access graph. Applying sends them to fga, which checks and records each one.</p>${list(dir)}` +
        `<button class="btn primary" data-act="applyDirectory">Apply these changes</button>` : `<p class="muted small">None.</p>`) +
      `<h4 class="spaced-top">Rules · ${pol.length}</h4>` + (pol.length ? `<p class="muted small">Rules only change when a new rule set is signed. ` +
        `Export the draft, sign it on the computer that keeps the signing key, then restart the decision service with it.</p>${list(pol)}` +
        `<details class="tech-details"><summary>Signing command</summary><div class="preview">fga policy sign -key publisher.key -key-id ${esc(S.bundle.keyId)} -epoch ${S.bundle.epoch + 1} bundle</div></details>` +
        `<div class="btn-row spaced-top"><button class="btn primary" data-act="exportDraft">${icon("download")}Export draft</button>` +
        `<button class="btn" data-act="markSigned" title="In the mockup: pretend the draft was signed and activated">${icon("check")}It is signed and active</button></div>`
        : `<p class="muted small">None.</p>`),
      A.changes.length ? `<button class="btn danger" data-act="discardAll">Discard all</button>` : "");
  };
  acts.applyDirectory = () => {
    for (const k of ["principals", "permSets", "delegations"]) baseline[k] = structuredClone(S[k]);
    const dir = A.changes.filter(c => c.area === "directory");
    dir.forEach(c => recordAdmin(c.text, "access graph"));
    A.changes = A.changes.filter(c => c.area !== "directory");
    closeDrawer();
    updateChangesBtn();
    toast(`Applied ${plural(dir.length, "change")} (mockup: nothing sent)`, "ok");
    route();
  };
  acts.exportDraft = () => {
    const byType = {};
    for (const r of S.rules) {
      const key = `${r.set}:${r.type}`;
      byType[key] = byType[key] || { format: "fga.policy/v1", set: r.set, resource: r.type, scope: "", rules: [] };
      byType[key].rules.push({ id: r.id, effect: r.effect, actions: r.actions, roles: r.roles, ...(r.when ? { when: r.when } : {}) });
    }
    const draft = { format: "fga.policy-draft/v1", tenant: S.org.id, base_epoch: S.bundle.epoch, epoch: S.bundle.epoch + 1,
      changes: A.changes.filter(c => c.area === "policy").map(c => c.text), policies: Object.values(byType),
      console: { names: Object.fromEntries(S.rules.map(r => [r.id, r.name || ""])), roles: S.roleInfo } };
    download(`fga-rules-draft-${draft.epoch}.json`, JSON.stringify(draft, null, 2), "application/json");
    toast("Draft exported. Sign it, then restart the decision service with it.", "ok");
  };
  acts.markSigned = () => {
    for (const k of ["rules", "roleInfo", "extraRoles"]) baseline[k] = structuredClone(S[k]);
    S.bundle.epoch++;
    baseline.bundle.epoch = S.bundle.epoch;
    S.bundle.activated = baseline.bundle.activated = nowIso();
    A.changes = A.changes.filter(c => c.area !== "policy");
    recordAdmin(`rules version ${S.bundle.epoch} active`, "rules");
    closeDrawer();
    updateChangesBtn();
    toast(`Rules version ${S.bundle.epoch} is active`, "ok");
    route();
  };
  acts.discardAll = () => {
    for (const k of ["rules", "principals", "permSets", "delegations", "extraRoles", "roleInfo"]) S[k] = structuredClone(baseline[k]);
    W.custom.roles = S.roleInfo;
    A.changes = [];
    closeDrawer();
    route();
    toast("Discarded all unsaved changes", "ok");
  };

  function download(name, text, type = "text/plain") {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ---------------------------------------------------------------- routing and shell

  function route() {
    const [path, query] = (location.hash.slice(1) || "/login").split("?");
    const me = A.me, home = me ? (me.admin ? "/admin" : "/files") : "/login";
    if (!me && path !== "/login") return go("/login");
    if (me && (path === "/login" || path.startsWith("/admin") !== me.admin || !A.routes[path])) return go(home);
    closeDrawer();
    A.graph = null;
    A.routes[path](new URLSearchParams(query || ""));
  }
  A.route = route;

  const brand = () => `<div class="brand"><span class="brand-mark">${icon("mark")}</span><span>fga console<small>${esc(S.org.name)}${tech(S.org.id)}</small></span></div>`;

  function navLink(path, ic, label, count) {
    return `<a href="#${path}" class="${currentPath() === path ? "active" : ""}" title="${esc(label)}">${icon(ic)}<span class="lbl">${esc(label)}</span>` +
      `${count ? `<span class="count">${count}</span>` : ""}</a>`;
  }

  function shell(title, sub, body, opts = {}) {
    const me = A.me;
    const nav = me.admin
      ? `<div class="nav-section">Organisation</div>${navLink("/admin", "home", "Overview")}` +
        `<div class="nav-section">People</div>${navLink("/admin/people", "users", "People")}${navLink("/admin/agents", "bot", "AI agents")}` +
        `${navLink("/admin/roles", "role", "Roles")}${navLink("/admin/permissions", "key", "Permission sets")}` +
        `<div class="nav-section">Content</div>${navLink("/admin/spaces", "bucket", "Spaces")}${navLink("/admin/tools", "bolt", "Tools")}` +
        `<div class="nav-section">Rules</div>${navLink("/admin/rules", "policy", "Rules")}${navLink("/admin/graph", "graph", "Access graph")}` +
        `<div class="nav-section">System</div>${navLink("/admin/servers", "server", "Servers")}${navLink("/admin/audit", "audit", "Audit log")}`
      : `<div class="nav-section">Workspace</div>${navLink("/files", "files", "Files")}` +
        `${navLink("/approvals", "inbox", "Approvals", toApprove().length)}${navLink("/activity", "activity", "Activity")}`;
    app.innerHTML = `<div class="shell${opts.compact ? " compact" : ""}"><aside class="sidebar">${brand()}<nav class="nav">${nav}</nav>` +
      `<div class="me">${avatar(me.id)}<div><b>${esc(displayName(me.id))}</b>` +
      `<span class="muted">${esc(me.admin ? "Full administration" : rolesText(me.id))}</span></div>` +
      `<button class="btn ghost icon sm" data-act="logout" title="Sign out" aria-label="Sign out">${icon("logout")}</button></div></aside>` +
      `<main class="main"><header class="topbar"><h1>${esc(title)}</h1>${sub ? `<span class="sub">${sub}</span>` : ""}` +
      `<span class="spacer"></span>` +
      (me.admin ? `<button class="btn sm changes-top hidden" id="changesBtn" data-act="reviewChanges"></button>` +
        `<button class="btn ghost sm tech-toggle ${A.tech ? "on" : ""}" data-act="toggleTech" title="Show fga's own names beside the plain words" aria-pressed="${A.tech}">${icon("tech", "sm")}<span class="lbl">Technical names</span></button>` : "") +
      `<span class="pill" title="A mockup with demo data: nothing is sent to fga">${icon("flask", "sm")}<span class="lbl">Mockup</span></span>` +
      `<button class="btn ghost icon" data-act="theme" aria-label="Switch light or dark">${icon(isDark() ? "sun" : "moon")}</button></header>` +
      `<div class="content${opts.flush ? " flush" : ""}">${body}</div></main></div>`;
    updateChangesBtn();
  }

  const pageHead = (title, text, buttons = "") =>
    `<div class="page-head"><div><h2>${esc(title)}</h2>${text ? `<p>${text}</p>` : ""}</div>${buttons ? `<div class="btn-row">${buttons}</div>` : ""}</div>`;

  acts.toggleTech = () => {
    A.tech = !A.tech;
    try { localStorage.setItem("fga-console-tech", A.tech ? "1" : ""); } catch { /* lasts for this page only */ }
    route();
  };

  // ---------------------------------------------------------------- drawer and confirm

  function openDrawer(title, body, foot = "", opts = {}) {
    closeDrawer();
    const d = document.createElement("div");
    d.id = "drawer";
    d.innerHTML = `<div class="scrim" data-act="closeDrawer"></div><aside class="drawer${opts.wide ? " wide" : ""}" role="dialog" aria-modal="true" aria-label="${esc(title)}">` +
      `<div class="drawer-head"><h3>${esc(title)}</h3><button class="btn ghost icon sm" data-act="closeDrawer" aria-label="Close">${icon("x")}</button></div>` +
      `<div class="drawer-body">${body}</div>${foot ? `<div class="drawer-foot">${foot}</div>` : ""}</aside>`;
    document.body.appendChild(d);
    if (!opts.noFocus) {
      const first = d.querySelector(".drawer-body input:not([type=checkbox]):not([type=radio]):not([type=file]), .drawer-body select, .drawer-body textarea");
      if (first) first.focus();
    }
  }
  function closeDrawer() { const d = document.getElementById("drawer"); if (d) d.remove(); }
  acts.closeDrawer = closeDrawer;

  // confirm asks before something is removed; yes runs fn.
  let onConfirm = null;
  function confirm(title, html, label, fn) {
    onConfirm = fn;
    openDrawer(title, html, `<button class="btn" data-act="closeDrawer">Cancel</button><button class="btn danger-solid" data-act="confirmYes">${icon("trash", "sm")}${esc(label)}</button>`);
  }
  acts.confirmYes = () => { const fn = onConfirm; onConfirm = null; closeDrawer(); if (fn) fn(); };

  // gap marks something fga cannot do yet: the mockup shows the design,
  // and the note says which fga change it would need.
  const gap = text => `<p class="gap">${icon("flask", "sm")}<span><b>Needs a change in fga:</b> ${text}</span></p>`;

  // ---------------------------------------------------------------- sign-in

  const DEMO_USERS = ["alice", "bob", "lena", "carl", "sam", "gus"];
  function renderLogin() {
    const tiles = DEMO_USERS.map(person).filter(Boolean);
    app.innerHTML = `<div class="login"><div class="login-card">${brand()}<h1>Sign in</h1>` +
      `<p class="lead">${esc(S.org.name)}, development sign-in. Choose who you are.</p><div class="tiles">` +
      tiles.map(p => `<button class="tile" data-act="login" data-id="${esc(p.id)}">${avatar(p.id, "lg")}<span><b>${esc(displayName(p.id))}</b>` +
        `<span class="muted">${esc(rolesText(p.id))}</span></span></button>`).join("") +
      `<button class="tile admin-tile" data-act="login" data-id="admin">${avatar("admin", "lg")}<span><b>Administrator</b>` +
      `<span class="muted">People, roles, rules, tools, servers and the audit log</span></span></button></div>` +
      `<div class="login-other"><label class="field"><span>Someone else</span><div class="inline"><input class="input" id="loginOther" list="loginPeople" placeholder="Type a name, such as anna.berg" autocomplete="off">` +
      `<datalist id="loginPeople">${people().filter(p => p.status === "active").map(p => `<option value="${esc(p.id)}">${esc(displayName(p.id))}</option>`).join("")}</datalist>` +
      `<button class="btn" data-act="loginOther">Sign in</button></div></label></div>` +
      `<div class="login-foot">${icon("lock")}<span>Development sign-in: the console gets a short-lived pass for the person you pick. ` +
      `In production you sign in with your organisation's login, and the console never sees a password.</span></div></div></div>`;
  }
  A.routes["/login"] = renderLogin;
  function login(id) {
    A.me = { id, admin: id === "admin" };
    try { sessionStorage.setItem("fga-console-user", id); } catch { /* the session is kept in memory only */ }
    go(A.me.admin ? "/admin" : "/files");
  }
  acts.login = d => login(d.id);
  acts.loginOther = () => {
    const id = val("loginOther").trim();
    const p = person(id);
    if (!p || p.kind !== "user") return toast(`No one called "${id}"`, "bad");
    if (p.status !== "active") return toast(`${displayName(id)} is disabled and cannot sign in`, "bad");
    login(id);
  };
  acts.logout = () => {
    A.me = null;
    try { sessionStorage.removeItem("fga-console-user"); } catch { /* nothing kept */ }
    go("/login");
  };

  // ---------------------------------------------------------------- user: files

  const KIND_TEXT = { object: "", document: "Document", derived: "Summary" };
  const fileIcon = o => {
    const k = o.kind === "derived" ? { icon: "derived", ext: "derived" } : W.fileKind(o.key);
    return `<span class="fk fk-${esc(k.ext || "file")}">${icon(o.kind === "document" ? "doc" : k.icon)}</span>`;
  };
  const fileKindText = o => (o.kind === "object" ? W.fileKind(o.key).name : `${KIND_TEXT[o.kind]} · ${W.fileKind(o.key).name}`);
  const baseName = key => key.split("/").pop();
  const folderOf = key => key.includes("/") ? key.slice(0, key.lastIndexOf("/")) : "";
  const canSee = o => decide(A.me.id, findAction(o), objRes(o)).allowed || decide(A.me.id, openAction(o), objRes(o)).allowed;
  const canShare = (o, grantee) => decide(A.me.id, "share", objRes(o, grantee ? { grantee } : {}));
  // fid names a file in one attribute value: space names never hold "|".
  const fid = o => `${o.bucket}|${o.key}`;
  const objByFid = id => { const i = id.indexOf("|"); return findObj(id.slice(0, i), id.slice(i + 1)); };

  // folderView lists the subfolders and files directly in a folder.
  function folderView(list, folder) {
    const prefix = folder ? folder + "/" : "", folders = new Map(), files = [];
    for (const o of list) {
      if (!o.key.startsWith(prefix)) continue;
      const rest = o.key.slice(prefix.length);
      if (rest.includes("/")) {
        const f = prefix + rest.split("/")[0];
        folders.set(f, (folders.get(f) || 0) + 1);
      } else files.push(o);
    }
    return { folders: [...folders.entries()].sort((a, b) => a[0].localeCompare(b[0])), files: files.sort((a, b) => a.key.localeCompare(b.key)) };
  }

  let filesQ = "";
  function renderFiles(params) {
    const me = A.me.id;
    const visible = S.buckets.filter(b => decide(me, "list", bucketRes(b)).allowed);
    const sharedIn = S.objects.filter(o => !visible.includes(bucketOf(o.bucket)) && canSee(o));
    const tabs = visible.map(b => b.name).concat(sharedIn.length ? ["~shared"] : []);
    const pick = tabs.includes(params.get("b")) ? params.get("b") : tabs[0];
    const bucket = pick && pick !== "~shared" ? bucketOf(pick) : null;
    const folder = bucket ? params.get("f") || "" : "";
    const canUpload = bucket && decide(me, "create-object", bucketRes(bucket)).allowed;
    const anyShare = S.objects.some(o => canShare(o).allowed);
    if (params.get("b") !== pick) filesQ = "";

    const spaceRow = b => {
      const n = S.objects.filter(o => o.bucket === b.name && canSee(o)).length;
      return `<a class="space-row ${pick === b.name ? "on" : ""}" href="#/files?b=${encodeURIComponent(b.name)}">${icon(b.mode === "client" ? "lock" : "bucket")}` +
        `<span class="grow"><b>${esc(b.name)}</b><small>${esc(projectName(b.project))}</small></span><span class="count-pill">${n}</span></a>`;
    };
    const body = `<div class="page wide">${pageHead("Files", "The spaces and files you may see. What you may not do is greyed out, with the reason on hover.",
      (anyShare ? `<button class="btn" data-act="giveAccess">${icon("share")}Give access</button>` : "") +
      (canUpload ? `<button class="btn primary" data-act="upload" data-b="${esc(bucket.name)}" data-f="${esc(folder)}">${icon("upload")}Upload</button>` : ""))}` +
      (tabs.length ? `<div class="files-layout"><nav class="card spaces" aria-label="Spaces"><div class="spaces-head">Spaces</div>${visible.map(spaceRow).join("")}` +
        (sharedIn.length ? `<a class="space-row ${pick === "~shared" ? "on" : ""}" href="#/files?b=~shared">${icon("share")}<span class="grow"><b>Shared with you</b>` +
          `<small>single files</small></span><span class="count-pill">${sharedIn.length}</span></a>` : "") + `</nav>` +
        `<section class="card browser"><div class="browser-bar"><div class="crumbs">${crumbs(bucket, folder, pick)}</div>` +
        `<input class="input search" id="filesQ" placeholder="${bucket ? `Search in ${esc(bucket.name)}` : "Search"}" value="${esc(filesQ)}" data-on-input="filesSearch" aria-label="Search files"></div>` +
        `<div id="fileRows">${fileRows(bucket, folder, sharedIn)}</div></section></div>`
        : `<div class="card"><div class="empty">${icon("files")}<div>No space lets you in yet. Ask an administrator, or ask someone to share a file with you.</div></div></div>`) + `</div>`;
    shell("Files", bucket ? `${esc(bucket.name)} · ${esc(projectName(bucket.project))} · ${esc(W.encryption(bucket.mode).name)}` : "", body);
    acts.filesSearch = (d, el) => { filesQ = el.value; document.getElementById("fileRows").innerHTML = fileRows(bucket, folder, sharedIn); };
  }
  A.routes["/files"] = renderFiles;

  function crumbs(bucket, folder, pick) {
    if (!bucket) return `<b>${pick === "~shared" ? "Shared with you" : ""}</b>`;
    const parts = folder ? folder.split("/") : [];
    const link = (f, text) => `<a href="#/files?b=${encodeURIComponent(bucket.name)}${f ? `&f=${encodeURIComponent(f)}` : ""}">${esc(text)}</a>`;
    return [link("", bucket.name), ...parts.map((p, i) => i === parts.length - 1 ? `<b>${esc(p)}</b>` : link(parts.slice(0, i + 1).join("/"), p))]
      .join(`<span class="sep">${icon("chevron", "sm")}</span>`);
  }

  function fileRows(bucket, folder, sharedIn) {
    const list = bucket ? S.objects.filter(o => o.bucket === bucket.name && canSee(o)) : sharedIn;
    let view;
    if (filesQ.trim()) {
      const q = filesQ.trim().toLowerCase();
      view = { folders: [], files: list.filter(o => o.key.toLowerCase().includes(q)).sort((a, b) => a.key.localeCompare(b.key)) };
    } else view = bucket ? folderView(list, folder) : { folders: [], files: list };
    if (!view.folders.length && !view.files.length) {
      return `<div class="empty">${icon("files")}<div>${filesQ ? "Nothing matches." : "Nothing here that you may see."}</div></div>`;
    }
    return `<table class="tbl files"><thead><tr><th>Name</th><th class="hide-sm">Sensitivity</th><th class="hide-sm">Owner</th><th class="num hide-md">Size</th><th class="hide-md">Changed</th><th></th></tr></thead><tbody>` +
      view.folders.map(([f, n]) => `<tr class="clickable" data-act="openFolder" data-b="${esc(bucket.name)}" data-f="${esc(f)}"><td colspan="6"><div class="obj">` +
        `<span class="fk fk-folder">${icon("folder")}</span><div><b>${esc(f.split("/").pop())}</b><div class="muted small">${plural(n, "file")}</div></div></div></td></tr>`).join("") +
      view.files.map(o => fileRow(o, !bucket || filesQ.trim())).join("") + `</tbody></table>`;
  }
  acts.openFolder = d => go(`/files?b=${encodeURIComponent(d.b)}&f=${encodeURIComponent(d.f)}`);

  function fileRow(o, showPath) {
    const me = A.me.id, r = objRes(o);
    const deny = (action, verb) => {
      const res = decide(me, action, r);
      return res.allowed ? "" : `disabled title="${esc(`You may not ${verb}: ${whyText(res)}`)}"`;
    };
    const shares = canShare(o).allowed ? activeShares(o) : [];
    return `<tr><td><div class="obj">${fileIcon(o)}<div class="min0"><b class="fname">${esc(showPath ? `${o.bucket}/${o.key}` : baseName(o.key))}</b>` +
      `<div class="muted small">${esc(fileKindText(o))}<span class="show-sm"> · ${esc(W.label(o.label).name)}</span>${bucketOf(o.bucket).mode === "client" ? " · end-to-end encrypted" : ""}` +
      `${shares.length ? ` · ${icon("share", "xs")} shared with ${plural(shares.length, "person", "people")}` : ""}</div></div></div></td>` +
      `<td class="hide-sm">${labelChip(o.label)}</td>` +
      `<td class="hide-sm"><div class="who nowrap">${avatar(o.owner, "sm")}<span>${o.owner === me ? "You" : esc(displayName(o.owner))}</span></div></td>` +
      `<td class="num hide-md nowrap">${bytes(o.size)}</td><td class="muted hide-md nowrap">${ago(o.modified)}</td><td class="actions">` +
      `<button class="btn sm" data-act="open" data-b="${esc(o.bucket)}" data-k="${esc(o.key)}" ${deny(openAction(o), "open it")}>Open</button>` +
      `<button class="btn sm icon ghost" data-act="giveAccess" data-b="${esc(o.bucket)}" data-k="${esc(o.key)}" aria-label="Give access" ${deny("share", "share it") || 'title="Give access"'}>${icon("share")}</button>` +
      `<button class="btn sm icon ghost" data-act="access" data-b="${esc(o.bucket)}" data-k="${esc(o.key)}" aria-label="Details and access" title="Details and access">${icon("more")}</button>` +
      `</td></tr>`;
  }

  acts.open = d => {
    const o = findObj(d.b, d.k), b = bucketOf(o.bucket), action = openAction(o), res = decide(A.me.id, action, objRes(o));
    record(A.me.id, action, objType(o), `${o.bucket}/${o.key}`, res);
    if (!res.allowed) return toast(`Not allowed: ${whyText(res)}`, "bad");
    const line = `<div class="decision-line"><span class="badge allow">${icon("check", "sm")}Allowed</span>by “${esc(ruleTitle(res.rule))}”${tech(res.rule.id)}</div>`;
    const meta = `<dl class="kv"><dt>Space</dt><dd>${esc(o.bucket)}</dd><dt>Kind</dt><dd>${esc(fileKindText(o))}</dd><dt>Owner</dt><dd>${esc(displayName(o.owner))}</dd>` +
      `<dt>Sensitivity</dt><dd>${labelChip(o.label)}</dd><dt>Size</dt><dd>${bytes(o.size)}</dd><dt>Changed</dt><dd>${when(o.modified)}</dd>` +
      `<dt>Encryption</dt><dd>${esc(W.encryption(b.mode).name)}</dd></dl>`;
    if (b.mode === "client") {
      return openDrawer(baseName(o.key), `${line}${meta}<p class="insp-note">This space is end-to-end encrypted: fga keeps only scrambled data, ` +
        `and only people the owner gave a key can unscramble it. Open it on your own computer with the fga program:</p>` +
        `<div class="preview">fga get -bucket ${esc(o.bucket)} -key ${esc(o.key)} -out ${esc(baseName(o.key))}</div>`);
    }
    const preview = o.body != null ? `<div class="preview">${esc(o.body || "(empty)")}</div>`
      : `<div class="preview-card">${fileIcon(o)}<div><b>${esc(baseName(o.key))}</b><div class="muted small">${esc(fileKindText(o))} · ${bytes(o.size)}</div>` +
        `<div class="muted small">The mockup has no preview for this kind of file.</div></div></div>`;
    openDrawer(baseName(o.key), `${line}${meta}${preview}`,
      `<button class="btn" data-act="closeDrawer">Close</button><button class="btn primary" data-act="download" data-b="${esc(o.bucket)}" data-k="${esc(o.key)}">${icon("download")}Download</button>`);
  };
  acts.download = d => {
    const o = findObj(d.b, d.k);
    download(baseName(o.key), o.body != null ? o.body : `Demo file: ${o.bucket}/${o.key} (${bytes(o.size)}). The mockup has no real content.`);
  };

  acts.access = d => {
    const o = findObj(d.b, d.k), res = objRes(o), act = openAction(o), mayShare = canShare(o).allowed, me = A.me.id;
    const labelAllowed = o.kind === "object" && ["label", "relabel"].some(a => decide(me, a, res).allowed);
    const mayDelete = decide(me, "delete", res);
    const who = whoCan(res, act);
    const group = (g, tone) => `<div class="list-row"><span class="badge ${tone}">${tone === "allow" ? "Can" : "Never"}</span><div class="grow">` +
      `<b>${plural(g.people.length, "person", "people")}</b> <span class="muted">· ${esc(ruleTitle(g.rule))}</span>${tech(g.rule.id)}` +
      `<div class="avatars">${g.people.slice(0, 12).map(p => avatar(p, "sm")).join("")}${g.people.length > 12 ? `<span class="more">+${g.people.length - 12}</span>` : ""}</div></div></div>`;
    const shares = activeShares(o);
    openDrawer(baseName(o.key),
      `<div class="file-head">${fileIcon(o)}<div><b>${esc(baseName(o.key))}</b><div class="muted small">${esc(o.bucket)}/${esc(folderOf(o.key))}</div></div></div>` +
      `<dl class="kv"><dt>Kind</dt><dd>${esc(fileKindText(o))}</dd><dt>Owner</dt><dd>${esc(displayName(o.owner))}</dd><dt>Sensitivity</dt><dd>${labelChip(o.label)}</dd>` +
      `<dt>Size</dt><dd>${bytes(o.size)}</dd><dt>Changed</dt><dd>${when(o.modified)}</dd><dt>Encryption</dt><dd>${esc(W.encryption(bucketOf(o.bucket).mode).name)}</dd></dl>` +
      `<h4 class="spaced-top">Who can ${esc(W.action(act, objType(o)).label.toLowerCase())} it</h4><div class="card flat">` +
      (who.allowed.length ? who.allowed.map(g => group(g, "allow")).join("") : `<div class="empty small">Nobody.</div>`) +
      who.forbidden.map(g => group(g, "deny")).join("") + `</div>` +
      `<p class="muted small">Everyone else (${who.others}) cannot: no rule lets them.</p>` +
      `<h4 class="spaced-top">Shared with</h4>` +
      (shares.length ? `<div class="card flat">${shares.map(s => `<div class="list-row">${avatar(s.grantee)}<div class="grow"><b>${esc(displayName(s.grantee))}</b>` +
        `<div class="chips">${s.actions.map(a => actChip(a, objType(o))).join("")}</div><div class="muted small">until ${day(s.expires)} · given by ${esc(displayName(s.grantor))}</div></div>` +
        (mayShare ? `<button class="btn sm danger" data-act="unshare" data-b="${esc(o.bucket)}" data-k="${esc(o.key)}" data-id="${esc(s.grantee)}">Remove</button>` : "") +
        `</div>`).join("")}</div>` : `<p class="muted small">Not shared with anyone.</p>`),
      `<button class="btn danger" data-act="deleteFile" data-b="${esc(o.bucket)}" data-k="${esc(o.key)}" ${mayDelete.allowed ? "" : `disabled title="${esc(`You may not delete it: ${whyText(mayDelete)}`)}"`}>${icon("trash", "sm")}Delete</button>` +
      (o.kind === "object" ? `<button class="btn" data-act="label" data-b="${esc(o.bucket)}" data-k="${esc(o.key)}" ${labelAllowed ? "" : 'disabled title="You may not change its sensitivity"'}>${icon("tag", "sm")}Sensitivity</button>` : "") +
      `<span class="spacer"></span>` +
      (mayShare ? `<button class="btn primary" data-act="giveAccess" data-b="${esc(o.bucket)}" data-k="${esc(o.key)}">${icon("share")}Give access</button>` : ""));
  };
  acts.unshare = d => {
    const o = findObj(d.b, d.k), res = canShare(o);
    record(A.me.id, "share", objType(o), `${o.bucket}/${o.key}`, res);
    if (!res.allowed) return toast(`Not allowed: ${whyText(res)}`, "bad");
    S.shares = S.shares.filter(s => !(s.bucket === o.bucket && s.key === o.key && s.grantee === d.id));
    toast(`${displayName(d.id)} no longer has shared access to ${baseName(o.key)}`, "ok");
    route();
    acts.access(d);
  };

  acts.label = d => {
    const o = findObj(d.b, d.k);
    openDrawer(`Sensitivity of ${baseName(o.key)}`, `<p class="muted small">From least to most sensitive: ${S.bundle.labels.map(l => esc(W.label(l).name)).join(" → ")}. ` +
      `Raising it happens at once; lowering it needs a team lead's approval.</p>` +
      `<div class="field">${S.bundle.labels.map(l => `<label class="check big"><input type="radio" name="fLabel" value="${esc(l)}" ${l === o.label ? "checked" : ""}>` +
        `<span>${labelChip(l)}<small>${esc(W.label(l).help)}</small></span></label>`).join("")}</div>`,
      `<button class="btn" data-act="closeDrawer">Cancel</button><button class="btn primary" data-act="doLabel" data-b="${esc(o.bucket)}" data-k="${esc(o.key)}">Apply</button>`);
  };
  acts.doLabel = d => {
    const o = findObj(d.b, d.k), sel = checked("#drawer input[name=fLabel]")[0], to = sel ? sel.value : o.label;
    if (to === o.label) return closeDrawer();
    const lowering = rank(to) < rank(o.label), action = lowering ? "relabel" : "label", res = decide(A.me.id, action, objRes(o));
    closeDrawer();
    if (!res.allowed) { record(A.me.id, action, objType(o), `${o.bucket}/${o.key}`, res); return toast(`Not allowed: ${whyText(res)}`, "bad"); }
    if (!lowering) {
      record(A.me.id, action, objType(o), `${o.bucket}/${o.key}`, res);
      o.label = to;
      toast(`${baseName(o.key)} is now ${W.label(to).name}`, "ok");
    } else {
      const id = Math.random().toString(16).slice(2, 8);
      S.approvals.push({ id, bucket: o.bucket, key: o.key, from: o.label, to, requester: A.me.id, created: nowIso(), state: "pending" });
      record(A.me.id, action, objType(o), `${o.bucket}/${o.key}`, { allowed: false }, "Waiting for approval");
      toast("Lowering needs approval: the request went to the project's team leads");
    }
    route();
  };

  acts.deleteFile = d => {
    const o = findObj(d.b, d.k);
    confirm(`Delete ${baseName(o.key)}?`, `<p>The file is deleted for everyone${activeShares(o).length ? `, and its ${plural(activeShares(o).length, "share")} end` : ""}.</p>` +
      `<p class="muted small">fga keeps the record of who deleted it in the audit log.</p>`, "Delete", () => {
      const res = decide(A.me.id, "delete", objRes(o));
      record(A.me.id, "delete", objType(o), `${o.bucket}/${o.key}`, res);
      if (!res.allowed) return toast(`Not allowed: ${whyText(res)}`, "bad");
      S.objects = S.objects.filter(x => x !== o);
      S.shares = S.shares.filter(s => !(s.bucket === o.bucket && s.key === o.key));
      toast(`Deleted ${baseName(o.key)}`, "ok");
      route();
    });
  };

  acts.upload = d => {
    const b = bucketOf(d.b);
    if (b.mode === "client") {
      return openDrawer(`Upload to ${b.name}`, `<p class="insp-note">This space is end-to-end encrypted: files are encrypted on your computer before they leave it. Use the fga program:</p>` +
        `<div class="preview">fga put -bucket ${esc(b.name)} -key ${esc(d.f ? d.f + "/" : "")}&lt;name&gt; -in &lt;file&gt;</div>`);
    }
    openDrawer(`Upload to ${b.name}`,
      `<label class="field"><span>File</span><input class="input" type="file" id="fFile" data-on-change="uploadPicked"><small>In the mockup only the name and size are used; nothing leaves your computer.</small></label>` +
      `<label class="field"><span>Name in the space</span><input class="input" id="fKey" value="${esc(d.f ? d.f + "/" : "")}" placeholder="q4/minutes.docx"></label>` +
      `<div class="field"><span>Sensitivity</span><div class="seg wrap">${S.bundle.labels.map(l => `<label class="seg-opt"><input type="radio" name="fUpLabel" value="${esc(l)}" ${l === "internal" ? "checked" : ""}>${esc(W.label(l).name)}</label>`).join("")}</div></div>`,
      `<button class="btn" data-act="closeDrawer">Cancel</button><button class="btn primary" data-act="doUpload" data-b="${esc(b.name)}">${icon("upload")}Upload</button>`);
  };
  acts.uploadPicked = (d, el) => {
    const f = el.files[0], key = document.getElementById("fKey");
    if (f && key) key.value = (key.value.endsWith("/") || !key.value ? key.value : folderOf(key.value) + (folderOf(key.value) ? "/" : "")) + f.name.replace(/\s+/g, "-");
  };
  acts.doUpload = d => {
    const b = bucketOf(d.b), key = val("fKey").trim(), res = decide(A.me.id, "create-object", bucketRes(b));
    if (!key || /^\/|\.\.|\s|\/$/.test(key)) return toast("Give a name without spaces, such as q4/minutes.docx", "bad");
    if (findObj(b.name, key)) return toast(`${key} already exists`, "bad");
    record(A.me.id, "create-object", "storage.bucket", b.name, res);
    if (!res.allowed) return toast(`Not allowed: ${whyText(res)}`, "bad");
    const f = document.getElementById("fFile").files[0], label = (checked("#drawer input[name=fUpLabel]")[0] || { value: "internal" }).value;
    S.objects.push({ bucket: b.name, key, kind: "object", owner: A.me.id, label, size: f ? f.size : 0, modified: nowIso(), body: null });
    closeDrawer();
    toast(`Uploaded ${baseName(key)}; fga encrypted it`, "ok");
    route();
  };

  // ---------------------------------------------------------------- give access

  // The three things a single file can be shared for, in the actions of
  // each kind of file (SHR-001: only the type's read set can be granted).
  const SHARE_OPTS = [
    ["find", "Find it", "See that it exists, in lists and searches"],
    ["details", "See details", "See its size, owner and dates"],
    ["open", "Open it", "Open and download it"],
  ];
  const optAction = (o, opt) => ({
    object: { find: "discover", details: "stat", open: "read" }, document: { find: "discover", open: "read-units" }, derived: { open: "deliver" },
  })[o.kind][opt];
  const NOT_SHAREABLE = [["upload", "Upload"], ["replace", "Replace"], ["delete", "Delete"], ["sensitivity", "Change sensitivity"], ["approve", "Approve requests"]];

  let ga = null;
  acts.giveAccess = d => {
    const o = d.b ? findObj(d.b, d.k) : null;
    const spaces = S.buckets.filter(b => S.objects.some(x => x.bucket === b.name && canShare(x).allowed));
    if (!spaces.length) return toast("There is no file you may share", "bad");
    ga = { who: null, whoQ: "", space: o ? o.bucket : spaces[0].name, folder: o ? folderOf(o.key) : "", q: "",
      sel: new Set(o ? [fid(o)] : []), opts: new Set(["find", "details", "open"]), days: 7, spaces };
    openDrawer("Give access", `<div id="ga"></div>`, `<span class="grow muted small" id="gaFoot"></span><button class="btn" data-act="closeDrawer">Cancel</button>` +
      `<button class="btn primary" id="gaGo" data-act="gaGive">${icon("share")}Give access</button>`, { wide: true, noFocus: true });
    gaRender();
    const q = document.getElementById("gaWhoQ");
    if (q) q.focus();
  };

  function gaRender(only) {
    const parts = {
      gaWho: gaWho, gaFiles: gaFiles, gaWhat: gaWhat, gaUntil: gaUntil, gaResult: gaResult,
    };
    if (!only) {
      document.getElementById("ga").innerHTML = Object.keys(parts).map(id => `<section class="step" id="${id}"></section>`).join("");
    }
    for (const id of only || Object.keys(parts)) { const el = document.getElementById(id); if (el) el.innerHTML = parts[id](); }
    const ok = gaPlan().some(p => p.after.some(x => x.res.allowed && !x.before));
    const go = document.getElementById("gaGo");
    if (go) go.disabled = !ok;
    const foot = document.getElementById("gaFoot");
    if (foot) foot.textContent = !ga.who ? "Choose a person" : !ga.sel.size ? "Choose at least one file" : !ga.opts.size ? "Choose what they may do" : "";
  }
  const stepHead = (n, title, right = "") => `<div class="step-head"><span class="num">${n}</span><h4>${esc(title)}</h4>${right ? `<span class="right">${right}</span>` : ""}</div>`;

  function gaWho() {
    if (ga.who) {
      return stepHead(1, "Who gets access") + `<div class="picked">${avatar(ga.who)}<div class="grow"><b>${esc(displayName(ga.who))}</b>` +
        `<div class="muted small">${esc(rolesText(ga.who))}</div></div><button class="btn sm ghost" data-act="gaWhoClear">Change</button></div>`;
    }
    return stepHead(1, "Who gets access") + `<input class="input" id="gaWhoQ" placeholder="Search people by name" value="${esc(ga.whoQ)}" data-on-input="gaWhoQ" autocomplete="off" aria-label="Search people">` +
      `<div class="pick-list" id="gaWhoList">${gaWhoList()}</div>`;
  }
  function gaWhoList() {
    const q = ga.whoQ.trim();
    const hits = people().filter(p => p.status === "active" && p.id !== A.me.id && matchPerson(p, q)).slice(0, 6);
    return hits.map(p => `<button class="pick" data-act="gaPickWho" data-id="${esc(p.id)}">${avatar(p.id, "sm")}<span class="grow"><b>${esc(displayName(p.id))}</b>` +
      `<small>${esc(rolesText(p.id))}</small></span></button>`).join("") || `<div class="muted small pad">No one matches.</div>`;
  }
  acts.gaWhoQ = (d, el) => { ga.whoQ = el.value; document.getElementById("gaWhoList").innerHTML = gaWhoList(); };
  acts.gaPickWho = d => { ga.who = d.id; gaRender(); };
  acts.gaWhoClear = () => { ga.who = null; gaRender(); const q = document.getElementById("gaWhoQ"); if (q) q.focus(); };

  function gaFiles() {
    const n = ga.sel.size;
    return stepHead(2, "Which files", n ? `<span class="badge accent">${plural(n, "file")} chosen</span>` : "") +
      `<div class="browse-bar"><select class="input" data-on-change="gaSpace" aria-label="Space">${ga.spaces.map(b => `<option value="${esc(b.name)}" ${b.name === ga.space ? "selected" : ""}>` +
        `${esc(b.name)} · ${esc(projectName(b.project))}</option>`).join("")}</select>` +
      `<input class="input" id="gaQ" placeholder="Search in this space" value="${esc(ga.q)}" data-on-input="gaQ" autocomplete="off" aria-label="Search files"></div>` +
      `<div id="gaList">${gaList()}</div>` +
      (n ? `<div class="sel-chips">${[...ga.sel].slice(0, 6).map(id => { const o = objByFid(id); return `<span class="chip on">${esc(baseName(o.key))}` +
        `<button class="x" data-act="gaUnpick" data-id="${esc(id)}" aria-label="Remove ${esc(baseName(o.key))}">×</button></span>`; }).join("")}` +
        `${n > 6 ? `<span class="chip more">and ${n - 6} more</span>` : ""}<button class="btn sm ghost" data-act="gaClear">Clear</button></div>` : "");
  }
  function gaList() {
    const list = S.objects.filter(o => o.bucket === ga.space && canSee(o) || o.bucket === ga.space && canShare(o).allowed);
    const q = ga.q.trim().toLowerCase();
    const view = q ? { folders: [], files: list.filter(o => o.key.toLowerCase().includes(q)) } : folderView(list, ga.folder);
    const crumbsHtml = q ? `<span class="muted small">Results for “${esc(ga.q)}”</span>`
      : [`<button class="linkish" data-act="gaFolder" data-f="">${esc(ga.space)}</button>`, ...(ga.folder ? ga.folder.split("/") : []).map((p, i, arr) =>
        i === arr.length - 1 ? `<b>${esc(p)}</b>` : `<button class="linkish" data-act="gaFolder" data-f="${esc(arr.slice(0, i + 1).join("/"))}">${esc(p)}</button>`)]
        .join(`<span class="sep">${icon("chevron", "sm")}</span>`);
    const folderFiles = f => list.filter(o => o.key.startsWith(f + "/") && canShare(o).allowed);
    const rows = view.folders.map(([f, n]) => {
      const files = folderFiles(f), all = files.length && files.every(o => ga.sel.has(fid(o)));
      return `<div class="brow"><label class="check"><input type="checkbox" data-on-change="gaFolderPick" data-f="${esc(f)}" ${all ? "checked" : ""} ${files.length ? "" : "disabled"}` +
        ` aria-label="All files in ${esc(f)}"></label><span class="fk fk-folder">${icon("folder")}</span>` +
        `<button class="linkish grow" data-act="gaFolder" data-f="${esc(f)}"><b>${esc(f.split("/").pop())}</b> <span class="muted small">${plural(n, "file")}</span></button>` +
        `<button class="btn sm ghost icon" data-act="gaFolder" data-f="${esc(f)}" aria-label="Open folder">${icon("chevron")}</button></div>`;
    }).join("") + view.files.map(o => {
      const res = canShare(o);
      return `<label class="brow ${res.allowed ? "" : "off"}" ${res.allowed ? "" : `title="${esc(`You may not share it: ${whyText(res)}`)}"`}>` +
        `<input type="checkbox" data-on-change="gaPick" data-id="${esc(fid(o))}" ${ga.sel.has(fid(o)) ? "checked" : ""} ${res.allowed ? "" : "disabled"}>` +
        `${fileIcon(o)}<span class="grow min0"><b class="fname">${esc(q ? o.key : baseName(o.key))}</b><small>${esc(fileKindText(o))} · ${esc(displayName(o.owner))}</small></span>${labelChip(o.label)}</label>`;
    }).join("");
    return `<div class="crumbs small-crumbs">${crumbsHtml}</div><div class="browse">${rows || `<div class="muted small pad">Nothing here.</div>`}</div>` +
      (view.folders.length ? `<p class="muted small">Ticking a folder chooses the files in it now; files added later are not included.</p>` : "");
  }
  acts.gaSpace = (d, el) => { ga.space = el.value; ga.folder = ""; ga.q = ""; gaRender(["gaFiles"]); };
  acts.gaFolder = d => { ga.folder = d.f; ga.q = ""; gaRender(["gaFiles"]); };
  acts.gaQ = (d, el) => { ga.q = el.value; document.getElementById("gaList").innerHTML = gaList(); };
  acts.gaPick = (d, el) => { if (el.checked) ga.sel.add(d.id); else ga.sel.delete(d.id); gaRender(["gaFiles", "gaWhat", "gaResult"]); };
  acts.gaUnpick = d => { ga.sel.delete(d.id); gaRender(["gaFiles", "gaWhat", "gaResult"]); };
  acts.gaClear = () => { ga.sel.clear(); gaRender(["gaFiles", "gaWhat", "gaResult"]); };
  acts.gaFolderPick = (d, el) => {
    for (const o of S.objects.filter(x => x.bucket === ga.space && x.key.startsWith(d.f + "/") && canShare(x).allowed)) {
      if (el.checked) ga.sel.add(fid(o)); else ga.sel.delete(fid(o));
    }
    gaRender(["gaFiles", "gaWhat", "gaResult"]);
  };

  function gaWhat() {
    const kinds = new Set([...ga.sel].map(id => objByFid(id).kind));
    const note = kinds.has("derived") || kinds.has("document")
      ? `<p class="muted small">${kinds.has("document") ? "Documents can be found and read, but have no details to share. " : ""}${kinds.has("derived") ? "Summaries can only be received (opened)." : ""}</p>` : "";
    return stepHead(3, "What they may do") + `<div class="opts">` + SHARE_OPTS.map(([id, label, help]) =>
      `<label class="check big"><input type="checkbox" data-on-change="gaOpt" data-o="${id}" ${ga.opts.has(id) ? "checked" : ""}><span><b>${esc(label)}</b><small>${esc(help)}</small></span></label>`).join("") +
      `</div>${note}<div class="not-possible"><b>Not possible for a single file</b><div class="chips">${NOT_SHAREABLE.map(([, l]) => `<span class="chip off">${esc(l)}</span>`).join("")}</div>` +
      `<small>These come with a role in the project, which an administrator gives.</small></div>`;
  }
  acts.gaOpt = (d, el) => { if (el.checked) ga.opts.add(d.o); else ga.opts.delete(d.o); gaRender(["gaResult"]); };

  function gaUntil() {
    const until = new Date(clock() + ga.days * 864e5).toISOString();
    return stepHead(4, "Until") + `<div class="seg">${[1, 7, 30, 90].map(n => `<button class="${ga.days === n ? "on" : ""}" data-act="gaDays" data-n="${n}">${n === 1 ? "1 day" : `${n} days`}</button>`).join("")}</div>` +
      `<p class="muted small">Until ${day(until)}. Shared access always ends, at the latest when your own access ends.</p>`;
  }
  acts.gaDays = d => { ga.days = Number(d.n); gaRender(["gaUntil", "gaResult"]); };

  // gaPlan decides, for each chosen file, what the person could do before
  // and after the share: the result step shows exactly what fga would allow.
  function gaPlan() {
    if (!ga.who || !ga.sel.size || !ga.opts.size) return [];
    return [...ga.sel].map(id => {
      const o = objByFid(id), actions = [...ga.opts].map(opt => optAction(o, opt)).filter(Boolean);
      const grant = { grantee: ga.who, actions: [...new Set(actions)] };
      const share = canShare(o, ga.who);
      const after = grant.actions.map(a => ({ a, res: decide(ga.who, a, objRes(o, { grant })), before: decide(ga.who, a, objRes(o)).allowed }));
      return { o, grant, share, after };
    });
  }

  function gaResult() {
    const plan = gaPlan();
    if (!plan.length) return stepHead(5, "What will happen") + `<p class="muted small">Choose a person, files and what they may do: this shows what fga would then allow.</p>`;
    const gains = plan.filter(p => p.share.allowed && p.after.some(x => x.res.allowed && !x.before)).length;
    const row = p => {
      const o = p.o, client = bucketOf(o.bucket).mode === "client";
      const chips = p.after.map(x => {
        const label = W.action(x.a, objType(o)).label;
        if (!p.share.allowed) return `<span class="chip off">${esc(label)}</span>`;
        if (x.before) return `<span class="chip ok" title="${esc(`Already could: ${whyText(x.res)}`)}">${icon("check", "xs")}${esc(label)} <small>already</small></span>`;
        if (x.res.allowed) return `<span class="chip ok" title="${esc(`Allowed by: ${whyText(x.res)}`)}">${icon("check", "xs")}${esc(label)}</span>`;
        const reason = x.res.stage === "default" && !S.rules.some(r => r.type === objType(o) && r.effect === "allow" && W.honorsShare(r, x.a))
          ? "No rule accepts shared access for this, so the share would have no effect" : whyText(x.res);
        return `<span class="chip no" title="${esc(reason)}">${icon("x", "xs")}${esc(label)}</span>`;
      }).join("");
      const notes = [];
      if (!p.share.allowed) notes.push(`You may not share it: ${whyText(p.share)}`);
      for (const x of p.after) if (!x.res.allowed && p.share.allowed && x.res.rule) notes.push(`${W.action(x.a, objType(o)).label}: ${ruleTitle(x.res.rule)}`);
      if (p.after.some(x => !x.res.allowed && x.res.stage === "default") && p.share.allowed) notes.push("No rule accepts shared access for some of this: it would have no effect");
      if (client) notes.push("End-to-end encrypted: the owner must also give them a key, on the owner's own computer");
      return `<div class="result-row">${fileIcon(o)}<div class="grow min0"><b class="fname">${esc(o.bucket)}/${esc(o.key)}</b><div class="chips">${chips}</div>` +
        `${notes.map(n => `<div class="note-line">${icon("info", "xs")}${esc(n)}</div>`).join("")}</div></div>`;
    };
    const until = day(new Date(clock() + ga.days * 864e5).toISOString());
    return stepHead(5, "What will happen") +
      `<p class="summary">${gains ? `<b>${esc(displayName(ga.who))}</b> gets access to <b>${plural(gains, "file")}</b> until <b>${until}</b>.`
        : `This would not give <b>${esc(displayName(ga.who))}</b> anything new.`}</p>` +
      `<div class="results">${plan.slice(0, 12).map(row).join("")}${plan.length > 12 ? `<p class="muted small">and ${plan.length - 12} more files</p>` : ""}</div>`;
  }

  acts.gaGive = () => {
    const plan = gaPlan(), expires = new Date(clock() + ga.days * 864e5).toISOString();
    let given = 0;
    for (const p of plan) {
      record(A.me.id, "share", objType(p.o), `${p.o.bucket}/${p.o.key}`, p.share);
      if (!p.share.allowed || !p.after.some(x => x.res.allowed && !x.before)) continue;
      S.shares = S.shares.filter(s => !(s.bucket === p.o.bucket && s.key === p.o.key && s.grantee === ga.who));
      S.shares.push({ bucket: p.o.bucket, key: p.o.key, grantee: ga.who, actions: p.grant.actions, expires, grantor: A.me.id, created: nowIso() });
      given++;
    }
    closeDrawer();
    toast(`${displayName(ga.who)} has access to ${plural(given, "file")} until ${day(expires)}`, "ok");
    route();
  };

  // ---------------------------------------------------------------- user: approvals, activity

  const toApprove = () => S.approvals.filter(a => a.state === "pending" && a.requester !== A.me.id && findObj(a.bucket, a.key) &&
    decide(A.me.id, "approve", objRes(findObj(a.bucket, a.key))).allowed);

  function approvalText(a) {
    return `<b>${esc(displayName(a.requester))}</b> asks to lower <b>${esc(a.bucket)}/${esc(a.key)}</b> from ${labelChip(a.from)} <span class="arrow">→</span> ${labelChip(a.to)}`;
  }

  function renderApprovals() {
    const mine = S.approvals.filter(a => a.requester === A.me.id), pending = toApprove();
    const state = s => `<span class="badge ${s === "approved" ? "ok" : s === "rejected" ? "bad" : "warn"}">${esc({ pending: "Waiting", approved: "Approved", rejected: "Rejected" }[s])}</span>`;
    const body = `<div class="page">${pageHead("Approvals", "Making something less sensitive needs a second person. Requests you may decide come first.")}` +
      `<div class="grid"><div class="card"><div class="card-head"><h3>Waiting for you</h3></div>` +
      (pending.length ? pending.map(a => `<div class="approval">${avatar(a.requester)}<div class="grow"><p>${approvalText(a)}</p>` +
        `<div class="muted small">${ago(a.created)}</div></div><div class="btn-row">` +
        `<button class="btn danger sm" data-act="decideApproval" data-id="${esc(a.id)}" data-v="rejected">Reject</button>` +
        `<button class="btn primary sm" data-act="decideApproval" data-id="${esc(a.id)}" data-v="approved">${icon("check", "sm")}Approve</button></div></div>`).join("")
        : `<div class="empty">${icon("inbox")}<div>Nothing waits for your decision.</div></div>`) + `</div>` +
      `<div class="card"><div class="card-head"><h3>Your requests</h3></div>` +
      (mine.length ? mine.map(a => `<div class="approval"><div class="grow"><p>${approvalText(a)}</p><div class="muted small">${ago(a.created)}` +
        `${a.decidedBy ? ` · decided by ${esc(displayName(a.decidedBy))}` : ""}</div></div>${state(a.state)}</div>`).join("")
        : `<div class="empty">${icon("inbox")}<div>You have no open requests.</div></div>`) + `</div></div></div>`;
    shell("Approvals", "", body);
  }
  A.routes["/approvals"] = renderApprovals;
  acts.decideApproval = d => {
    const a = S.approvals.find(x => x.id === d.id), o = findObj(a.bucket, a.key), res = decide(A.me.id, "approve", objRes(o));
    record(A.me.id, "approve", objType(o), `${a.bucket}/${a.key}`, res);
    if (!res.allowed) return toast(`Not allowed: ${whyText(res)}`, "bad");
    a.state = d.v;
    a.decidedBy = A.me.id;
    if (d.v === "approved") o.label = a.to;
    toast(d.v === "approved" ? `Approved: ${baseName(a.key)} is now ${W.label(a.to).name}` : "Rejected the request", "ok");
    route();
  };

  // eventText says one audit event in words.
  function eventText(e) {
    if (e.admin) return `<b>${esc(displayName(e.actor))}</b> ${esc(e.why)} <span class="muted">· ${esc(e.resource)}</span>`;
    return `<b>${esc(displayName(e.actor))}</b> ${actChip(e.action, e.type, "plain")} <span class="res">${esc(e.resource)}</span>`;
  }
  function auditTable(rows, opts = {}) {
    if (!rows.length) return `<div class="empty">${icon("audit")}<div>No events.</div></div>`;
    return `<table class="tbl"><thead><tr><th>When</th><th>What</th><th>Result</th><th class="hide-sm">Why</th></tr></thead><tbody>` +
      rows.map(e => `<tr><td class="muted nowrap">${opts.full ? when(e.at) : time(e.at)}</td><td><div class="who">${avatar(e.actor, "sm")}<span>${eventText(e)}</span></div></td>` +
        `<td><span class="badge ${e.decision}">${e.admin ? "Changed" : e.decision === "allow" ? "Allowed" : "Not allowed"}</span></td>` +
        `<td class="muted small hide-sm">${esc(e.why)}</td></tr>`).join("") + `</tbody></table>`;
  }

  function renderActivity() {
    shell("Activity", "", `<div class="page">${pageHead("Your activity", "Everything you do is decided by the rules and written to the audit log, allowed or not.")}` +
      `<div class="card">${auditTable(S.audit.filter(e => e.actor === A.me.id).slice(0, 100), { full: true })}</div></div>`);
  }
  A.routes["/activity"] = renderActivity;

  // ---------------------------------------------------------------- demo history

  // seedAudit fills the audit log with decisions made by the demo rules, so
  // the log and the counts agree with what the pages decide.
  function seedAudit() {
    let s = 7;
    const r = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
    const pickR = list => list[Math.floor(r() * list.length)];
    const users = people().filter(p => p.status === "active");
    const events = [];
    for (let i = 0; i < 160; i++) {
      const p = pickR(users), o = pickR(S.objects), a = pickR(["read", "read", "read", "discover", "stat", "share", "delete", "new-version"]);
      const action = o.kind === "object" ? a : o.kind === "document" ? pickR(["read-units", "discover"]) : "deliver";
      const res = decide(p.id, action, objRes(o));
      events.push({ at: new Date(M.now - i * 9.7 * 60e3 - r() * 4e5).toISOString(), actor: p.id, action, type: objType(o),
        resource: `${o.bucket}/${o.key}`, decision: res.allowed ? "allow" : "deny", why: whyText(res) });
    }
    S.audit = events;
    baseline.audit = [];
  }

  // ---------------------------------------------------------------- theme, events, start

  function isDark() {
    const t = document.documentElement.dataset.theme;
    return t ? t === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  acts.theme = (d, el) => {
    const t = isDark() ? "light" : "dark";
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem("fga-console-theme", t); } catch { /* the choice lasts for this page only */ }
    el.innerHTML = icon(isDark() ? "sun" : "moon");
  };

  document.addEventListener("click", e => {
    const el = e.target.closest("[data-act]");
    if (!el || el.disabled || !acts[el.dataset.act]) return;
    if (el.tagName === "INPUT" || el.tagName === "LABEL") return;
    e.preventDefault();
    acts[el.dataset.act](el.dataset, el, e);
  });
  for (const type of ["change", "input"]) {
    document.addEventListener(type, e => {
      const attr = type === "change" ? "onChange" : "onInput", el = e.target.closest(`[data-on-${type}]`);
      if (el && acts[el.dataset[attr]]) acts[el.dataset[attr]](el.dataset, el, e);
    });
  }
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") closeDrawer();
    if (e.key === "Enter" && e.target.id === "loginOther") acts.loginOther();
    if (A.onKey) A.onKey(e);
  });

  Object.assign(A, {
    icon, esc, avatar, displayName, when, day, time, ago, bytes, val, checked, unique, slug, go, plural, tech, typeName, actChip, roleName,
    roleChip, labelChip, projectName, projChip, setName, ruleTitle, person, bucketOf, findObj, allRoles, rolesText, people, matchPerson, toast,
    capsOf, objType, openAction, objRes, bucketRes, decide, decideFor, whyText, plainTrace, whoCan, record, recordAdmin, applyBoth, change,
    updateChangesBtn, download, shell, pageHead, openDrawer, closeDrawer, confirm, gap, fileIcon, fileKindText, baseName, folderOf,
    activeShares, eventText, auditTable, nowIso, clock,
  });

  document.addEventListener("DOMContentLoaded", () => {
    seedAudit();
    try {
      A.tech = localStorage.getItem("fga-console-tech") === "1";
      const t = localStorage.getItem("fga-console-theme");
      if (t) document.documentElement.dataset.theme = t;
      const u = sessionStorage.getItem("fga-console-user");
      if (u && (u === "admin" || (person(u) && person(u).status === "active"))) A.me = { id: u, admin: u === "admin" };
    } catch { /* storage unavailable: start signed out, in the system theme */ }
    window.addEventListener("hashchange", route);
    route();
  });
})();

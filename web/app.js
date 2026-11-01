// The fga console mockup: sign-in, the user's pages and the administrator's
// pages, over demo data. Every allow and deny on these pages comes from
// policy.js deciding against the example bundle's rules, so the pages show
// what fga would decide. Nothing is sent anywhere.
"use strict";

(() => {
  const M = window.FGA_MOCK, P = window.FGA_POLICY, G = window.FGA_GRAPH;
  const app = document.getElementById("app");
  let S = M.initialState();
  let baseline = structuredClone(S);   // the state as last applied; Discard returns to it
  let me = null;                       // { id, admin }
  let changes = [];                    // graph edits not yet applied: { area: "directory" | "policy", text }
  let graph = null, scope = "storage.object", inspected = null, lastCheck = null;
  let ck = { who: "bob", action: "read", res: 0 };
  const auditFilter = { decision: "all", q: "" };
  const graphPos = {};
  const acts = {};

  // ---------------------------------------------------------------- helpers

  const ICONS = {
    mark: '<path d="M12 3l7 3v6c0 4.4-3 7.4-7 9-4-1.6-7-4.6-7-9V6z"/><path d="M9 12l2 2 4-4"/>',
    files: '<path d="M4 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/>',
    inbox: '<path d="M4 13l2.2-7h11.6L20 13v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/><path d="M4 13h5l1 2h4l1-2h5"/>',
    activity: '<path d="M3 12h4l3-7 4 14 3-7h4"/>',
    home: '<path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1z"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c1.9.8 3.1 2.5 3.5 5.2"/>',
    role: '<path d="M12 3l7 3v6c0 4.4-3 7.4-7 9-4-1.6-7-4.6-7-9V6z"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l8-8M16 7l3 3"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    bucket: '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
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
    derived: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4"/><path d="M10 16l2-4 2 4"/>',
    flask: '<path d="M9 3h6M10 3v6L5 18a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3L14 9V3"/><path d="M7.5 14h9"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  };
  const icon = (n, cls = "") => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ""}</svg>`;
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const hue = id => [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 8;
  const avatar = (id, cls = "") => id === "admin"
    ? `<span class="avatar admin ${cls}">A</span>` : `<span class="avatar c${hue(id)} ${cls}" title="${esc(id)}">${esc(id[0])}</span>`;
  const when = iso => new Date(iso).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const clock = iso => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const bytes = n => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`);
  const splitList = s => [...new Set(s.split(/[\s,]+/).map(x => x.trim()).filter(Boolean))];
  const val = id => { const el = document.getElementById(id); return el ? el.value : ""; };
  const unique = (base, taken) => { let i = 1; while (taken(`${base}-${i}`)) i++; return `${base}-${i}`; };
  const currentPath = () => (location.hash.slice(1) || "/login").split("?")[0];
  const go = path => { location.hash = path; };

  const person = id => S.principals.find(p => p.id === id);
  const bucketOf = name => S.buckets.find(b => b.name === name);
  const findObj = (bucket, key) => S.objects.find(o => o.bucket === bucket && o.key === key);
  const rank = label => S.bundle.labels.indexOf(label);
  const allRoles = () => [...new Set([...S.principals.flatMap(p => p.roles), ...S.rules.flatMap(r => r.roles), ...S.extraRoles])]
    .filter(r => r !== "*").sort();
  const rolesText = id => {
    const p = person(id);
    if (!p) return "";
    const projects = p.attributes.projects || [];
    return `${p.roles.join(", ") || "no roles"}${projects.length ? ` · project ${projects.join(", ")}` : ""}`;
  };

  function toast(text, tone = "") {
    const t = document.createElement("div");
    t.className = `toast ${tone}`;
    t.innerHTML = `${icon(tone === "bad" ? "x" : "check")}<span>${esc(text)}</span>`;
    document.getElementById("toasts").appendChild(t);
    setTimeout(() => t.remove(), 4200);
  }

  // ---------------------------------------------------------------- decisions

  const capsOf = (p, type) => [...new Set(p.grants.flatMap(g => (S.permSets[g] && S.permSets[g].caps[type]) || []))];
  const objType = o => ({ object: "storage.object", document: "document.version", derived: "document.derived" })[o.kind];
  const openAction = o => ({ object: "read", document: "read-units", derived: "deliver" })[o.kind];
  const findAction = o => ({ object: "discover", document: "discover", derived: "deliver" })[o.kind];
  const objRes = o => ({ type: objType(o), id: `${o.bucket}/${o.key}`, attributes: { project: bucketOf(o.bucket).project, owner: o.owner,
    label: o.label, label_rank: rank(o.label), shared_with: o.shared_with } });
  const bucketRes = b => ({ type: "storage.bucket", id: b.name, attributes: { project: b.project } });

  function decide(pid, action, resource) {
    const p = person(pid);
    if (!p) return { allowed: false, stage: "unknown", trace: [{ ok: false, text: `${pid} is not in the directory` }] };
    return P.decide({ principal: p, caps: capsOf(p, resource.type), action, resource, rules: S.rules });
  }

  // decideFor decides for an agent acting under a delegation: the rules see
  // the user it acts for, and it may do only what both its own permission
  // sets and the delegation allow.
  function decideFor(dlgId, action, resource) {
    const d = S.delegations.find(x => x.id === dlgId), agent = person(d.actor), subject = person(d.subject);
    if (!agent || !subject) return { allowed: false, stage: "unknown", trace: [{ ok: false, text: `${dlgId} has no agent or no user yet` }] };
    const caps = capsOf(agent, resource.type).filter(a => (d.grants[resource.type] || []).includes(a));
    const res = P.decide({ principal: subject, caps, action, resource, rules: S.rules });
    res.trace.unshift({ ok: true, text: `${agent.id} acts for ${subject.id} under ${d.id}: rules see ${subject.id}; permissions are what both ${agent.id} and the delegation allow` });
    return res;
  }

  const why = res => (res.rule ? res.rule.id : { default: "no rule allows: default deny", bound: "outside the permission sets",
    disabled: "identity disabled", unknown: "unknown identity" }[res.stage] || res.stage);

  function record(actor, action, resource, res, reason) {
    S.audit.unshift({ at: new Date().toISOString(), actor, action, resource, decision: res.allowed ? "allow" : "deny", why: reason || why(res) });
  }
  const recordAdmin = (action, target) => record("admin", action, target, { allowed: true }, "admin API");

  // applyBoth makes a change from an admin form in the working state and in
  // the applied baseline: forms apply at once, unlike graph edits.
  function applyBoth(fn) { fn(S); fn(baseline); }

  // ---------------------------------------------------------------- routing and shell

  const routes = {
    "/login": renderLogin, "/files": renderFiles, "/approvals": renderApprovals, "/activity": renderActivity,
    "/admin": renderOverview, "/admin/users": renderUsers, "/admin/roles": renderRoles, "/admin/permissions": renderPermissions,
    "/admin/delegations": renderDelegations, "/admin/buckets": renderBuckets, "/admin/tools": renderTools,
    "/admin/policies": renderPolicies, "/admin/graph": renderGraph, "/admin/audit": renderAudit,
  };

  function route() {
    const [path, query] = (location.hash.slice(1) || "/login").split("?");
    const home = me ? (me.admin ? "/admin" : "/files") : "/login";
    if (!me && path !== "/login") return go("/login");
    if (me && (path === "/login" || path.startsWith("/admin") !== me.admin || !routes[path])) return go(home);
    closeDrawer();
    graph = null;
    routes[path](new URLSearchParams(query || ""));
  }

  const brand = () => `<div class="brand"><span class="brand-mark">${icon("mark")}</span><span>fga console<small>${esc(S.tenant)}</small></span></div>`;

  function navLink(path, ic, label, count) {
    return `<a href="#${path}" class="${currentPath() === path ? "active" : ""}" title="${esc(label)}">${icon(ic)}<span class="lbl">${esc(label)}</span>` +
      `${count ? `<span class="count">${count}</span>` : ""}</a>`;
  }

  function shell(title, sub, body, opts = {}) {
    const nav = me.admin
      ? `<div class="nav-section">Tenant</div>${navLink("/admin", "home", "Overview")}` +
        `<div class="nav-section">Directory</div>${navLink("/admin/users", "users", "Users and agents")}${navLink("/admin/roles", "role", "Roles")}` +
        `${navLink("/admin/permissions", "key", "Permission sets")}${navLink("/admin/delegations", "link", "Delegations")}` +
        `<div class="nav-section">Resources</div>${navLink("/admin/buckets", "bucket", "Buckets")}${navLink("/admin/tools", "bolt", "Tools")}` +
        `<div class="nav-section">Policy</div>${navLink("/admin/policies", "policy", "Policies")}${navLink("/admin/graph", "graph", "Access graph")}` +
        `<div class="nav-section">Monitoring</div>${navLink("/admin/audit", "audit", "Audit log")}`
      : `<div class="nav-section">Workspace</div>${navLink("/files", "files", "Files")}` +
        `${navLink("/approvals", "inbox", "Approvals", toApprove().length)}${navLink("/activity", "activity", "Activity")}`;
    app.innerHTML = `<div class="shell${opts.compact ? " compact" : ""}"><aside class="sidebar">${brand()}<nav class="nav">${nav}</nav>` +
      `<div class="me">${avatar(me.id)}<div><b>${esc(me.admin ? "Administrator" : me.id)}</b>` +
      `<span class="muted">${esc(me.admin ? "full access" : rolesText(me.id))}</span></div>` +
      `<button class="btn ghost icon sm" data-act="logout" title="Switch user" aria-label="Switch user">${icon("logout")}</button></div></aside>` +
      `<main class="main"><header class="topbar"><h1>${esc(title)}</h1>${sub ? `<span class="sub">${esc(sub)}</span>` : ""}` +
      `<span class="spacer"></span><span class="pill" title="A mockup with demo data: nothing is sent to fga">${icon("flask", "sm")}Mockup · demo data</span>` +
      `<button class="btn ghost icon" data-act="theme" aria-label="Switch light or dark">${icon(isDark() ? "sun" : "moon")}</button></header>` +
      `<div class="content${opts.flush ? " flush" : ""}">${body}</div></main></div>`;
  }

  const pageHead = (title, text, buttons = "") =>
    `<div class="page-head"><div><h2>${esc(title)}</h2>${text ? `<p>${text}</p>` : ""}</div>${buttons ? `<div class="btn-row">${buttons}</div>` : ""}</div>`;

  // ---------------------------------------------------------------- drawer

  function openDrawer(title, body, foot = "") {
    closeDrawer();
    const d = document.createElement("div");
    d.id = "drawer";
    d.innerHTML = `<div class="scrim" data-act="closeDrawer"></div><aside class="drawer" role="dialog" aria-modal="true" aria-label="${esc(title)}">` +
      `<div class="drawer-head"><h3>${esc(title)}</h3><button class="btn ghost icon sm" data-act="closeDrawer" aria-label="Close">${icon("x")}</button></div>` +
      `<div class="drawer-body">${body}</div>${foot ? `<div class="drawer-foot">${foot}</div>` : ""}</aside>`;
    document.body.appendChild(d);
    const first = d.querySelector(".drawer-body input:not([type=checkbox]), .drawer-body select, .drawer-body textarea");
    if (first) first.focus();
  }
  function closeDrawer() { const d = document.getElementById("drawer"); if (d) d.remove(); }
  acts.closeDrawer = closeDrawer;

  // ---------------------------------------------------------------- sign-in

  function renderLogin() {
    const users = S.principals.filter(p => p.kind === "user" && p.status === "active");
    app.innerHTML = `<div class="login"><div class="login-card">${brand()}<h1>Sign in</h1>` +
      `<p class="lead">Tenant <b>${esc(S.tenant)}</b>, development. Choose who you are.</p><div class="tiles">` +
      users.map(p => `<button class="tile" data-act="login" data-id="${esc(p.id)}">${avatar(p.id, "lg")}<span><b>${esc(p.id)}</b>` +
        `<span class="muted">${esc(rolesText(p.id))}</span></span></button>`).join("") +
      `<button class="tile admin-tile" data-act="login" data-id="admin">${avatar("admin", "lg")}<span><b>Administrator</b>` +
      `<span class="muted">Users, roles, permissions, policies and audit for the whole tenant</span></span></button></div>` +
      `<div class="login-foot">${icon("lock")}<span>Development sign-in: the console mints a short-lived token for the identity you pick. ` +
      `In production you sign in through your identity provider (OpenID Connect), and the console never sees a password.</span></div></div></div>`;
  }
  acts.login = d => {
    me = { id: d.id, admin: d.id === "admin" };
    try { sessionStorage.setItem("fga-console-user", d.id); } catch { /* the session is kept in memory only */ }
    go(me.admin ? "/admin" : "/files");
  };
  acts.logout = () => {
    me = null;
    try { sessionStorage.removeItem("fga-console-user"); } catch { /* nothing kept */ }
    go("/login");
  };

  // ---------------------------------------------------------------- user: files

  const canSee = o => decide(me.id, findAction(o), objRes(o)).allowed || decide(me.id, openAction(o), objRes(o)).allowed;
  const KIND_ICON = { object: "file", document: "doc", derived: "derived" };
  const KIND_TEXT = { object: "object", document: "document", derived: "derived output" };

  function renderFiles(params) {
    const visible = S.buckets.filter(b => decide(me.id, "list", bucketRes(b)).allowed);
    const sharedIn = S.objects.filter(o => !visible.includes(bucketOf(o.bucket)) && canSee(o));
    const tabs = visible.map(b => b.name).concat(sharedIn.length ? ["~shared"] : []);
    const pick = tabs.includes(params.get("b")) ? params.get("b") : tabs[0];
    const bucket = pick && pick !== "~shared" ? bucketOf(pick) : null;
    const list = pick === "~shared" ? sharedIn : bucket ? S.objects.filter(o => o.bucket === bucket.name && canSee(o)) : [];
    const canUpload = bucket && decide(me.id, "create-object", bucketRes(bucket)).allowed;

    const tab = b => `<button class="bucket ${pick === b.name ? "on" : ""}" data-act="pickBucket" data-b="${esc(b.name)}">` +
      `<b>${icon("bucket")}${esc(b.name)}</b><div class="meta">` +
      (b.mode === "client" ? `<span class="badge accent">${icon("lock", "sm")}Client-encrypted</span>` : `<span class="badge muted">${icon("server", "sm")}Server-encrypted</span>`) +
      `<span class="chip">project ${esc(b.project)}</span><span class="chip">${S.objects.filter(o => o.bucket === b.name && canSee(o)).length} items</span></div></button>`;
    const sharedTab = sharedIn.length ? `<button class="bucket ${pick === "~shared" ? "on" : ""}" data-act="pickBucket" data-b="~shared">` +
      `<b>${icon("share")}Shared with you</b><div class="meta"><span class="chip">${sharedIn.length} items</span>` +
      `<span class="chip">by grant</span></div></button>` : "";

    const body = `<div class="page">${pageHead("Files", "Buckets and objects you may see. Every row and button here is a policy decision: what the rules do not allow is not shown, or not clickable.",
      canUpload ? `<button class="btn primary" data-act="upload" data-b="${esc(bucket.name)}">${icon("upload")}Upload</button>` : "")}` +
      (tabs.length ? `<div class="bucket-tabs">${visible.map(tab).join("")}${sharedTab}</div>` : "") +
      `<div class="card">${list.length ? `<table class="tbl"><thead><tr><th>Name</th><th>Label</th><th>Owner</th><th class="num">Size</th><th>Modified</th><th></th></tr></thead>` +
        `<tbody>${list.map(objectRow).join("")}</tbody></table>`
        : `<div class="empty">${icon("files")}<div>${tabs.length ? "Nothing here that you may see." : "No bucket lets you list it. Ask an administrator for access."}</div></div>`}</div></div>`;
    shell("Files", bucket ? `${bucket.name} · project ${bucket.project}` : "", body);
  }

  function objectRow(o) {
    const b = bucketOf(o.bucket), r = objRes(o);
    const deny = (action, verb) => {
      const res = decide(me.id, action, r);
      return res.allowed ? "" : `disabled title="${esc(`You may not ${verb}: ${why(res)}`)}"`;
    };
    const labelAllowed = o.kind === "object" && ["label", "relabel"].some(a => decide(me.id, a, r).allowed);
    return `<tr><td><div class="obj">${icon(KIND_ICON[o.kind])}<div><b>${esc(o.key)}</b><div class="muted small">${esc(KIND_TEXT[o.kind])}` +
      `${b.mode === "client" ? " · client-encrypted" : ""}</div></div></div></td>` +
      `<td><span class="chip label-chip label-${esc(o.label)}">${esc(o.label)}</span></td>` +
      `<td><div class="who">${avatar(o.owner)}<span>${o.owner === me.id ? "you" : esc(o.owner)}</span></div></td>` +
      `<td class="num">${bytes(o.size)}</td><td class="muted">${when(o.modified)}</td><td class="actions">` +
      `<button class="btn sm" data-act="open" data-b="${esc(o.bucket)}" data-k="${esc(o.key)}" ${deny(openAction(o), "open it")}>Open</button> ` +
      `<button class="btn sm icon ghost" data-act="share" data-b="${esc(o.bucket)}" data-k="${esc(o.key)}" aria-label="Share" ${deny("share", "share it") || 'title="Share"'}>${icon("share")}</button>` +
      (o.kind === "object" ? `<button class="btn sm icon ghost" data-act="label" data-b="${esc(o.bucket)}" data-k="${esc(o.key)}" aria-label="Label" ` +
        `${labelAllowed ? 'title="Change label"' : 'disabled title="You may not label it"'}>${icon("tag")}</button>` : "") + `</td></tr>`;
  }

  acts.pickBucket = d => go(`/files?b=${encodeURIComponent(d.b)}`);

  acts.open = d => {
    const o = findObj(d.b, d.k), b = bucketOf(o.bucket), action = openAction(o), res = decide(me.id, action, objRes(o));
    record(me.id, action, `${o.bucket}/${o.key}`, res);
    if (!res.allowed) return toast(`Refused: ${why(res)}`, "bad");
    const line = `<div class="decision-line"><span class="badge allow">${icon("check", "sm")}allowed</span>by rule <code>${esc(res.rule.id)}</code></div>`;
    const meta = `<dl class="kv"><dt>Bucket</dt><dd>${esc(o.bucket)}</dd><dt>Owner</dt><dd>${esc(o.owner)}</dd><dt>Label</dt>` +
      `<dd><span class="chip label-chip label-${esc(o.label)}">${esc(o.label)}</span></dd><dt>Encryption</dt><dd>${b.mode === "client" ? "client" : "server"}</dd></dl>`;
    if (b.mode === "client") {
      return openDrawer(o.key, `${line}${meta}<p class="insp-note">This bucket is client-encrypted: the server holds only ciphertext, and only ` +
        `people the owner shared a key with can decrypt it. Open it on your own computer with your keys:</p>` +
        `<div class="preview">fga get -bucket ${esc(o.bucket)} -key ${esc(o.key)} -out ${esc(o.key.split("/").pop())}</div>`);
    }
    openDrawer(o.key, `${line}${meta}<div class="preview">${esc(o.body || "(empty)")}</div>`,
      `<button class="btn" data-act="closeDrawer">Close</button><button class="btn primary" data-act="download" data-b="${esc(o.bucket)}" data-k="${esc(o.key)}">${icon("download")}Download</button>`);
  };

  acts.download = d => {
    const o = findObj(d.b, d.k);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([o.body || ""], { type: "text/plain" }));
    a.download = o.key.split("/").pop();
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  acts.share = d => {
    const o = findObj(d.b, d.k), b = bucketOf(o.bucket);
    if (b.mode === "client") {
      return openDrawer(`Share ${o.key}`, `<p class="insp-note">Client-encrypted objects are shared by encrypting their key for the other ` +
        `person's recipient key, which happens on your computer. Run:</p><div class="preview">fga share -bucket ${esc(o.bucket)} -key ${esc(o.key)} -to &lt;their key fingerprint&gt;</div>`);
    }
    const others = S.principals.filter(p => p.id !== me.id && p.kind === "user" && p.status === "active");
    const current = Object.entries(o.shared_with).flatMap(([a, ids]) => ids.map(id => ({ a, id })));
    openDrawer(`Share ${o.key}`,
      `<p class="muted small">A share is a grant on this one object. The policy decides what grants count; in this bundle, grantees may read, stat and discover.</p>` +
      `<label class="field"><span>Person</span><select class="input" id="fGrantee">${others.map(p => `<option>${esc(p.id)}</option>`).join("")}</select></label>` +
      `<div class="field"><span>They may</span>${["read", "stat", "discover"].map(a => `<label class="check"><input type="checkbox" data-share="${a}" ${a !== "discover" ? "checked" : ""}>${a}</label>`).join("")}</div>` +
      `<label class="field"><span>Until</span><select class="input" id="fExpires"><option>1 hour</option><option>1 day</option><option>7 days</option></select></label>` +
      (current.length ? `<div class="field"><span>Shared now</span>${current.map(g => `<div class="list-row">${avatar(g.id)}<span class="grow">${esc(g.id)} · ${esc(g.a)}</span>` +
        `<button class="btn sm danger" data-act="unshare" data-b="${esc(o.bucket)}" data-k="${esc(o.key)}" data-id="${esc(g.id)}" data-a="${esc(g.a)}">Remove</button></div>`).join("")}</div>` : ""),
      `<button class="btn" data-act="closeDrawer">Cancel</button><button class="btn primary" data-act="doShare" data-b="${esc(o.bucket)}" data-k="${esc(o.key)}">${icon("share")}Share</button>`);
  };
  acts.doShare = d => {
    const o = findObj(d.b, d.k), res = decide(me.id, "share", objRes(o)), who = val("fGrantee");
    const actions = [...document.querySelectorAll("#drawer [data-share]:checked")].map(x => x.dataset.share);
    record(me.id, "share", `${o.bucket}/${o.key}`, res);
    if (!res.allowed) return toast(`Refused: ${why(res)}`, "bad");
    if (!actions.length) return toast("Choose at least one action", "bad");
    actions.forEach(a => { if (!o.shared_with[a].includes(who)) o.shared_with[a].push(who); });
    closeDrawer();
    toast(`Shared ${o.key} with ${who} (${actions.join(", ")}) until ${val("fExpires") || "the chosen time"}`, "ok");
    route();
  };
  acts.unshare = d => {
    const o = findObj(d.b, d.k);
    o.shared_with[d.a] = o.shared_with[d.a].filter(x => x !== d.id);
    record(me.id, "ungrant", `${o.bucket}/${o.key}`, { allowed: true }, "owner-all");
    closeDrawer();
    toast(`${d.id} may no longer ${d.a} ${o.key}`, "ok");
    route();
  };

  acts.label = d => {
    const o = findObj(d.b, d.k);
    openDrawer(`Label ${o.key}`, `<p class="muted small">Labels order sensitivity: ${S.bundle.labels.map(esc).join(" → ")}. ` +
      `Raising a label happens at once; lowering it needs an approval from a project lead.</p>` +
      `<label class="field"><span>Label</span><select class="input" id="fLabel">${S.bundle.labels.map(l => `<option ${l === o.label ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label>`,
      `<button class="btn" data-act="closeDrawer">Cancel</button><button class="btn primary" data-act="doLabel" data-b="${esc(o.bucket)}" data-k="${esc(o.key)}">Apply</button>`);
  };
  acts.doLabel = d => {
    const o = findObj(d.b, d.k), to = val("fLabel");
    if (to === o.label) return closeDrawer();
    const lowering = rank(to) < rank(o.label), action = lowering ? "relabel" : "label", res = decide(me.id, action, objRes(o));
    closeDrawer();
    if (!res.allowed) { record(me.id, action, `${o.bucket}/${o.key}`, res); return toast(`Refused: ${why(res)}`, "bad"); }
    if (!lowering) {
      record(me.id, action, `${o.bucket}/${o.key}`, res);
      o.label = to;
      toast(`${o.key} is now ${to}`, "ok");
    } else {
      const id = Math.random().toString(16).slice(2, 8);
      S.approvals.push({ id, bucket: o.bucket, key: o.key, from: o.label, to, requester: me.id, created: new Date().toISOString(), state: "pending" });
      record(me.id, action, `${o.bucket}/${o.key}`, { allowed: false }, "approval required");
      toast(`Lowering needs approval: request ${id} went to the project's leads`);
    }
    route();
  };

  acts.upload = d => {
    const b = bucketOf(d.b);
    if (b.mode === "client") {
      return openDrawer(`Upload to ${b.name}`, `<p class="insp-note">This bucket is client-encrypted: files are encrypted on your computer before they leave it. Run:</p>` +
        `<div class="preview">fga put -bucket ${esc(b.name)} -key &lt;name&gt; -in &lt;file&gt;</div>`);
    }
    openDrawer(`Upload to ${b.name}`,
      `<label class="field"><span>Name</span><input class="input" id="fKey" placeholder="q4/minutes.txt"></label>` +
      `<label class="field"><span>Label</span><select class="input" id="fLabel">${S.bundle.labels.map(l => `<option ${l === "internal" ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label>` +
      `<label class="field"><span>Content</span><textarea class="input" id="fBody" placeholder="Text to store"></textarea><small>The server encrypts it under a fresh data key.</small></label>`,
      `<button class="btn" data-act="closeDrawer">Cancel</button><button class="btn primary" data-act="doUpload" data-b="${esc(b.name)}">${icon("upload")}Upload</button>`);
  };
  acts.doUpload = d => {
    const b = bucketOf(d.b), key = val("fKey").trim(), res = decide(me.id, "create-object", bucketRes(b));
    if (!key || /^\/|\.\.|\s/.test(key)) return toast("Give a name without spaces, such as q4/minutes.txt", "bad");
    if (findObj(b.name, key)) return toast(`${key} already exists`, "bad");
    record(me.id, "create-object", `${b.name}/${key}`, res);
    if (!res.allowed) return toast(`Refused: ${why(res)}`, "bad");
    const body = val("fBody");
    S.objects.push({ bucket: b.name, key, kind: "object", owner: me.id, label: val("fLabel"), size: new Blob([body]).size,
      modified: new Date().toISOString(), shared_with: { read: [], stat: [], discover: [] }, body });
    closeDrawer();
    toast(`Uploaded ${key} (server-encrypted)`, "ok");
    route();
  };

  // ---------------------------------------------------------------- user: approvals, activity

  const toApprove = () => S.approvals.filter(a => a.state === "pending" && a.requester !== me.id &&
    decide(me.id, "approve", objRes(findObj(a.bucket, a.key))).allowed);

  function approvalText(a) {
    return `<b>${esc(a.requester)}</b> asks to lower <code>${esc(a.bucket)}/${esc(a.key)}</code> from ` +
      `<span class="chip label-chip label-${esc(a.from)}">${esc(a.from)}</span> <span class="arrow">→</span> <span class="chip label-chip label-${esc(a.to)}">${esc(a.to)}</span>`;
  }

  function renderApprovals() {
    const mine = S.approvals.filter(a => a.requester === me.id), pending = toApprove();
    const state = s => `<span class="badge ${s === "approved" ? "ok" : s === "rejected" ? "bad" : "warn"}">${esc(s)}</span>`;
    const body = `<div class="page">${pageHead("Approvals", "Lowering a label needs a second person. Requests you may decide are listed first.")}` +
      `<div class="grid"><div class="card"><div class="card-head"><h3>Waiting for you</h3></div>` +
      (pending.length ? pending.map(a => `<div class="approval">${avatar(a.requester)}<div class="grow"><p>${approvalText(a)}</p>` +
        `<div class="muted small">Request ${esc(a.id)} · ${when(a.created)}</div></div><div class="btn-row">` +
        `<button class="btn danger sm" data-act="decideApproval" data-id="${esc(a.id)}" data-v="rejected">Reject</button>` +
        `<button class="btn primary sm" data-act="decideApproval" data-id="${esc(a.id)}" data-v="approved">${icon("check", "sm")}Approve</button></div></div>`).join("")
        : `<div class="empty">${icon("inbox")}<div>Nothing waits for your decision.</div></div>`) + `</div>` +
      `<div class="card"><div class="card-head"><h3>Your requests</h3></div>` +
      (mine.length ? mine.map(a => `<div class="approval"><div class="grow"><p>${approvalText(a)}</p><div class="muted small">Request ${esc(a.id)} · ${when(a.created)}` +
        `${a.decidedBy ? ` · decided by ${esc(a.decidedBy)}` : ""}</div></div>${state(a.state)}</div>`).join("")
        : `<div class="empty">${icon("inbox")}<div>You have no open requests.</div></div>`) + `</div></div></div>`;
    shell("Approvals", "", body);
  }
  acts.decideApproval = d => {
    const a = S.approvals.find(x => x.id === d.id), o = findObj(a.bucket, a.key), res = decide(me.id, "approve", objRes(o));
    record(me.id, "approve", `${a.bucket}/${a.key}`, res);
    if (!res.allowed) return toast(`Refused: ${why(res)}`, "bad");
    a.state = d.v;
    a.decidedBy = me.id;
    if (d.v === "approved") o.label = a.to;
    toast(d.v === "approved" ? `Approved: ${a.key} is now ${a.to}` : `Rejected request ${a.id}`, "ok");
    route();
  };

  function auditTable(rows) {
    if (!rows.length) return `<div class="empty">${icon("audit")}<div>No events.</div></div>`;
    return `<table class="tbl"><thead><tr><th>Time</th><th>Who</th><th>Action</th><th>Resource</th><th>Decision</th><th>Why</th></tr></thead><tbody>` +
      rows.map(e => `<tr><td class="muted mono">${clock(e.at)}</td><td><div class="who">${avatar(e.actor)}<span>${esc(e.actor)}</span></div></td>` +
        `<td><code>${esc(e.action)}</code></td><td>${esc(e.resource)}</td>` +
        `<td><span class="badge ${e.decision}">${e.decision === "allow" ? "allowed" : "denied"}</span></td><td class="muted small">${esc(e.why)}</td></tr>`).join("") +
      `</tbody></table>`;
  }

  function renderActivity() {
    shell("Activity", "", `<div class="page">${pageHead("Your activity", "Every request you make is decided by policy and written to the audit log, allowed or not.")}` +
      `<div class="card">${auditTable(S.audit.filter(e => e.actor === me.id))}</div></div>`);
  }

  // ---------------------------------------------------------------- admin: overview

  function renderOverview() {
    const users = S.principals.filter(p => p.kind === "user"), agents = S.principals.filter(p => p.kind === "agent");
    const denied = S.audit.filter(e => e.decision === "deny").length;
    const kpi = (ic, label, value, foot) => `<div class="card kpi"><div class="label">${icon(ic, "sm")}${esc(label)}</div><div class="value">${value}</div><div class="foot">${esc(foot)}</div></div>`;
    const body = `<div class="page">${pageHead(`Tenant ${S.tenant}`, "Who may do what, and what was decided. Changes made here go through fga's admin API and are audited.",
      `<a class="btn" href="#/admin/users">${icon("plus")}Add a user</a><a class="btn primary" href="#/admin/graph">${icon("graph")}Open access graph</a>`)}` +
      `<div class="grid kpis">${kpi("users", "Users", users.length, `${users.filter(u => u.status === "active").length} active`)}` +
      `${kpi("bolt", "Agents", agents.length, `${S.delegations.filter(d => d.status === "active").length} active delegations`)}` +
      `${kpi("bucket", "Buckets", S.buckets.length, `${S.objects.length} objects`)}${kpi("policy", "Rules", S.rules.length, `bundle epoch ${S.bundle.epoch}`)}` +
      `${kpi("inbox", "Pending approvals", S.approvals.filter(a => a.state === "pending").length, "label lowerings")}` +
      `${kpi("x", "Denied requests", denied, "in the audit log")}</div>` +
      `<div class="grid two spaced"><div class="card"><div class="card-head"><h3>Recent decisions</h3><a class="right small" href="#/admin/audit">Audit log</a></div>` +
      S.audit.slice(0, 7).map(e => `<div class="list-row"><span class="badge ${e.decision}">${e.decision === "allow" ? "allowed" : "denied"}</span>` +
        `<div class="grow"><b>${esc(e.actor)}</b> <code>${esc(e.action)}</code> ${esc(e.resource)}<div class="muted small">${esc(e.why)}</div></div>` +
        `<span class="muted small mono">${clock(e.at)}</span></div>`).join("") + `</div>` +
      `<div class="grid"><div class="card"><div class="card-head"><h3>Services</h3><span class="right badge ok">all healthy</span></div>` +
      S.services.map(s => `<div class="service"><span class="dot ${s.ok ? "" : "bad"}"></span><div><b>${esc(s.name)}</b><div class="muted small">${esc(s.role)}</div></div>` +
        `<span class="mono">${esc(s.addr)}</span></div>`).join("") + `</div>` +
      `<div class="card"><div class="card-head"><h3>Policy bundle</h3><a class="right small" href="#/admin/policies">Policies</a></div><div class="card-body">` +
      `<dl class="kv"><dt>Epoch</dt><dd>${S.bundle.epoch}</dd><dt>Signed by</dt><dd><code>${esc(S.bundle.keyId)}</code></dd>` +
      `<dt>Active since</dt><dd>${when(S.bundle.activated)}</dd><dt>Labels</dt><dd><div class="chips">${S.bundle.labels.map(l => `<span class="chip label-chip label-${l}">${l}</span>`).join("")}</div></dd></dl>` +
      `</div></div></div></div></div>`;
    shell("Overview", "", body);
  }

  // ---------------------------------------------------------------- admin: directory

  function renderUsers() {
    const rows = S.principals.map(p => `<tr class="clickable" data-act="editUser" data-id="${esc(p.id)}">` +
      `<td><div class="who">${avatar(p.id)}<div><b>${esc(p.id)}</b>${p.kind === "agent" ? ` <span class="badge accent">agent</span>` : ""}</div></div></td>` +
      `<td><div class="chips">${p.roles.map(r => `<span class="chip">${esc(r)}</span>`).join("") || '<span class="muted small">none</span>'}</div></td>` +
      `<td>${esc((p.attributes.projects || []).join(", ")) || '<span class="muted small">—</span>'}</td>` +
      `<td><div class="chips">${p.grants.map(g => `<span class="chip on">${esc(S.permSets[g] ? S.permSets[g].name : g)}</span>`).join("") || '<span class="muted small">none: may do nothing</span>'}</div></td>` +
      `<td><span class="badge ${p.status === "active" ? "ok" : "muted"}">${esc(p.status)}</span></td></tr>`).join("");
    shell("Users and agents", "", `<div class="page">${pageHead("Users and agents",
      "Identities of the tenant. Roles and attributes are what rules match on; permission sets bound what an identity may ever do.",
      `<button class="btn primary" data-act="editUser" data-new="1">${icon("plus")}New identity</button>`)}` +
      `<div class="card"><table class="tbl"><thead><tr><th>Identity</th><th>Roles</th><th>Projects</th><th>Permission sets</th><th>Status</th></tr></thead>` +
      `<tbody>${rows}</tbody></table></div></div>`);
  }

  acts.editUser = d => {
    const isNew = d.new === "1", p = isNew ? { id: "", kind: "user", roles: [], attributes: { projects: [] }, grants: [], status: "active" } : person(d.id);
    const roles = allRoles();
    openDrawer(isNew ? "New identity" : p.id,
      (isNew ? `<label class="field"><span>Id</span><input class="input" id="fUserId" placeholder="dana" autocomplete="off"><small>The subject of their tokens.</small></label>` +
        `<label class="field"><span>Kind</span><select class="input" id="fUserKind"><option value="user">user</option><option value="agent">agent</option></select></label>` : "") +
      `<label class="field"><span>Roles</span><input class="input" id="fUserRoles" value="${esc(p.roles.join(", "))}" list="roleList" autocomplete="off">` +
      `<datalist id="roleList">${roles.map(r => `<option value="${esc(r)}">`).join("")}</datalist><small>Comma-separated. Known: ${esc(roles.join(", "))}</small></label>` +
      `<label class="field"><span>Projects</span><input class="input" id="fUserProjects" value="${esc((p.attributes.projects || []).join(", "))}" autocomplete="off"><small>The <code>projects</code> attribute that rules compare with a resource's project.</small></label>` +
      `<div class="field"><span>Permission sets</span>${Object.entries(S.permSets).map(([id, s]) => `<label class="check"><input type="checkbox" data-grant="${esc(id)}" ${p.grants.includes(id) ? "checked" : ""}>${esc(s.name)}</label>`).join("")}` +
      `<small>Without a permission set, no rule can allow anything.</small></div>`,
      (isNew ? "" : `<button class="btn ${p.status === "active" ? "danger" : ""}" data-act="toggleUser" data-id="${esc(p.id)}">${p.status === "active" ? "Disable" : "Enable"}</button><span class="spacer"></span>`) +
      `<button class="btn" data-act="closeDrawer">Cancel</button><button class="btn primary" data-act="saveUser" data-id="${esc(p.id)}" data-new="${isNew ? 1 : 0}">Save</button>`);
  };
  acts.saveUser = d => {
    const isNew = d.new === "1", id = isNew ? val("fUserId").trim() : d.id;
    if (!/^[a-z0-9][a-z0-9._-]{0,62}$/.test(id)) return toast("Use lowercase letters, digits, dots, dashes or underscores for the id", "bad");
    if (isNew && person(id)) return toast(`${id} already exists`, "bad");
    const kind = isNew ? val("fUserKind") : person(id).kind, roles = splitList(val("fUserRoles")), projects = splitList(val("fUserProjects"));
    const grants = [...document.querySelectorAll("#drawer [data-grant]:checked")].map(x => x.dataset.grant);
    applyBoth(st => {
      let p = st.principals.find(x => x.id === id);
      if (!p) { p = { id, kind, roles: [], attributes: {}, grants: [], status: "active" }; st.principals.push(p); }
      p.roles = roles;
      p.grants = grants;
      p.attributes = { ...p.attributes, projects };
    });
    recordAdmin("identity put", id);
    closeDrawer();
    toast(`Saved ${id} through the admin API (mockup: nothing sent)`, "ok");
    route();
  };
  acts.toggleUser = d => {
    const next = person(d.id).status === "active" ? "disabled" : "active";
    applyBoth(st => { st.principals.find(x => x.id === d.id).status = next; });
    recordAdmin(next === "active" ? "identity enable" : "identity disable", d.id);
    closeDrawer();
    toast(`${d.id} is ${next}`, "ok");
    route();
  };

  function renderRoles() {
    const rows = allRoles().map(r => {
      const members = S.principals.filter(p => p.roles.includes(r)), rules = S.rules.filter(x => x.roles.includes(r));
      const types = [...new Set(rules.map(x => x.type))];
      return `<tr><td><b>${esc(r)}</b></td><td><div class="chips">${members.map(p => avatar(p.id)).join("") || '<span class="muted small">nobody</span>'}</div></td>` +
        `<td>${rules.length}</td><td><div class="chips">${types.map(t => `<span class="chip">${esc(t)}</span>`).join("") || '<span class="muted small">no rules: grants nothing</span>'}</div></td>` +
        `<td class="actions"><a class="btn sm" href="#/admin/graph?type=${encodeURIComponent(types[0] || "storage.object")}">${icon("graph", "sm")}Graph</a></td></tr>`;
    }).join("");
    shell("Roles", "", `<div class="page">${pageHead("Roles", "A role means nothing by itself: rules give it meaning. Rules for <b>anyone</b> apply to every identity, usually with a condition such as ownership.")}` +
      `<div class="card"><table class="tbl"><thead><tr><th>Role</th><th>Members</th><th>Rules</th><th>Resource types</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></div>`);
  }

  function renderPermissions() {
    const rows = Object.entries(S.permSets).map(([id, s]) => {
      const holders = S.principals.filter(p => p.grants.includes(id));
      return `<tr class="clickable" data-act="showSet" data-id="${esc(id)}"><td><b>${esc(s.name)}</b> ${s.builtin ? '<span class="badge muted">preset</span>' : ""}</td>` +
        `<td><div class="chips">${Object.entries(s.caps).map(([t, a]) => `<span class="chip">${esc(t)} · ${a.length}</span>`).join("")}</div></td>` +
        `<td><div class="chips">${holders.map(p => avatar(p.id)).join("") || '<span class="muted small">nobody</span>'}</div></td></tr>`;
    }).join("");
    shell("Permission sets", "", `<div class="page">${pageHead("Permission sets",
      "The upper bound of what an identity may ever do. A request is allowed only if a permission set includes the action <i>and</i> a rule allows it.",
      `<button class="btn primary" data-act="newSet">${icon("plus")}New permission set</button>`)}` +
      `<div class="card"><table class="tbl"><thead><tr><th>Set</th><th>Actions by resource type</th><th>Held by</th></tr></thead><tbody>${rows}</tbody></table></div></div>`);
  }
  acts.showSet = d => {
    const s = S.permSets[d.id];
    openDrawer(s.name, Object.entries(s.caps).map(([t, a]) => `<div class="field"><span>${esc(t)}</span><div class="chips">${a.map(x => `<span class="chip">${esc(x)}</span>`).join("")}</div></div>`).join("") +
      (s.builtin ? `<p class="insp-note">Built in: <code>fga-admin grant -preset ${esc(d.id)}</code>.</p>` : ""));
  };
  acts.newSet = () => {
    const types = Object.keys(S.types).sort();
    openDrawer("New permission set",
      `<label class="field"><span>Name</span><input class="input" id="fSetName" placeholder="read documents"></label>` +
      `<label class="field"><span>Resource type</span><select class="input" id="fSetType" data-on-change="setTypeChanged">${types.map(t => `<option>${esc(t)}</option>`).join("")}</select></label>` +
      `<div class="field"><span>Actions</span><div id="fSetActions">${setActionChecks(types[0])}</div></div>`,
      `<button class="btn" data-act="closeDrawer">Cancel</button><button class="btn primary" data-act="saveSet">Create</button>`);
  };
  const setActionChecks = t => S.types[t].map(a => `<label class="check"><input type="checkbox" data-action="${esc(a)}">${esc(a)}</label>`).join("");
  acts.setTypeChanged = (d, el) => { document.getElementById("fSetActions").innerHTML = setActionChecks(el.value); };
  acts.saveSet = () => {
    const name = val("fSetName").trim(), type = val("fSetType"), actions = [...document.querySelectorAll("#drawer [data-action]:checked")].map(x => x.dataset.action);
    if (!name) return toast("Give the set a name", "bad");
    if (!actions.length) return toast("Choose at least one action", "bad");
    const id = unique(name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "set", x => S.permSets[x]).replace(/-1$/, "");
    applyBoth(st => { st.permSets[id] = { name, caps: { [type]: actions } }; });
    recordAdmin("grant set create", id);
    closeDrawer();
    toast(`Created permission set ${name}`, "ok");
    route();
  };

  function renderDelegations() {
    const rows = S.delegations.map(d => `<tr><td><b>${esc(d.id)}</b></td><td><div class="who">${d.actor ? avatar(d.actor) + esc(d.actor) : "—"}</div></td>` +
      `<td><div class="who">${d.subject ? avatar(d.subject) + esc(d.subject) : "—"}</div></td><td class="muted">${when(d.expires)}</td>` +
      `<td><div class="chips">${Object.entries(d.grants).map(([t, a]) => `<span class="chip">${esc(t)} · ${a.length}</span>`).join("")}</div></td>` +
      `<td><span class="badge ${d.status === "active" ? "ok" : "muted"}">${esc(d.status)}</span></td>` +
      `<td class="actions">${d.status === "active" ? `<button class="btn sm danger" data-act="revokeDlg" data-id="${esc(d.id)}">Revoke</button>` : ""}</td></tr>`).join("");
    shell("Delegations", "", `<div class="page">${pageHead("Delegations",
      "An agent acts for a user: the rules see the user, and the agent may do only what both its own permission sets and the delegation allow.",
      `<button class="btn primary" data-act="newDlg">${icon("plus")}New delegation</button>`)}` +
      `<div class="card"><table class="tbl"><thead><tr><th>Delegation</th><th>Agent</th><th>Acts for</th><th>Expires</th><th>Grants</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></div>`);
  }
  acts.revokeDlg = d => {
    applyBoth(st => { st.delegations.find(x => x.id === d.id).status = "revoked"; });
    recordAdmin("delegation revoke", d.id);
    toast(`Revoked ${d.id}`, "ok");
    route();
  };
  acts.newDlg = () => {
    const agents = S.principals.filter(p => p.kind === "agent"), users = S.principals.filter(p => p.kind === "user");
    openDrawer("New delegation",
      `<label class="field"><span>Id</span><input class="input" id="fDlgId" placeholder="dlg-alice"></label>` +
      `<label class="field"><span>Agent</span><select class="input" id="fDlgActor">${agents.map(p => `<option>${esc(p.id)}</option>`).join("")}</select></label>` +
      `<label class="field"><span>Acts for</span><select class="input" id="fDlgSubject">${users.map(p => `<option>${esc(p.id)}</option>`).join("")}</select></label>` +
      `<label class="field"><span>Valid for</span><select class="input" id="fDlgHours"><option value="1">1 hour</option><option value="24" selected>1 day</option><option value="168">7 days</option></select></label>` +
      `<label class="field"><span>Grants</span><textarea class="input" id="fDlgGrants" data-on-input="checkGrants">storage.object:read,stat,discover;document.version:read-units,discover</textarea>` +
      `<small id="fDlgHint" class="hint-ok">2 resource types, 5 actions</small><small>Format as in fga-admin: <code>type:action,action;type:action</code></small></label>`,
      `<button class="btn" data-act="closeDrawer">Cancel</button><button class="btn primary" data-act="saveDlg">Create</button>`);
  };
  function parseGrants(text) {
    const grants = {};
    for (const part of text.split(";").map(s => s.trim()).filter(Boolean)) {
      const [type, list] = part.split(":");
      if (!S.types[type]) throw new Error(`unknown resource type "${type}"`);
      const actions = splitList(list || "");
      const bad = actions.find(a => !S.types[type].includes(a));
      if (bad) throw new Error(`"${bad}" is not an action of ${type}`);
      if (!actions.length) throw new Error(`${type} has no actions`);
      grants[type] = actions;
    }
    if (!Object.keys(grants).length) throw new Error("no grants");
    return grants;
  }
  acts.checkGrants = (d, el) => {
    const hint = document.getElementById("fDlgHint");
    try {
      const g = parseGrants(el.value);
      hint.className = "hint-ok";
      hint.textContent = `${Object.keys(g).length} resource types, ${Object.values(g).flat().length} actions`;
      el.classList.remove("invalid");
    } catch (e) { hint.className = "hint-bad"; hint.textContent = e.message; el.classList.add("invalid"); }
  };
  acts.saveDlg = () => {
    const id = val("fDlgId").trim();
    if (!/^[a-z0-9][a-z0-9._-]*$/.test(id)) return toast("Give the delegation an id such as dlg-alice", "bad");
    if (S.delegations.some(x => x.id === id)) return toast(`${id} already exists`, "bad");
    let grants;
    try { grants = parseGrants(val("fDlgGrants")); } catch (e) { return toast(e.message, "bad"); }
    const dlg = { id, actor: val("fDlgActor"), subject: val("fDlgSubject"), audience: "local-dev",
      expires: new Date(Date.now() + Number(val("fDlgHours")) * 3600e3).toISOString(), status: "active", grants };
    applyBoth(st => { st.delegations.push(structuredClone(dlg)); });
    recordAdmin("delegation add", id);
    closeDrawer();
    toast(`${dlg.actor} may now act for ${dlg.subject}`, "ok");
    route();
  };

  // ---------------------------------------------------------------- admin: resources

  function renderBuckets() {
    const rows = S.buckets.map(b => `<tr><td><div class="obj">${icon("bucket")}<b>${esc(b.name)}</b></div></td><td>${esc(b.project)}</td>` +
      `<td>${b.mode === "client" ? `<span class="badge accent">${icon("lock", "sm")}client</span>` : `<span class="badge muted">${icon("server", "sm")}server</span>`}</td>` +
      `<td class="num">${S.objects.filter(o => o.bucket === b.name).length}</td></tr>`).join("");
    shell("Buckets", "", `<div class="page">${pageHead("Buckets",
      "Server-encrypted buckets let policy alone decide who reads. In client-encrypted buckets only people the owner shared a key with can decrypt.",
      `<button class="btn primary" data-act="newBucket">${icon("plus")}New bucket</button>`)}` +
      `<div class="card"><table class="tbl"><thead><tr><th>Bucket</th><th>Project</th><th>Encryption</th><th class="num">Objects</th></tr></thead><tbody>${rows}</tbody></table></div></div>`);
  }
  acts.newBucket = () => openDrawer("New bucket",
    `<label class="field"><span>Name</span><input class="input" id="fBucket" placeholder="minutes"></label>` +
    `<label class="field"><span>Project</span><input class="input" id="fProject" placeholder="p1"></label>` +
    `<label class="field"><span>Encryption</span><select class="input" id="fMode"><option value="server">server (policy decides who reads)</option><option value="client">client (owner shares keys)</option></select></label>`,
    `<button class="btn" data-act="closeDrawer">Cancel</button><button class="btn primary" data-act="saveBucket">Create</button>`);
  acts.saveBucket = () => {
    const name = val("fBucket").trim(), project = val("fProject").trim();
    if (!/^[a-z0-9][a-z0-9.-]{1,62}$/.test(name)) return toast("Bucket names use lowercase letters, digits, dots and dashes", "bad");
    if (bucketOf(name)) return toast(`${name} already exists`, "bad");
    if (!project) return toast("Give the bucket a project", "bad");
    applyBoth(st => { st.buckets.push({ name, project, mode: val("fMode") }); });
    recordAdmin("bucket create", name);
    closeDrawer();
    toast(`Created bucket ${name}`, "ok");
    route();
  };

  function renderTools() {
    shell("Tools", "", `<div class="page">${pageHead("Tools", "Registered tools call external destinations for users and agents. A tool runs only once reviewed, and only for those the policy allows.")}` +
      `<div class="grid"><div class="card"><div class="card-head"><h3>Tools</h3></div><table class="tbl"><thead><tr><th>Tool</th><th>Version</th><th>Destination</th><th>Review</th><th></th></tr></thead><tbody>` +
      S.tools.map(t => `<tr><td><b>${esc(t.id)}</b><div class="muted small">${esc(t.description)}</div></td><td>${t.version}</td><td><code>${esc(t.destination)}</code></td>` +
        `<td><span class="badge ${t.reviewed ? "ok" : "warn"}">${t.reviewed ? "reviewed" : "not reviewed"}</span></td>` +
        `<td class="actions">${t.reviewed ? "" : `<button class="btn sm" data-act="reviewTool" data-id="${esc(t.id)}">Mark reviewed</button>`}</td></tr>`).join("") +
      `</tbody></table></div><div class="card"><div class="card-head"><h3>Destinations</h3></div><table class="tbl"><thead><tr><th>Destination</th><th>URL</th><th>Allowed networks</th><th>Status</th></tr></thead><tbody>` +
      S.destinations.map(x => `<tr><td><b>${esc(x.id)}</b></td><td><code>${esc(x.url)}</code></td><td><code>${esc(x.cidrs)}</code></td>` +
        `<td><span class="badge ${x.approved ? "ok" : "warn"}">${x.approved ? "approved" : "pending"}</span></td></tr>`).join("") +
      `</tbody></table></div></div></div>`);
  }
  acts.reviewTool = d => { applyBoth(st => { st.tools.find(t => t.id === d.id).reviewed = true; }); recordAdmin("tool review", d.id); route(); };

  // ---------------------------------------------------------------- admin: policies, audit

  const effectBadge = r => `<span class="badge ${r.effect}">${r.set === "ceiling" ? "ceiling " : ""}${r.effect}</span>`;
  const roleChips = roles => roles.map(x => `<span class="chip">${x === "*" ? "anyone" : esc(x)}</span>`).join("") || '<span class="muted small">no role</span>';
  const policyDirty = () => JSON.stringify(S.rules) !== JSON.stringify(baseline.rules);

  function renderPolicies() {
    const types = [...new Set(S.rules.map(r => r.type))].sort();
    const body = `<div class="page">${pageHead("Policies",
      `The active bundle is epoch ${S.bundle.epoch}, signed by <code>${esc(S.bundle.keyId)}</code>. Rules are edited as a draft in the access graph and signed offline; the publisher key never reaches this console.`,
      `<a class="btn primary" href="#/admin/graph">${icon("graph")}Edit in access graph</a>`)}` +
      (policyDirty() ? `<div class="card card-body insp-note policy">The graph holds unsigned rule changes. Open the access graph and review changes to export the draft.</div>` : "") +
      `<div class="grid">` + types.map(t => {
        const rs = S.rules.filter(r => r.type === t);
        return `<div class="card"><div class="card-head"><div class="type-title"><span class="type-dot"></span><h3>${esc(t)}</h3></div>` +
          `<span class="muted small">${rs.filter(r => r.effect === "allow").length} allow · ${rs.filter(r => r.effect === "deny").length} deny</span>` +
          `<a class="btn sm right" href="#/admin/graph?type=${encodeURIComponent(t)}">${icon("graph", "sm")}Graph</a></div>` +
          rs.map(r => `<div class="rule-row"><div>${effectBadge(r)}</div><div><b>${esc(r.id)}</b><div class="chips">${roleChips(r.roles)}</div></div>` +
            `<div class="chips">${r.actions.map(a => `<span class="chip">${esc(a)}</span>`).join("")}</div><code>${r.when ? esc(r.when) : "always"}</code></div>`).join("") + `</div>`;
      }).join("") + `</div></div>`;
    shell("Policies", "", body);
  }

  function renderAudit() {
    const rows = () => S.audit.filter(e => (auditFilter.decision === "all" || e.decision === auditFilter.decision) &&
      (!auditFilter.q || `${e.actor} ${e.action} ${e.resource} ${e.why}`.toLowerCase().includes(auditFilter.q.toLowerCase())));
    shell("Audit log", "", `<div class="page">${pageHead("Audit log", "Every decision, allowed or denied, with the rule that decided it. fga exports this log as a signed hash chain.")}` +
      `<div class="card"><div class="card-head"><div class="seg">${["all", "allow", "deny"].map(v => `<button class="${auditFilter.decision === v ? "on" : ""}" data-act="auditDecision" data-v="${v}">${{ all: "All", allow: "Allowed", deny: "Denied" }[v]}</button>`).join("")}</div>` +
      `<div class="right"><input class="input" id="auditQ" placeholder="Search who, what or why" value="${esc(auditFilter.q)}" data-on-input="auditSearch" aria-label="Search the audit log"></div></div>` +
      `<div id="auditRows">${auditTable(rows())}</div></div></div>`);
    acts.auditSearch = (d, el) => { auditFilter.q = el.value; document.getElementById("auditRows").innerHTML = auditTable(rows()); };
  }
  acts.auditDecision = d => { auditFilter.decision = d.v; route(); };

  // ---------------------------------------------------------------- admin: access graph

  const PALETTE = [
    ["user", "User", "a person"], ["agent", "Agent", "acts for users"], ["role", "Role", "what rules match on"],
    ["rule", "Rule", "allows or denies actions"], ["perm", "Permission set", "upper bound of actions"], ["dlg", "Delegation", "agent acts for a user"],
  ];
  const SNIPPETS = [
    ["same project", "resource.attributes.project in principal.attributes.projects"],
    ["caller owns it", "resource.attributes.owner == principal.id"],
    ["shared with caller", "has(resource.attributes.shared_with) && principal.id in resource.attributes.shared_with.read"],
    ["below restricted", "resource.attributes.label_rank < 3"],
  ];

  function renderGraph(params) {
    if (params.get("type") && S.types[params.get("type")]) scope = params.get("type");
    inspected = null;
    lastCheck = null;
    const types = Object.keys(S.types).sort();
    const body = `<div class="graph-wrap"><aside class="palette"><h4>Add</h4>` +
      PALETTE.map(([k, name, sub]) => `<button class="pal-item k-${k}" draggable="true" data-kind="${k}" data-act="addNode">` +
        `<span class="sw"></span><span><b>${esc(name)}</b><small>${esc(sub)}</small></span></button>`).join("") +
      `<div class="legend"><h4>How it reads</h4><p>Identities hold <b>roles</b> and <b>permission sets</b>. <b>Rules</b> allow or deny actions to roles, under a condition.</p>` +
      `<p>A request is allowed when a permission set includes the action, a rule allows it, and no rule denies it. Anything else is denied.</p>` +
      `<p>Drag from a node's right-hand dot onto another node to connect them. Select a node or wire and press Delete to remove it.</p></div></aside>` +
      `<section class="canvas-area"><div class="viewport" id="viewport"></div>` +
      `<div class="canvas-bar"><div class="glass scope">Resource type<select data-on-change="scope" aria-label="Resource type">` +
      types.map(t => `<option ${t === scope ? "selected" : ""}>${esc(t)}</option>`).join("") + `</select></div>` +
      `<div class="glass toolgroup"><button class="btn icon" data-act="zoomOut" aria-label="Zoom out">${icon("minus")}</button><span class="zoom" id="zoomLabel">100%</span>` +
      `<button class="btn icon" data-act="zoomIn" aria-label="Zoom in">${icon("plus")}</button><button class="btn icon" data-act="fit" title="Fit to screen" aria-label="Fit to screen">${icon("fit")}</button>` +
      `<button class="btn icon" data-act="relayout" title="Tidy the layout" aria-label="Tidy the layout">${icon("layout")}</button></div>` +
      `<span class="spacer"></span><button class="glass changes-btn" id="changesBtn" data-act="reviewChanges"></button></div>` +
      `<div class="glass checker" id="checker"></div></section><aside class="inspector" id="inspector"></aside></div>`;
    shell("Access graph", "", body, { flush: true, compact: true });
    renderChecker();
    graph = G.mount(document.getElementById("viewport"), {
      state: () => S, scope: () => scope, positions: () => (graphPos[scope] = graphPos[scope] || {}),
      select: sel => { inspected = sel; renderInspector(); },
      canConnect, connect, add: addNode,
      zoomed: k => { const z = document.getElementById("zoomLabel"); if (z) z.textContent = `${Math.round(k * 100)}%`; },
      reserved: () => (document.getElementById("checker") ? document.getElementById("checker").offsetHeight + 28 : 24),
    });
    graph.render({ fit: true });
    renderInspector();
    updateChangesBtn();
    for (const el of document.querySelectorAll(".pal-item")) {
      el.addEventListener("dragstart", e => { e.dataTransfer.setData("application/x-fga-kind", el.dataset.kind); e.dataTransfer.effectAllowed = "copy"; });
    }
  }

  acts.scope = (d, el) => go(`/admin/graph?type=${encodeURIComponent(el.value)}`);
  acts.zoomIn = () => graph.zoom(1.2);
  acts.zoomOut = () => graph.zoom(1 / 1.2);
  acts.fit = () => graph.fit();
  acts.relayout = () => graph.relayout();

  function change(area, text) {
    changes.push({ area, text });
    updateChangesBtn();
  }
  function updateChangesBtn() {
    const b = document.getElementById("changesBtn");
    if (!b) return;
    const dir = changes.filter(c => c.area === "directory").length, pol = changes.filter(c => c.area === "policy").length;
    b.innerHTML = `${icon("check", "sm")}Changes${dir ? ` <span class="badge accent">${dir} directory</span>` : ""}${pol ? ` <span class="badge warn">${pol} policy</span>` : ""}` +
      `${!dir && !pol ? ' <span class="badge muted">none</span>' : ""}`;
  }

  // refresh redraws the graph after a change; a running access check is
  // decided again, so its path shows the effect of the change at once.
  function refresh() {
    graph.render();
    renderInspector();
    if (lastCheck) runCheck(true);
  }

  const PAIRS = {
    "user>role": 1, "agent>role": 1, "user>perm": 1, "agent>perm": 1, "role>rule": 1, "agent>dlg": 1, "dlg>user": 1,
  };
  function canConnect(a, b) { return !!PAIRS[`${a.kind}>${b.kind}`]; }

  function connect(a, b) {
    if (!canConnect(a, b)) {
      return toast("Connect users and agents to roles or permission sets, roles to rules, agents to delegations, and delegations to the user they act for.", "bad");
    }
    switch (`${a.kind}>${b.kind}`) {
      case "user>role": case "agent>role": {
        const p = person(a.ref);
        if (b.ref === "*") return toast("Everyone already matches anyone.", "bad");
        if (p.roles.includes(b.ref)) return toast(`${p.id} already has role ${b.ref}`, "bad");
        p.roles.push(b.ref);
        change("directory", `${p.id}: add role ${b.ref}`);
        break;
      }
      case "user>perm": case "agent>perm": {
        const p = person(a.ref);
        if (p.grants.includes(b.ref)) return toast(`${p.id} already holds ${S.permSets[b.ref].name}`, "bad");
        p.grants.push(b.ref);
        change("directory", `${p.id}: grant ${S.permSets[b.ref].name}`);
        break;
      }
      case "role>rule": {
        const r = S.rules.find(x => x.id === b.ref);
        if (r.roles.includes(a.ref)) return toast(`${r.id} already applies to ${a.title}`, "bad");
        r.roles.push(a.ref);
        change("policy", `rule ${r.id}: applies to ${a.title}`);
        break;
      }
      case "agent>dlg": {
        const d = S.delegations.find(x => x.id === b.ref);
        d.actor = a.ref;
        change("directory", `delegation ${d.id}: agent ${a.ref}`);
        break;
      }
      case "dlg>user": {
        const d = S.delegations.find(x => x.id === a.ref);
        d.subject = b.ref;
        change("directory", `delegation ${d.id}: acts for ${b.ref}`);
        break;
      }
    }
    refresh();
  }

  function removeEdge(e) {
    if (!e) return;
    if (e.implicit) return toast("This link follows from the others and cannot be removed by itself.", "bad");
    const a = graph.node(e.from), b = graph.node(e.to);
    if (b.kind === "role") {
      const p = person(a.ref);
      p.roles = p.roles.filter(x => x !== b.ref);
      change("directory", `${p.id}: remove role ${b.ref}`);
    } else if (b.kind === "perm") {
      const p = person(a.ref);
      p.grants = p.grants.filter(x => x !== b.ref);
      change("directory", `${p.id}: revoke ${S.permSets[b.ref].name}`);
    } else if (b.kind === "rule") {
      const r = S.rules.find(x => x.id === b.ref);
      r.roles = r.roles.filter(x => x !== a.ref);
      change("policy", `rule ${r.id}: no longer applies to ${a.title}`);
      if (!r.roles.length) toast(`${r.id} now applies to no role, so it matches nobody`);
    } else if (b.kind === "dlg") {
      S.delegations.find(x => x.id === b.ref).actor = null;
      change("directory", `delegation ${b.ref}: no agent`);
    } else if (a.kind === "dlg") {
      S.delegations.find(x => x.id === a.ref).subject = null;
      change("directory", `delegation ${a.ref}: acts for nobody`);
    }
    refresh();
  }

  function removeNode(n) {
    switch (n.kind) {
      case "user": case "agent": {
        const p = person(n.ref);
        p.status = p.status === "active" ? "disabled" : "active";
        change("directory", `${p.id}: ${p.status === "active" ? "enable" : "disable"}`);
        break;
      }
      case "role": {
        if (n.ref === "*") return toast("anyone is built in", "bad");
        S.principals.forEach(p => { if (p.roles.includes(n.ref)) { p.roles = p.roles.filter(x => x !== n.ref); change("directory", `${p.id}: remove role ${n.ref}`); } });
        S.rules.forEach(r => { if (r.roles.includes(n.ref)) { r.roles = r.roles.filter(x => x !== n.ref); change("policy", `rule ${r.id}: no longer applies to ${n.ref}`); } });
        S.extraRoles = S.extraRoles.filter(x => x !== n.ref);
        break;
      }
      case "rule":
        S.rules = S.rules.filter(r => r.id !== n.ref);
        change("policy", `remove rule ${n.ref}`);
        break;
      case "perm": {
        if (S.permSets[n.ref].builtin) return toast("Built-in presets cannot be deleted", "bad");
        S.principals.forEach(p => { p.grants = p.grants.filter(g => g !== n.ref); });
        change("directory", `delete permission set ${S.permSets[n.ref].name}`);
        delete S.permSets[n.ref];
        break;
      }
      case "dlg":
        S.delegations.find(x => x.id === n.ref).status = "revoked";
        change("directory", `revoke delegation ${n.ref}`);
        break;
      default:
        return toast("Resource types come from fga's registry and cannot be removed", "bad");
    }
    refresh();
  }

  function addNode(kind, at) {
    const point = at || (c => ({ x: Math.round(c.x - 116), y: Math.round(c.y - 40) }))(graph.centre());
    let id;
    switch (kind) {
      case "user": case "agent": {
        const pid = unique(kind === "agent" ? "new-agent" : "new-user", x => person(x));
        S.principals.push({ id: pid, kind, roles: [], attributes: kind === "user" ? { projects: [] } : {}, grants: [], status: "active" });
        change("directory", `add ${kind} ${pid}`);
        id = "p:" + pid;
        break;
      }
      case "role": {
        const r = unique("new-role", x => allRoles().includes(x));
        S.extraRoles.push(r);
        id = "r:" + r;
        break;
      }
      case "rule": {
        const rid = unique("new-rule", x => S.rules.some(r => r.id === x));
        S.rules.push({ set: "business", type: scope, id: rid, effect: "allow", actions: [], roles: [], when: "" });
        change("policy", `add rule ${rid} on ${scope}`);
        id = "rule:" + rid;
        break;
      }
      case "perm": {
        const sid = unique("custom-set", x => S.permSets[x]);
        S.permSets[sid] = { name: sid, caps: { [scope]: [] } };
        change("directory", `add permission set ${sid}`);
        id = "perm:" + sid;
        break;
      }
      case "dlg": {
        const did = unique("dlg-new", x => S.delegations.some(d => d.id === x));
        S.delegations.push({ id: did, actor: null, subject: null, audience: "local-dev", expires: new Date(Date.now() + 864e5).toISOString(),
          status: "active", grants: { [scope]: [] } });
        change("directory", `add delegation ${did}`);
        id = "d:" + did;
        break;
      }
    }
    graphPos[scope][id] = point;
    graph.render();
    graph.select({ type: "node", id });
  }
  acts.addNode = d => addNode(d.kind);

  // ---- inspector

  function renderInspector() {
    const el = document.getElementById("inspector");
    if (!el) return;
    const sel = inspected;
    if (!sel) {
      el.innerHTML = `<h4>Inspector</h4><div class="insp-help"><p>Select a node or a wire to see and edit it.</p><ol>` +
        `<li>Pick a <b>resource type</b> at the top: the graph shows what bears on it.</li>` +
        `<li>Wire a user to a <b>role</b> or a <b>permission set</b>, and a role to a <b>rule</b>.</li>` +
        `<li>Use <b>Check access</b> below to see a request decided: its path lights up.</li>` +
        `<li><b>Changes</b> collects your edits: directory changes go to the admin API, rule changes into a draft bundle you sign offline.</li></ol></div>`;
      return;
    }
    if (sel.type === "edge") return renderEdgeInspector(el, graph.edge(sel.id));
    const n = graph.node(sel.id);
    if (!n) { el.innerHTML = ""; return; }
    const head = (kindClass, kindText, title) => `<div class="insp-title ${kindClass}"><span class="sw"></span><div><small>${esc(kindText)}</small><h3>${esc(title)}</h3></div></div>`;
    const dirNote = `<p class="insp-note">Directory change: applied through fga's admin API when you apply changes.</p>`;
    const polNote = `<p class="insp-note policy">Policy change: goes into a draft bundle that you sign offline.</p>`;
    let html = "";
    switch (n.kind) {
      case "user": case "agent": {
        const p = person(n.ref);
        html = head("k-" + n.kind, n.kind === "agent" ? "Agent" : "User", p.id) + dirNote +
          `<dl class="kv"><dt>Status</dt><dd><span class="badge ${p.status === "active" ? "ok" : "muted"}">${esc(p.status)}</span></dd></dl>` +
          `<div class="field"><span>Roles</span><div class="chips">${p.roles.map(r => `<span class="chip on">${esc(r)}<button class="x" data-act="pRole" data-op="rm" data-r="${esc(r)}" aria-label="Remove ${esc(r)}">×</button></span>`).join("") || '<span class="muted small">none</span>'}</div>` +
          `<select class="input" data-on-change="pRoleAdd" aria-label="Add a role"><option value="">Add a role…</option>${allRoles().filter(r => !p.roles.includes(r)).map(r => `<option>${esc(r)}</option>`).join("")}</select></div>` +
          `<label class="field"><span>Projects</span><input class="input" value="${esc((p.attributes.projects || []).join(", "))}" data-on-change="pProjects"><small>Rules compare these with a resource's project.</small></label>` +
          `<div class="field"><span>Permission sets</span>${Object.entries(S.permSets).map(([id, s]) => `<label class="check"><input type="checkbox" data-on-change="pGrant" data-set="${esc(id)}" ${p.grants.includes(id) ? "checked" : ""}>${esc(s.name)}</label>`).join("")}</div>` +
          `<button class="btn ${p.status === "active" ? "danger" : ""}" data-act="delSelected">${p.status === "active" ? "Disable identity" : "Enable identity"}</button>`;
        break;
      }
      case "role": {
        const members = S.principals.filter(p => n.ref === "*" ? p.status === "active" : p.roles.includes(n.ref));
        const rules = S.rules.filter(r => r.roles.includes(n.ref));
        html = head("k-role", "Role", n.title) +
          (n.ref === "*" ? `<p class="insp-note">Every active identity matches <b>anyone</b>. Rules for it usually carry a condition, such as ownership.</p>`
            : `<label class="field"><span>Name</span><input class="input" value="${esc(n.ref)}" data-on-change="roleName"><small>Renames it on every identity and rule.</small></label>`) +
          `<div class="field"><span>Members</span><div class="chips">${members.map(p => `<span class="chip">${esc(p.id)}</span>`).join("") || '<span class="muted small">nobody yet: wire a user to it</span>'}</div></div>` +
          `<div class="field"><span>Rules (all types)</span>${rules.map(r => `<div class="list-row">${effectBadge(r)}<span class="grow">${esc(r.id)}<div class="muted small">${esc(r.type)}</div></span></div>`).join("") || '<span class="muted small">none: this role grants nothing</span>'}</div>` +
          (n.ref === "*" ? "" : `<button class="btn danger" data-act="delSelected">${icon("trash", "sm")}Delete role</button>`);
        break;
      }
      case "rule": {
        const r = S.rules.find(x => x.id === n.ref), err = P.check(r.when);
        html = head(r.effect === "deny" ? "k-deny" : "k-allow", `${r.set === "ceiling" ? "Ceiling " : ""}${r.effect} rule · ${r.type}`, r.id) + polNote +
          `<label class="field"><span>Id</span><input class="input" value="${esc(r.id)}" data-on-change="ruleId"></label>` +
          `<div class="field"><span>Effect</span><div class="seg">${["allow", "deny"].map(v => `<button class="${r.effect === v ? `on ${v}` : ""}" data-act="ruleEffect" data-v="${v}">${v}</button>`).join("")}</div>` +
          `<small>A deny always wins over an allow.</small></div>` +
          `<div class="field"><span>Roles</span><div class="chips">${r.roles.map(x => `<span class="chip on">${x === "*" ? "anyone" : esc(x)}<button class="x" data-act="ruleRole" data-r="${esc(x)}" aria-label="Remove">×</button></span>`).join("") || '<span class="muted small">none: matches nobody</span>'}</div>` +
          `<select class="input" data-on-change="ruleRoleAdd" aria-label="Add a role"><option value="">Add a role…</option><option value="*">anyone</option>${allRoles().filter(x => !r.roles.includes(x)).map(x => `<option>${esc(x)}</option>`).join("")}</select></div>` +
          `<div class="field"><span>Actions</span><div class="chips">${S.types[r.type].map(a => `<button class="chip ${r.actions.includes(a) ? "on" : ""}" data-act="ruleAction" data-a="${esc(a)}">${esc(a)}</button>`).join("")}</div></div>` +
          `<label class="field"><span>Condition</span><textarea class="input${err ? " invalid" : ""}" id="ruleCond" data-on-input="ruleCondCheck" data-on-change="ruleCond" placeholder="always">${esc(r.when)}</textarea>` +
          `<small id="ruleCondHint" class="${err ? "hint-bad" : "hint-ok"}">${err ? esc(err) : r.when ? "valid condition" : "empty: the rule always matches"}</small>` +
          `<div class="snippets">${SNIPPETS.map(([label], i) => `<button class="chip" data-act="ruleSnippet" data-i="${i}">+ ${esc(label)}</button>`).join("")}</div></label>` +
          `<label class="field"><span>Set</span><select class="input" data-on-change="ruleSet"><option value="business" ${r.set !== "ceiling" ? "selected" : ""}>business</option>` +
          `<option value="ceiling" ${r.set === "ceiling" ? "selected" : ""}>ceiling (checked first, denies only)</option></select></label>` +
          `<button class="btn danger" data-act="delSelected">${icon("trash", "sm")}Delete rule</button>`;
        break;
      }
      case "perm": {
        const s = S.permSets[n.ref], holders = S.principals.filter(p => p.grants.includes(n.ref));
        html = head("k-perm", `Permission set · ${scope}`, s.name) + dirNote +
          (s.builtin ? `<p class="muted small">Built-in preset: its actions are fixed.</p>` : `<label class="field"><span>Name</span><input class="input" value="${esc(s.name)}" data-on-change="permName"></label>`) +
          `<div class="field"><span>Actions on ${esc(scope)}</span><div class="chips">${S.types[scope].map(a => s.builtin
            ? ((s.caps[scope] || []).includes(a) ? `<span class="chip on">${esc(a)}</span>` : "")
            : `<button class="chip ${(s.caps[scope] || []).includes(a) ? "on" : ""}" data-act="permAction" data-a="${esc(a)}">${esc(a)}</button>`).join("")}</div></div>` +
          `<div class="field"><span>Held by</span><div class="chips">${holders.map(p => `<span class="chip">${esc(p.id)}</span>`).join("") || '<span class="muted small">nobody yet</span>'}</div></div>` +
          (s.builtin ? "" : `<button class="btn danger" data-act="delSelected">${icon("trash", "sm")}Delete set</button>`);
        break;
      }
      case "dlg": {
        const d = S.delegations.find(x => x.id === n.ref);
        const opts = (list, cur) => `<option value="">—</option>` + list.map(p => `<option ${p.id === cur ? "selected" : ""}>${esc(p.id)}</option>`).join("");
        html = head("k-dlg", "Delegation", d.id) + dirNote +
          `<label class="field"><span>Agent</span><select class="input" data-on-change="dlgActor">${opts(S.principals.filter(p => p.kind === "agent"), d.actor)}</select></label>` +
          `<label class="field"><span>Acts for</span><select class="input" data-on-change="dlgSubject">${opts(S.principals.filter(p => p.kind === "user"), d.subject)}</select></label>` +
          `<div class="field"><span>Grants on ${esc(scope)}</span><div class="chips">${S.types[scope].map(a => `<button class="chip ${(d.grants[scope] || []).includes(a) ? "on" : ""}" data-act="dlgAction" data-a="${esc(a)}">${esc(a)}</button>`).join("")}</div>` +
          `<small>The agent gets no more than this, and no more than its own permission sets.</small></div>` +
          `<dl class="kv"><dt>Expires</dt><dd>${when(d.expires)}</dd><dt>Audience</dt><dd><code>${esc(d.audience)}</code></dd></dl>` +
          `<button class="btn danger" data-act="delSelected">Revoke delegation</button>`;
        break;
      }
      case "type": {
        const rs = S.rules.filter(r => r.type === scope);
        html = head("k-type", "Resource type", scope) +
          `<dl class="kv"><dt>Rules</dt><dd>${rs.filter(r => r.effect === "allow").length} allow, ${rs.filter(r => r.effect === "deny").length} deny</dd></dl>` +
          `<div class="field"><span>Actions</span><div class="chips">${S.types[scope].map(a => `<span class="chip">${esc(a)}</span>`).join("")}</div></div>` +
          `<p class="insp-note">Resource types and their actions come from fga's registry. Use Check access below to see a request on ${esc(scope)} decided.</p>`;
        break;
      }
    }
    el.innerHTML = html;
  }

  const RELATION = { "user>role": "has role", "agent>role": "has role", "user>perm": "holds", "agent>perm": "holds", "role>rule": "is matched by",
    "rule>type": "decides actions on", "perm>type": "bounds actions on", "agent>dlg": "is the agent of", "dlg>user": "acts for" };
  function renderEdgeInspector(el, e) {
    if (!e) { el.innerHTML = ""; return; }
    const a = graph.node(e.from), b = graph.node(e.to);
    el.innerHTML = `<div class="insp-title"><div><small class="muted">Link</small><h3>${esc(a.title)} <span class="arrow">→</span> ${esc(b.title)}</h3></div></div>` +
      `<p>${esc(a.title)} <b>${esc(RELATION[`${a.kind}>${b.kind}`] || "links to")}</b> ${esc(b.title)}.</p>` +
      (e.implicit ? `<p class="insp-note">This link follows from the others (everyone matches anyone; a rule and a permission set always belong to their type). It cannot be removed by itself.</p>`
        : `<p class="insp-note ${a.kind === "role" ? "policy" : ""}">${a.kind === "role" ? "Removing it is a policy change." : "Removing it is a directory change."}</p>` +
          `<button class="btn danger" data-act="delSelected">${icon("trash", "sm")}Remove link</button>`);
  }

  const inspectedNode = () => inspected && inspected.type === "node" ? graph.node(inspected.id) : null;
  const inspectedRule = () => { const n = inspectedNode(); return n && S.rules.find(r => r.id === n.ref); };

  acts.delSelected = () => {
    if (!inspected) return;
    if (inspected.type === "edge") removeEdge(graph.edge(inspected.id));
    else removeNode(graph.node(inspected.id));
  };
  acts.pRole = d => { const p = person(inspectedNode().ref); p.roles = p.roles.filter(r => r !== d.r); change("directory", `${p.id}: remove role ${d.r}`); refresh(); };
  acts.pRoleAdd = (d, el) => { if (!el.value) return; const p = person(inspectedNode().ref); p.roles.push(el.value); change("directory", `${p.id}: add role ${el.value}`); refresh(); };
  acts.pProjects = (d, el) => { const p = person(inspectedNode().ref); p.attributes = { ...p.attributes, projects: splitList(el.value) }; change("directory", `${p.id}: projects ${splitList(el.value).join(", ") || "none"}`); refresh(); };
  acts.pGrant = (d, el) => {
    const p = person(inspectedNode().ref);
    p.grants = el.checked ? [...p.grants, d.set] : p.grants.filter(g => g !== d.set);
    change("directory", `${p.id}: ${el.checked ? "grant" : "revoke"} ${S.permSets[d.set].name}`);
    refresh();
  };
  acts.roleName = (d, el) => {
    const from = inspectedNode().ref, to = el.value.trim();
    if (!/^[a-z][a-z0-9_-]*$/.test(to)) { el.value = from; return toast("Role names use lowercase letters, digits, dashes or underscores", "bad"); }
    if (to === from) return;
    if (allRoles().includes(to)) { el.value = from; return toast(`Role ${to} exists already`, "bad"); }
    S.principals.forEach(p => { if (p.roles.includes(from)) { p.roles = p.roles.map(r => (r === from ? to : r)); change("directory", `${p.id}: role ${from} renamed ${to}`); } });
    S.rules.forEach(r => { if (r.roles.includes(from)) { r.roles = r.roles.map(x => (x === from ? to : x)); change("policy", `rule ${r.id}: role ${from} renamed ${to}`); } });
    S.extraRoles = S.extraRoles.map(r => (r === from ? to : r));
    moveNode("r:" + from, "r:" + to);
  };
  // moveNode keeps a renamed node where it was and keeps it selected.
  function moveNode(from, to) {
    for (const p of Object.values(graphPos)) if (p[from]) { p[to] = p[from]; delete p[from]; }
    graph.render();
    graph.select({ type: "node", id: to });
    if (lastCheck) runCheck(true);
  }
  acts.ruleId = (d, el) => {
    const r = inspectedRule(), to = el.value.trim();
    if (!/^[a-z0-9][a-z0-9-]*$/.test(to)) { el.value = r.id; return toast("Rule ids use lowercase letters, digits and dashes", "bad"); }
    if (to === r.id) return;
    if (S.rules.some(x => x.id === to)) { el.value = r.id; return toast(`A rule ${to} exists already`, "bad"); }
    change("policy", `rule ${r.id} renamed ${to}`);
    const from = r.id;
    r.id = to;
    moveNode("rule:" + from, "rule:" + to);
  };
  acts.ruleEffect = d => { const r = inspectedRule(); if (r.effect === d.v) return; r.effect = d.v; change("policy", `rule ${r.id}: ${d.v}`); refresh(); };
  acts.ruleRole = d => { const r = inspectedRule(); r.roles = r.roles.filter(x => x !== d.r); change("policy", `rule ${r.id}: no longer applies to ${d.r === "*" ? "anyone" : d.r}`); refresh(); };
  acts.ruleRoleAdd = (d, el) => { if (!el.value) return; const r = inspectedRule(); r.roles.push(el.value); change("policy", `rule ${r.id}: applies to ${el.value === "*" ? "anyone" : el.value}`); refresh(); };
  acts.ruleAction = d => {
    const r = inspectedRule(), on = r.actions.includes(d.a);
    r.actions = on ? r.actions.filter(a => a !== d.a) : [...r.actions, d.a];
    change("policy", `rule ${r.id}: ${on ? "drop" : "add"} action ${d.a}`);
    refresh();
  };
  acts.ruleCondCheck = (d, el) => {
    const err = P.check(el.value), hint = document.getElementById("ruleCondHint");
    el.classList.toggle("invalid", !!err);
    hint.className = err ? "hint-bad" : "hint-ok";
    hint.textContent = err || (el.value.trim() ? "valid condition" : "empty: the rule always matches");
  };
  acts.ruleCond = (d, el) => {
    const r = inspectedRule(), text = el.value.trim();
    if (P.check(text)) return toast("The condition is not valid; it was not saved", "bad");
    if (text === r.when) return;
    r.when = text;
    change("policy", `rule ${r.id}: condition ${text || "always"}`);
    refresh();
  };
  acts.ruleSnippet = d => {
    const r = inspectedRule(), s = SNIPPETS[Number(d.i)][1];
    r.when = r.when ? `${r.when} && ${s}` : s;
    change("policy", `rule ${r.id}: condition ${r.when}`);
    refresh();
  };
  acts.ruleSet = (d, el) => { const r = inspectedRule(); r.set = el.value; if (r.set === "ceiling") r.effect = "deny"; change("policy", `rule ${r.id}: ${el.value} set`); refresh(); };
  acts.permName = (d, el) => { const s = S.permSets[inspectedNode().ref]; if (!el.value.trim()) return; s.name = el.value.trim(); change("directory", `permission set renamed ${s.name}`); refresh(); };
  acts.permAction = d => {
    const s = S.permSets[inspectedNode().ref], cur = s.caps[scope] || [], on = cur.includes(d.a);
    s.caps[scope] = on ? cur.filter(a => a !== d.a) : [...cur, d.a];
    change("directory", `${s.name}: ${on ? "drop" : "add"} ${d.a} on ${scope}`);
    refresh();
  };
  acts.dlgActor = (d, el) => { const x = S.delegations.find(y => y.id === inspectedNode().ref); x.actor = el.value || null; change("directory", `delegation ${x.id}: agent ${el.value || "none"}`); refresh(); };
  acts.dlgSubject = (d, el) => { const x = S.delegations.find(y => y.id === inspectedNode().ref); x.subject = el.value || null; change("directory", `delegation ${x.id}: acts for ${el.value || "nobody"}`); refresh(); };
  acts.dlgAction = d => {
    const x = S.delegations.find(y => y.id === inspectedNode().ref), cur = x.grants[scope] || [], on = cur.includes(d.a);
    x.grants[scope] = on ? cur.filter(a => a !== d.a) : [...cur, d.a];
    change("directory", `delegation ${x.id}: ${on ? "drop" : "add"} ${d.a} on ${scope}`);
    refresh();
  };

  // ---- access check

  function resourcesFor(type) {
    const objs = kind => S.objects.filter(o => o.kind === kind).map(o => ({ label: `${o.bucket}/${o.key}`, res: objRes(o) }));
    switch (type) {
      case "storage.object": return objs("object");
      case "document.version": return objs("document");
      case "document.derived": return objs("derived");
      case "storage.bucket": return S.buckets.map(b => ({ label: `bucket ${b.name} (${b.project})`, res: bucketRes(b) }));
      default: return (S.examples[type] || [{ id: "example", attributes: {} }]).map(x => ({ label: x.id, res: { type, id: x.id, attributes: x.attributes } }));
    }
  }

  function renderChecker() {
    const el = document.getElementById("checker");
    if (!el) return;
    const actions = S.types[scope], resources = resourcesFor(scope);
    if (!actions.includes(ck.action)) ck.action = actions[0];
    if (ck.res >= resources.length) ck.res = 0;
    const who = S.principals.map(p => `<option value="${esc(p.id)}" ${ck.who === p.id ? "selected" : ""}>${esc(p.id)}${p.kind === "agent" ? " (agent)" : ""}</option>`).join("") +
      S.delegations.filter(d => d.status === "active" && d.actor && d.subject).map(d => `<option value="dlg:${esc(d.id)}" ${ck.who === `dlg:${d.id}` ? "selected" : ""}>${esc(d.actor)} for ${esc(d.subject)} (${esc(d.id)})</option>`).join("");
    el.innerHTML = `<div class="checker-row"><span class="title">${icon("play", "sm")}Check access</span>` +
      `<select data-on-change="ckSet" data-k="who" aria-label="Who">${who}</select>` +
      `<select data-on-change="ckSet" data-k="action" aria-label="Action">${actions.map(a => `<option ${a === ck.action ? "selected" : ""}>${esc(a)}</option>`).join("")}</select>` +
      `<select data-on-change="ckSet" data-k="res" aria-label="Resource">${resources.map((r, i) => `<option value="${i}" ${i === ck.res ? "selected" : ""}>${esc(r.label)}</option>`).join("")}</select>` +
      `<button class="btn primary sm" data-act="runCheck">Check</button>${lastCheck ? `<button class="btn ghost sm" data-act="clearCheck">Clear</button>` : ""}<span class="grow"></span></div>` +
      `<div id="verdict">${lastCheck ? verdictHTML(lastCheck) : `<div class="verdict muted small">Pick who, what and on which resource. The path the decision takes lights up in the graph.</div>`}</div>`;
  }
  acts.ckSet = (d, el) => { ck[d.k] = d.k === "res" ? Number(el.value) : el.value; if (lastCheck) runCheck(true); };

  function verdictHTML(res) {
    return `<div class="verdict"><span class="big ${res.allowed ? "allow" : "deny"}">${res.allowed ? "ALLOWED" : "DENIED"}</span><ul class="trace">` +
      res.trace.map(t => `<li class="${t.ok ? "ok" : "no"}">${icon(t.ok ? "check" : "x")}<span>${esc(t.text)}</span></li>`).join("") + `</ul></div>`;
  }

  function runCheck(quiet) {
    const r = resourcesFor(scope)[ck.res];
    let res, path;
    if (ck.who.startsWith("dlg:")) {
      const d = S.delegations.find(x => x.id === ck.who.slice(4));
      if (!d || !d.actor || !d.subject) { lastCheck = null; graph.highlight(null); renderChecker(); return; }
      res = decideFor(d.id, ck.action, r.res);
      path = pathFor(res, d.subject, { agent: d.actor, dlg: d.id });
    } else {
      if (!person(ck.who)) ck.who = S.principals[0].id;
      res = decide(ck.who, ck.action, r.res);
      path = pathFor(res, ck.who);
    }
    lastCheck = res;
    graph.highlight(path);
    renderChecker();
    if (!quiet) graph.fit(0.4, path.nodes);
  }
  acts.runCheck = () => runCheck(false);
  acts.clearCheck = () => { lastCheck = null; graph.highlight(null); renderChecker(); };

  // pathFor lists the nodes and wires a decision went through.
  function pathFor(res, pid, via) {
    const nodes = new Set(), edges = new Set(), t = "t:" + scope, p = "p:" + pid;
    const link = (a, b) => { nodes.add(a); nodes.add(b); edges.add(`${a}->${b}`); };
    nodes.add(p);
    nodes.add(t);
    const holderId = via ? via.agent : pid;
    if (via) { link("p:" + via.agent, "d:" + via.dlg); link("d:" + via.dlg, p); }
    for (const g of person(holderId).grants) {
      if (((S.permSets[g] || { caps: {} }).caps[scope] || []).includes(ck.action)) { link("p:" + holderId, "perm:" + g); link("perm:" + g, t); }
    }
    if (res.rule) {
      const sp = person(pid), roles = res.rule.roles.includes("*") ? ["*"] : res.rule.roles.filter(x => sp.roles.includes(x));
      roles.forEach(x => { link(p, "r:" + x); link("r:" + x, "rule:" + res.rule.id); });
      link("rule:" + res.rule.id, t);
    } else if (res.stage === "default") {
      person(pid).roles.forEach(x => link(p, "r:" + x));
    }
    return { nodes, edges, tone: res.allowed ? "allow" : "deny" };
  }

  // ---- changes

  acts.reviewChanges = () => {
    const dir = changes.filter(c => c.area === "directory"), pol = changes.filter(c => c.area === "policy");
    const list = items => `<ul class="change-list">${items.map(c => `<li>${icon("arrow", "sm")}<span>${esc(c.text)}</span></li>`).join("")}</ul>`;
    openDrawer("Review changes",
      `<h4>Directory · ${dir.length}</h4>` + (dir.length ? `<p class="muted small">Applied through fga's admin API, each change audited.</p>${list(dir)}` +
        `<button class="btn primary" data-act="applyDirectory">Apply directory changes</button>` : `<p class="muted small">No directory changes.</p>`) +
      `<h4 class="spaced-top">Policy draft · ${pol.length}</h4>` + (pol.length ? `<p class="muted small">Rules live in the signed bundle. Export the draft, sign it where the publisher key is kept, ` +
        `then restart fga-decision with the new bundle:</p>${list(pol)}<div class="preview">fga policy sign -key publisher.key -key-id ${esc(S.bundle.keyId)} -epoch ${S.bundle.epoch + 1} bundle</div>` +
        `<div class="btn-row spaced-top"><button class="btn primary" data-act="exportDraft">${icon("download")}Export draft bundle</button></div>` : `<p class="muted small">No policy changes.</p>`),
      changes.length ? `<button class="btn danger" data-act="discardAll">Discard all changes</button>` : "");
  };
  acts.applyDirectory = () => {
    for (const k of ["principals", "permSets", "delegations", "extraRoles"]) baseline[k] = structuredClone(S[k]);
    const n = changes.filter(c => c.area === "directory").length;
    changes.filter(c => c.area === "directory").forEach(c => recordAdmin("graph change", c.text));
    changes = changes.filter(c => c.area !== "directory");
    closeDrawer();
    updateChangesBtn();
    toast(`Applied ${n} directory ${n === 1 ? "change" : "changes"} through the admin API (mockup: nothing sent)`, "ok");
  };
  acts.exportDraft = () => {
    const byType = {};
    for (const r of S.rules) {
      const key = `${r.set}:${r.type}`;
      byType[key] = byType[key] || { format: "fga.policy/v1", set: r.set, resource: r.type, scope: "", rules: [] };
      byType[key].rules.push({ id: r.id, effect: r.effect, actions: r.actions, roles: r.roles, ...(r.when ? { when: r.when } : {}) });
    }
    const draft = { format: "fga.policy-draft/v1", tenant: S.tenant, base_epoch: S.bundle.epoch, epoch: S.bundle.epoch + 1,
      changes: changes.filter(c => c.area === "policy").map(c => c.text), policies: Object.values(byType) };
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(draft, null, 2)], { type: "application/json" }));
    a.download = `fga-policy-draft-epoch-${draft.epoch}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast("Draft exported. Sign it offline, then restart fga-decision to activate it.", "ok");
  };
  acts.discardAll = () => {
    const audit = S.audit, objects = S.objects, approvals = S.approvals;
    S = structuredClone(baseline);
    Object.assign(S, { audit, objects, approvals });
    changes = [];
    closeDrawer();
    route();
    toast("Discarded all changes", "ok");
  };

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
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    if ((e.key === "Delete" || e.key === "Backspace") && graph && inspected && !typing && !document.getElementById("drawer")) {
      e.preventDefault();
      acts.delSelected();
    }
  });

  try {
    const t = localStorage.getItem("fga-console-theme");
    if (t) document.documentElement.dataset.theme = t;
    const u = sessionStorage.getItem("fga-console-user");
    if (u && (u === "admin" || person(u))) me = { id: u, admin: u === "admin" };
  } catch { /* storage unavailable: start signed out, in the system theme */ }
  window.addEventListener("hashchange", route);
  route();
})();

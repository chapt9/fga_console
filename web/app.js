// The fga console's pages. Every list, file and decision on them comes from
// fga through the console server's /api, with the signed-in person's own
// pass: the pages never judge access themselves, and show what fga answers.
"use strict";

(() => {
  const W = window.FGA_WORDS;
  const app = document.getElementById("app");
  const acts = {};
  let session = null;   // what /api/session answered
  let spaces = [];      // the spaces fga lets the person list
  let entries = [];     // the open space's files: { key, size, created }
  let more = false;     // fga has more files than were loaded
  let filesQ = "";

  // ---------------------------------------------------------------- helpers

  const ICONS = {
    mark: '<path d="M12 3l7 3v6c0 4.4-3 7.4-7 9-4-1.6-7-4.6-7-9V6z"/><path d="M9 12l2 2 4-4"/>',
    files: '<path d="M4 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/>',
    folder: '<path d="M4 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/>',
    inbox: '<path d="M4 13l2.2-7h11.6L20 13v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/><path d="M4 13h5l1 2h4l1-2h5"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c1.9.8 3.1 2.5 3.5 5.2"/>',
    bucket: '<rect x="3" y="5" width="18" height="6" rx="1.5"/><rect x="3" y="13" width="18" height="6" rx="1.5"/><path d="M7 8h.01M7 16h.01"/>',
    lock: '<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    logout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 8l-4 4 4 4M6 12h10"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
    upload: '<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>',
    share: '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.3 10.8l7.4-3.6M8.3 13.2l7.4 3.6"/>',
    tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
    file: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4"/>',
    doc: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M10 12h5M10 16h3"/>',
    pdf: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4"/><path d="M9.5 17v-4h1.5a1.2 1.2 0 0 1 0 2.4H9.5"/>',
    sheet: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 10h16M4 15h16M10 4v16"/>',
    slides: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M12 16v4M8 20h8"/>',
    image: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5-8 8"/>',
    archive: '<rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4"/>',
    video: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3"/>',
    code: '<path d="M8 8l-4 4 4 4M16 8l4 4-4 4"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    chevron: '<path d="M9 6l6 6-6 6"/>',
    more: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    warn: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17h.01"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    home: '<path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1z"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4.4 4.2-6.5 8-6.5s7 2.1 8 6.5"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l8-8M16 7l3 3"/>',
    bot: '<rect x="5" y="8" width="14" height="11" rx="3"/><path d="M12 4v4M9 13h.01M15 13h.01M9.5 16.5h5"/>',
    policy: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M10 12h5M10 16h5"/>',
    audit: '<path d="M8 4h8M8 4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2"/><path d="M9 11l2 2 4-4M9 17h6"/>',
    server: '<rect x="4" y="4" width="16" height="7" rx="1.5"/><rect x="4" y="13" width="16" height="7" rx="1.5"/><path d="M8 7.5h.01M8 16.5h.01"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    back: '<path d="M15 6l-6 6 6 6"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
    tech: '<path d="M8 8l-4 4 4 4M16 8l4 4-4 4M13.5 6l-3 12"/>',
  };
  const icon = (n, cls = "") => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ""}</svg>`;
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const hue = id => [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 8;
  const displayName = id => String(id).split(".").map(W.cap).join(" ");
  const avatar = (id, cls = "") => `<span class="avatar c${hue(id)} ${cls}" title="${esc(displayName(id))}">${esc(String(id).split(".").map(s => s[0]).join("").slice(0, 2))}</span>`;
  const when = iso => new Date(iso).toLocaleString([], { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const day = iso => new Date(iso).toLocaleDateString([], { day: "numeric", month: "short" });
  const bytes = n => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : n < 1073741824 ? `${(n / 1048576).toFixed(1)} MB` : `${(n / 1073741824).toFixed(1)} GB`);
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many || W.plural(one)}`;
  const val = id => { const el = document.getElementById(id); return el ? el.value : ""; };
  const baseName = key => key.split("/").pop();
  const folderOf = key => key.includes("/") ? key.slice(0, key.lastIndexOf("/")) : "";
  const go = path => { if (location.hash.slice(1) === path) route(); else location.hash = path; };
  const params = () => new URLSearchParams((location.hash.split("?")[1]) || "");
  const spaceOf = name => spaces.find(s => s.name === name);
  const e2e = name => (spaceOf(name) || {}).encryption === "client";
  const fileIcon = key => { const k = W.fileKind(key); return `<span class="fk fk-${esc(k.ext || "file")}">${icon(k.icon)}</span>`; };

  function toast(text, tone = "") {
    const t = document.createElement("div");
    t.className = `toast ${tone}`;
    t.innerHTML = `${icon(tone === "bad" ? "x" : "check")}<span>${esc(text)}</span>`;
    document.getElementById("toasts").appendChild(t);
    setTimeout(() => t.remove(), 5200);
  }

  // ---------------------------------------------------------------- the console's API

  // fga answers "not found" both for what does not exist and for what the
  // person may not see, so neither leaks; the message says both.
  const ERRORS = {
    NOT_FOUND: "Not found, or you may not do this",
    UNAUTHENTICATED: "Your session ended. Sign in again",
    CONFLICT: "It changed in the meantime, or it exists already",
    PRECONDITION_FAILED: "A file with this name exists already",
    ENCRYPTION_MODE: "This space is end-to-end encrypted: use the fga program on your computer",
    APPROVAL_REQUIRED: "This needs an approval: a request was sent",
    INVALID_REQUEST: "fga did not accept this request",
    TOO_LARGE: "The file is too large",
    UNAVAILABLE: "fga can't be reached right now",
    OVERLOADED: "fga is busy. Try again in a moment",
    CROSS_SITE: "Refused: the request did not come from this console",
    UNKNOWN_PERSON: "That person can't sign in here",
    NO_CONSOLE_ACCESS: "fga doesn't let you use this console",
  };
  const plainError = code => ERRORS[code] || `fga refused (${code || "error"})`;

  async function api(method, path, body, opts = {}) {
    const init = { method, credentials: "same-origin", headers: {} };
    if (method !== "GET") init.headers["X-Fga-Console"] = "1";
    if (body instanceof Blob) { init.body = body; Object.assign(init.headers, opts.headers || {}); }
    else if (body !== undefined) { init.body = JSON.stringify(body); init.headers["Content-Type"] = "application/json"; }
    let resp;
    try { resp = await fetch(path, init); } catch { return { ok: false, status: 0, error: "UNAVAILABLE" }; }
    if (opts.raw && resp.ok) return { ok: true, status: resp.status, resp };
    let data = null;
    if ((resp.headers.get("Content-Type") || "").startsWith("application/json")) {
      try { data = await resp.json(); } catch { data = null; }
    }
    if (resp.status === 401 && path !== "/api/session" && session && session.signed_in) {
      session = { ...session, signed_in: false, person: "" };
      go("/signin");
    }
    const error = resp.ok && resp.status !== 202 ? "" : (data && (data.error || data.status)) || "UNAVAILABLE";
    return { ok: resp.ok && resp.status !== 202, status: resp.status, data, error };
  }

  // ---------------------------------------------------------------- shell

  // routes maps each page to its renderer; admin.js adds the
  // administrator's pages, which only people fga accepts as administrators
  // reach (and the admin API refuses everyone else in any case).
  // A page shows only to people holding its right, as fga reports their
  // rights; fga still decides every request made from it.
  const routes = { "/files": renderFiles, "/approvals": renderApprovals, "/none": renderNoPages };
  const needs = { "/files": "open", "/approvals": "approve" };
  const can = right => !!(session && session.access && (session.rights || []).includes(right));
  const home = () => (session && session.admin ? "/admin" : can("open") ? "/files" : can("approve") ? "/approvals" : "/none");
  function route() {
    const path = (location.hash.slice(1) || home()).split("?")[0];
    closeDrawer();
    if (!session || !session.signed_in) { if (path !== "/signin") return go("/signin"); return renderSignIn(); }
    if (path === "/signin") return go(home());
    const page = routes[path];
    if (!page || (path.startsWith("/admin") && !session.admin) || (needs[path] && !can(needs[path]))) return go(home());
    page(params());
  }

  function shell(title, sub, body) {
    if (!session || !session.signed_in) return;
    const cur = location.hash.slice(1).split("?")[0];
    const nav = (p, ic, label) => `<a href="#${p}" class="${cur === p ? "active" : ""}">${icon(ic)}<span class="lbl">${esc(label)}</span></a>`;
    app.innerHTML = `<div class="shell"><aside class="sidebar"><div class="brand"><span class="brand-mark">${icon("mark")}</span>` +
      `<span>fga console<small>${esc(session.organisation)}</small></span></div><nav class="nav">` +
      (session.admin ? `<div class="nav-section">Administration</div>${nav("/admin", "home", "Overview")}${nav("/admin/people", "users", "People")}` +
        `${nav("/admin/rights", "key", "Rights")}${nav("/admin/agents", "bot", "AI agents")}${nav("/admin/spaces", "bucket", "Spaces")}` +
        `${nav("/admin/rules", "policy", "Rules")}${nav("/admin/audit", "audit", "Audit log")}${nav("/admin/servers", "server", "Servers")}` : "") +
      (can("open") || can("approve") ? `<div class="nav-section">Workspace</div>` : "") +
      (can("open") ? nav("/files", "files", "Files") : "") + (can("approve") ? nav("/approvals", "inbox", "Approvals") : "") + `</nav>` +
      `<div class="me">${avatar(session.person)}<div><b>${esc(session.name && session.name !== session.person ? session.name : displayName(session.person))}</b>` +
      `<span class="muted">${esc(session.admin ? "Administrator" : session.person)}</span></div>` +
      `<button class="btn ghost icon sm" data-act="signOut" title="Sign out" aria-label="Sign out">${icon("logout")}</button></div></aside>` +
      `<main class="main"><header class="topbar"><h1>${esc(title)}</h1>${sub ? `<span class="sub">${sub}</span>` : ""}<span class="spacer"></span>` +
      (session.dev ? `<span class="pill" title="People sign in by picking a name; for development only">Development sign-in</span>` : "") +
      `<button class="btn ghost icon" data-act="theme" aria-label="Switch light or dark">${icon(isDark() ? "sun" : "moon")}</button></header>` +
      `<div class="content">${body}</div></main></div>`;
  }
  const pageHead = (title, text, buttons = "") =>
    `<div class="page-head"><div><h2>${esc(title)}</h2>${text ? `<p>${text}</p>` : ""}</div>${buttons ? `<div class="btn-row">${buttons}</div>` : ""}</div>`;
  const loading = text => `<div class="card"><div class="empty">${esc(text)}</div></div>`;

  function openDrawer(title, body, foot = "", opts = {}) {
    closeDrawer();
    const d = document.createElement("div");
    d.id = "drawer";
    d.innerHTML = `<div class="scrim" data-act="closeDrawer"></div><aside class="drawer${opts.wide ? " wide" : ""}" role="dialog" aria-modal="true" aria-label="${esc(title)}">` +
      `<div class="drawer-head"><h3>${esc(title)}</h3><button class="btn ghost icon sm" data-act="closeDrawer" aria-label="Close">${icon("x")}</button></div>` +
      `<div class="drawer-body">${body}</div>${foot ? `<div class="drawer-foot">${foot}</div>` : ""}</aside>`;
    document.body.appendChild(d);
  }
  function closeDrawer() { const d = document.getElementById("drawer"); if (d) d.remove(); }
  acts.closeDrawer = closeDrawer;
  let onConfirm = null;
  function confirmBox(title, html, label, fn) {
    onConfirm = fn;
    openDrawer(title, html, `<button class="btn" data-act="closeDrawer">Cancel</button><button class="btn danger-solid" data-act="confirmYes">${esc(label)}</button>`);
  }
  acts.confirmYes = () => { const fn = onConfirm; onConfirm = null; closeDrawer(); if (fn) fn(); };

  // ---------------------------------------------------------------- sign-in

  function renderSignIn() {
    const people = (session && session.people) || [];
    const brand = `<div class="brand"><span class="brand-mark">${icon("mark")}</span><span>fga console<small>${esc(session ? session.organisation : "")}</small></span></div>`;
    if (session && !session.dev) {
      app.innerHTML = `<div class="login"><div class="login-card">${brand}<h1>Sign in</h1>` +
        `<p class="lead">Sign in with your organisation's login. fga then decides everything you see and do.</p>` +
        `<a class="btn primary" href="${esc(session.login || "/auth/login")}">${icon("lock")}Sign in with ${esc(session.organisation)}</a>` +
        `<div class="login-foot">${icon("lock")}<span>Your password goes only to your organisation's login, never to this console.</span></div></div></div>`;
      return;
    }
    app.innerHTML = `<div class="login"><div class="login-card"><div class="brand"><span class="brand-mark">${icon("mark")}</span>` +
      `<span>fga console<small>${esc(session ? session.organisation : "")}</small></span></div><h1>Sign in</h1>` +
      `<p class="lead">Development sign-in: choose who you are. fga then decides everything you see and do.</p><div class="tiles">` +
      people.map(p => `<button class="tile" data-act="signIn" data-id="${esc(p)}">${avatar(p, "lg")}<span><b>${esc(displayName(p))}</b>` +
        `<span class="muted">${esc(p)}</span></span></button>`).join("") + `</div>` +
      `<div class="login-foot">${icon("lock")}<span>The console gets a short-lived pass for the person you pick, as the demo's <code>as</code> command does. ` +
      `In production you sign in with your organisation's login, and the console never sees a password.</span></div></div></div>`;
  }
  acts.signIn = async d => {
    const r = await api("POST", "/api/signin", { person: d.id });
    if (!r.ok) return toast(plainError(r.error), "bad");
    await start();
    go(home());
  };
  acts.signOut = async () => {
    const r = await api("POST", "/api/signout");
    if (r.ok && r.data && r.data.logout_url) { location.href = r.data.logout_url; return; }
    session = await loadSession();
    spaces = [];
    go("/signin");
  };

  // ---------------------------------------------------------------- files

  async function loadSpaces() {
    const r = await api("GET", "/api/spaces");
    spaces = r.ok ? r.data.spaces : [];
    return r;
  }

  // loadEntries reads a space's files from fga, page by page, up to 5000.
  async function loadEntries(space) {
    entries = [];
    more = false;
    let continuation = "";
    for (let i = 0; i < 10; i++) {
      const q = new URLSearchParams({ space });
      if (continuation) q.set("continuation", continuation);
      const r = await api("GET", `/api/files?${q}`);
      if (!r.ok) return r;
      entries.push(...(r.data.entries || []).map(e => ({ key: e.key, size: e.ciphertext_length, created: e.created_at })));
      continuation = r.data.continuation || "";
      if (!continuation) return r;
    }
    more = true;
    return { ok: true };
  }

  function folderView(list, folder) {
    const prefix = folder ? folder + "/" : "", folders = new Map(), files = [];
    for (const e of list) {
      if (!e.key.startsWith(prefix)) continue;
      const rest = e.key.slice(prefix.length);
      if (rest.includes("/")) { const f = prefix + rest.split("/")[0]; folders.set(f, (folders.get(f) || 0) + 1); } else files.push(e);
    }
    return { folders: [...folders.entries()].sort((a, b) => a[0].localeCompare(b[0])), files: files.sort((a, b) => a.key.localeCompare(b.key)) };
  }

  async function renderFiles() {
    shell("Files", "", `<div class="page wide">${loading("Asking fga which spaces you may see…")}</div>`);
    const r = await loadSpaces();
    if (!r.ok) return shell("Files", "", `<div class="page">${pageHead("Files")}${loading(plainError(r.error))}</div>`);
    const p = params(), pick = spaceOf(p.get("b")) ? p.get("b") : spaces[0] && spaces[0].name;
    if (!pick) {
      return shell("Files", "", `<div class="page">${pageHead("Files", "", `<button class="btn" data-act="openShared">${icon("share")}Open a shared file</button>`)}` +
        `<div class="card"><div class="empty">${icon("files")}<div>fga lets you list none of this console's spaces. ` +
        `If someone shared a file with you, open it by its name with Open a shared file.</div></div></div></div>`);
    }
    const folder = p.get("f") || "";
    const head = () => pageHead("Files", "The spaces fga lets you list, and their files. Everything you do here is decided by fga.",
      `<button class="btn ghost" data-act="openShared">Open a shared file</button>` +
      (can("share") ? `<button class="btn ghost" data-act="myBatches">${icon("users")}Access you gave</button>` +
        `<button class="btn" data-act="giveAccess" data-b="${esc(pick)}">${icon("share")}Give access</button>` : "") +
      (e2e(pick) || !can("upload") ? "" : `<button class="btn primary" data-act="upload" data-b="${esc(pick)}" data-f="${esc(folder)}">${icon("upload")}Upload</button>`));
    const spaceList = `<nav class="card spaces" aria-label="Spaces"><div class="spaces-head">Spaces</div>` + spaces.map(s =>
      `<a class="space-row ${s.name === pick ? "on" : ""}" href="#/files?b=${encodeURIComponent(s.name)}">${icon(s.encryption === "client" ? "lock" : "bucket")}` +
      `<span class="grow"><b>${esc(s.name)}</b><small>${esc(s.encryption ? W.encryption(s.encryption).name : "")}</small></span></a>`).join("") + `</nav>`;
    shell("Files", `Space ${esc(pick)}`, `<div class="page wide">${head()}<div class="files-layout">${spaceList}` +
      `<section class="card browser"><div class="browser-bar"><div class="crumbs">${crumbs(pick, folder)}</div>` +
      `<input class="input search" placeholder="Search in ${esc(pick)}" value="${esc(filesQ)}" data-on-input="filesSearch" aria-label="Search files"></div>` +
      `<div id="fileRows">${loading("Loading from fga…")}</div></section></div></div>`);
    const lr = await loadEntries(pick);
    const rows = document.getElementById("fileRows");
    if (!rows) return;
    rows.innerHTML = lr.ok ? fileRows(pick, folder) : `<div class="empty">${esc(plainError(lr.error))}</div>`;
    acts.filesSearch = (d, el) => { filesQ = el.value; document.getElementById("fileRows").innerHTML = fileRows(pick, folder); };
  }

  function crumbs(space, folder) {
    const parts = folder ? folder.split("/") : [];
    const link = (f, text) => `<a href="#/files?b=${encodeURIComponent(space)}${f ? `&f=${encodeURIComponent(f)}` : ""}">${esc(text)}</a>`;
    return [link("", space), ...parts.map((p, i) => i === parts.length - 1 ? `<b>${esc(p)}</b>` : link(parts.slice(0, i + 1).join("/"), p))]
      .join(`<span class="sep">${icon("chevron", "sm")}</span>`);
  }

  function fileRows(space, folder) {
    const q = filesQ.trim().toLowerCase();
    const view = q ? { folders: [], files: entries.filter(e => e.key.toLowerCase().includes(q)).sort((a, b) => a.key.localeCompare(b.key)) } : folderView(entries, folder);
    const note = more ? `<p class="muted small pad">Showing the first ${entries.length} files fga listed.</p>` : "";
    const lock = e2e(space) ? `<p class="insp-note">${icon("lock", "xs")} This space is end-to-end encrypted: fga keeps only scrambled data. ` +
      `Open and upload its files with the fga program on your computer, for example <code>fga get -bucket ${esc(space)} -key &lt;name&gt; -out &lt;file&gt;</code>.</p>` : "";
    if (!view.folders.length && !view.files.length) return lock + `<div class="empty">${icon("files")}<div>${q ? "Nothing matches." : "Nothing here that fga lets you see."}</div></div>`;
    return lock + `<table class="tbl files"><thead><tr><th>Name</th><th class="num hide-sm" title="Size as fga stores it, encrypted">Stored size</th><th class="hide-sm">Added</th><th></th></tr></thead><tbody>` +
      view.folders.map(([f, n]) => `<tr class="clickable" data-act="openFolder" data-b="${esc(space)}" data-f="${esc(f)}"><td colspan="4"><div class="obj">` +
        `<span class="fk fk-folder">${icon("folder")}</span><div><b>${esc(f.split("/").pop())}</b><div class="muted small">${plural(n, "file")}</div></div></div></td></tr>`).join("") +
      view.files.map(e => `<tr><td><div class="obj">${fileIcon(e.key)}<div class="min0"><b class="fname">${esc(q ? e.key : baseName(e.key))}</b>` +
        `<div class="muted small">${esc(W.fileKind(e.key).name)}</div></div></div></td>` +
        `<td class="num hide-sm nowrap">${bytes(e.size)}</td><td class="muted hide-sm nowrap">${esc(when(e.created))}</td><td class="actions">` +
        (e2e(space) ? "" : `<button class="btn sm" data-act="download" data-b="${esc(space)}" data-k="${esc(e.key)}">${icon("download", "sm")}Download</button>`) +
        (e2e(space) || !can("share") ? "" : `<button class="btn sm icon ghost" data-act="giveAccess" data-b="${esc(space)}" data-k="${esc(e.key)}" aria-label="Give access" title="Give access">${icon("share")}</button>`) +
        `<button class="btn sm icon ghost" data-act="details" data-b="${esc(space)}" data-k="${esc(e.key)}" aria-label="Details and access" title="Details and access">${icon("more")}</button>` +
        `</td></tr>`).join("") + `</tbody></table>${note}`;
  }
  acts.openFolder = d => go(`/files?b=${encodeURIComponent(d.b)}&f=${encodeURIComponent(d.f)}`);

  // download asks fga for the file through the console; the browser then
  // saves it. A refusal shows fga's reason instead.
  acts.download = async d => {
    const r = await api("GET", `/api/files/content?${new URLSearchParams({ space: d.b, key: d.k })}`, undefined, { raw: true });
    if (!r.ok) return toast(plainError(r.error), "bad");
    const blob = await r.resp.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = baseName(d.k);
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  acts.details = async d => {
    const q = new URLSearchParams({ space: d.b, key: d.k });
    openDrawer(baseName(d.k), loading("Asking fga…"));
    const [info, shares] = await Promise.all([api("GET", `/api/files/info?${q}`), api("GET", `/api/shares?${q}`)]);
    const v = info.ok ? info.data : null;
    const e = entries.find(x => x.key === d.k) || {};
    const shareList = shares.ok ? (shares.data.grants || []) : null;
    openDrawer(baseName(d.k),
      `<div class="file-head">${fileIcon(d.k)}<div><b>${esc(baseName(d.k))}</b><div class="muted small">${esc(d.b)}/${esc(folderOf(d.k))}</div></div></div>` +
      `<dl class="kv"><dt>Kind</dt><dd>${esc(W.fileKind(d.k).name)}</dd>` +
      (v ? `<dt>Size</dt><dd>${bytes(v.length || v.ciphertext_length || e.size || 0)}</dd><dt>Added</dt><dd>${esc(when(v.created_at))}</dd>` +
        `<dt>Encryption</dt><dd>${esc(v.encryption ? W.encryption(v.encryption).name : "")}</dd>`
        : `<dt>Details</dt><dd class="muted">${esc(plainError(info.error))}</dd>`) + `</dl>` +
      `<h4 class="spaced-top">Shared with</h4>` +
      (shareList === null ? `<p class="muted small">Only people who may share this file see whom it is shared with.</p>`
        : shareList.length ? `<div class="card flat">${shareList.map(g => `<div class="list-row">${avatar(g.grantee)}<div class="grow"><b>${esc(displayName(g.grantee))}</b>` +
          `<div class="chips">${(g.actions || []).map(a => `<span class="chip">${esc(W.action(a, "storage.object").label)}</span>`).join("")}</div>` +
          `<div class="muted small">until ${esc(day(g.expires_at))} · given by ${esc(displayName(g.grantor))}</div></div>` +
          (can("share") ? `<button class="btn sm danger" data-act="unshare" data-b="${esc(d.b)}" data-k="${esc(d.k)}" data-id="${esc(g.grantee)}">Remove</button>` : "") + `</div>`).join("")}</div>`
        : `<p class="muted small">Not shared with anyone.</p>`) +
      (e2e(d.b) || !(v && v.length < 65536) ? "" : `<h4 class="spaced-top">Preview</h4><div id="preview"><button class="btn sm" data-act="preview" data-b="${esc(d.b)}" data-k="${esc(d.k)}">${icon("eye", "sm")}Show as text</button></div>`),
      (can("delete") ? `<button class="btn danger" data-act="deleteFile" data-b="${esc(d.b)}" data-k="${esc(d.k)}">${icon("trash", "sm")}Delete</button>` : "") +
      (can("sensitivity") ? `<button class="btn" data-act="label" data-b="${esc(d.b)}" data-k="${esc(d.k)}">${icon("tag", "sm")}Sensitivity</button>` : "") +
      `<span class="spacer"></span>` +
      (can("share") ? `<button class="btn primary" data-act="giveAccess" data-b="${esc(d.b)}" data-k="${esc(d.k)}">${icon("share")}Give access</button>` : ""));
  };

  // openShared reaches a file shared with the person in a space they may
  // not list: fga has no "shared with me" list yet, so they name it.
  acts.openShared = () => openDrawer("Open a shared file",
    `<p class="muted small">Someone shared a single file with you in a space you can't list. Give its space and name, as they told you.</p>` +
    `<label class="field"><span>Space</span><input class="input" id="osSpace" placeholder="shared" autocomplete="off"></label>` +
    `<label class="field"><span>Name</span><input class="input" id="osKey" placeholder="q4/plan.txt" autocomplete="off"></label>`,
    `<button class="btn" data-act="closeDrawer">Cancel</button><button class="btn" data-act="osDetails">Details</button>` +
    `<button class="btn primary" data-act="osDownload">${icon("download")}Download</button>`);
  const osTarget = () => ({ b: val("osSpace").trim(), k: val("osKey").trim() });
  acts.osDownload = () => { const t = osTarget(); if (!t.b || !t.k) return toast("Give the space and the name", "bad"); acts.download(t); };
  acts.osDetails = () => { const t = osTarget(); if (!t.b || !t.k) return toast("Give the space and the name", "bad"); acts.details(t); };

  // preview shows a small file as plain text, never as a page.
  acts.preview = async d => {
    const r = await api("GET", `/api/files/content?${new URLSearchParams({ space: d.b, key: d.k })}`, undefined, { raw: true });
    const el = document.getElementById("preview");
    if (!el) return;
    if (!r.ok) { el.innerHTML = `<p class="muted small">${esc(plainError(r.error))}</p>`; return; }
    const pre = document.createElement("div");
    pre.className = "preview";
    pre.textContent = await r.resp.text();
    el.replaceChildren(pre);
  };

  acts.unshare = async d => {
    const r = await api("DELETE", `/api/shares?${new URLSearchParams({ space: d.b, key: d.k, grantee: d.id })}`);
    if (!r.ok) return toast(plainError(r.error), "bad");
    toast(`${displayName(d.id)} no longer has shared access to ${baseName(d.k)}`, "ok");
    acts.details(d);
  };

  acts.deleteFile = d => confirmBox(`Delete ${baseName(d.k)}?`, `<p>fga deletes the file for everyone, if you may. Older versions stay for those who may see history.</p>`, "Delete", async () => {
    const r = await api("DELETE", `/api/files?${new URLSearchParams({ space: d.b, key: d.k })}`);
    if (!r.ok) return toast(plainError(r.error), "bad");
    toast(`Deleted ${baseName(d.k)}`, "ok");
    route();
  });

  acts.label = d => openDrawer(`Sensitivity of ${baseName(d.k)}`,
    `<p class="muted small">From least to most sensitive: Public, Internal, Confidential, Restricted. Raising it happens at once if you may; lowering it may need an approval.</p>` +
    `<div class="field">${["public", "internal", "confidential", "restricted"].map(l => `<label class="check big"><input type="radio" name="fLabel" value="${l}">` +
      `<span><b>${esc(W.label(l).name)}</b><small>${esc(W.label(l).help)}</small></span></label>`).join("")}</div>`,
    `<button class="btn" data-act="closeDrawer">Cancel</button><button class="btn primary" data-act="doLabel" data-b="${esc(d.b)}" data-k="${esc(d.k)}">Apply</button>`);
  acts.doLabel = async d => {
    const sel = document.querySelector("#drawer input[name=fLabel]:checked");
    if (!sel) return toast("Choose a sensitivity", "bad");
    const r = await api("PUT", `/api/files/label?${new URLSearchParams({ space: d.b, key: d.k })}`, { label: sel.value });
    closeDrawer();
    if (r.status === 202) return toast("Lowering it needs an approval: the request went to those who may approve", "ok");
    if (!r.ok) return toast(plainError(r.error), "bad");
    toast(`${baseName(d.k)} is now ${W.label(sel.value).name}`, "ok");
  };

  acts.upload = d => openDrawer(`Upload to ${d.b}`,
    `<label class="field"><span>File</span><input class="input" type="file" id="fFile" data-on-change="uploadPicked"></label>` +
    `<label class="field"><span>Name in the space</span><input class="input" id="fKey" value="${esc(d.f ? d.f + "/" : "")}" placeholder="q4/minutes.docx"></label>` +
    `<label class="field"><span>Sensitivity</span><select class="input" id="fUpLabel"><option value="">The space's default</option>` +
    ["public", "internal", "confidential", "restricted"].map(l => `<option value="${l}">${esc(W.label(l).name)}</option>`).join("") + `</select></label>` +
    `<p class="muted small">fga encrypts the file as it arrives. An existing file is never overwritten.</p>`,
    `<button class="btn" data-act="closeDrawer">Cancel</button><button class="btn primary" id="upGo" data-act="doUpload" data-b="${esc(d.b)}">${icon("upload")}Upload</button>`);
  acts.uploadPicked = (d, el) => {
    const f = el.files[0], key = document.getElementById("fKey");
    if (f && key && (key.value === "" || key.value.endsWith("/"))) key.value += f.name.replace(/\s+/g, "-");
  };
  acts.doUpload = async d => {
    const f = document.getElementById("fFile").files[0], key = val("fKey").trim();
    if (!f) return toast("Choose a file", "bad");
    if (!key || key.endsWith("/") || /^\//.test(key)) return toast("Give the file a name, such as q4/minutes.docx", "bad");
    const btn = document.getElementById("upGo");
    btn.disabled = true;
    btn.textContent = "Uploading…";
    const headers = val("fUpLabel") ? { "X-Fga-Label": val("fUpLabel") } : {};
    const r = await api("PUT", `/api/files?${new URLSearchParams({ space: d.b, key })}`, f, { headers });
    closeDrawer();
    if (r.status === 202) return toast("This upload needs an approval: the request went to those who may approve", "ok");
    if (!r.ok) return toast(plainError(r.error), "bad");
    toast(`Uploaded ${baseName(key)}; fga encrypted it`, "ok");
    route();
  };

  // ---------------------------------------------------------------- give access

  const SHARE_OPTS = [["discover", "Find it", "See that it exists, in lists and searches"], ["stat", "See details", "See its size and dates"],
    ["read", "Open it", "Open and download it"]];
  let ga = null;
  document.addEventListener("click", e => { if (ga && e.target.matches && e.target.matches("#gaList input[data-k]")) ga.shift = e.shiftKey; }, true);

  acts.giveAccess = async d => {
    const others = (session.people || []).filter(p => p !== session.person);
    const shareable = spaces.filter(s => s.encryption !== "client");
    if (!shareable.length) return toast("End-to-end encrypted spaces are shared with the fga program, on your computer", "bad");
    const space = shareable.some(s => s.name === d.b) ? d.b : shareable[0].name;
    ga = { space, folder: d.k ? folderOf(d.k) : "", q: "", kind: "", sel: new Map(),
      who: "", opts: new Set(["discover", "stat", "read"]), until: 7, visible: [], last: null, shift: false, others, cache: {} };
    if (d.k && space === d.b) ga.sel.set(`${d.b}|${d.k}`, { space: d.b, key: d.k });
    if (space === d.b) ga.cache[d.b] = entries.slice();
    openDrawer("Give access", `<div id="ga"></div>`, `<span class="grow muted small" id="gaFoot"></span><button class="btn" data-act="closeDrawer">Cancel</button>` +
      `<button class="btn primary" id="gaGo" data-act="gaGive">${icon("share")}Give access</button>`, { wide: true });
    await gaLoad();
    gaRender();
  };
  async function gaLoad() {
    if (ga.cache[ga.space]) return;
    const save = entries.slice(), saveMore = more;
    await loadEntries(ga.space);
    ga.cache[ga.space] = entries.slice();
    entries = save;
    more = saveMore;
  }
  const stepHead = (n, title, right = "") => `<div class="step-head"><span class="step-num">${n}</span><h4>${esc(title)}</h4>${right ? `<span class="right">${right}</span>` : ""}</div>`;

  function gaRender(only) {
    const parts = { gaWho, gaFiles, gaWhat, gaUntil };
    if (!only) document.getElementById("ga").innerHTML = Object.keys(parts).map(id => `<section class="step" id="${id}"></section>`).join("") + `<section class="step hidden" id="gaResult"></section>`;
    for (const id of only || Object.keys(parts)) { const el = document.getElementById(id); if (el) el.innerHTML = parts[id](); }
    const go2 = document.getElementById("gaGo"), foot = document.getElementById("gaFoot");
    const missing = !ga.who.trim() ? "Name a person" : !ga.sel.size ? "Choose at least one file" : !ga.opts.size ? "Choose what they may do" : "";
    if (go2) go2.disabled = !!missing;
    if (foot) foot.textContent = missing;
  }
  function gaWho() {
    return stepHead(1, "Who gets access") + `<input class="input" id="gaWhoInput" list="gaPeople" placeholder="Their sign-in name, such as carl" value="${esc(ga.who)}" data-on-input="gaWho" autocomplete="off">` +
      `<datalist id="gaPeople">${ga.others.map(p => `<option value="${esc(p)}">${esc(displayName(p))}</option>`).join("")}</datalist>` +
      `<p class="muted small">fga checks that this person exists and may be given access.</p>`;
  }
  acts.gaWho = (d, el) => { ga.who = el.value.trim(); gaRender([]); };
  const gaPool = () => (ga.cache[ga.space] || []);
  const gaFiltering = () => !!(ga.q.trim() || ga.kind || ga.daysAgo);
  const gaMatch = e => (!ga.q.trim() || e.key.toLowerCase().includes(ga.q.trim().toLowerCase())) && (!ga.kind || W.fileKind(e.key).name === ga.kind) &&
    (!ga.daysAgo || Date.parse(e.created) > Date.now() - ga.daysAgo * 864e5);
  const fid = (space, key) => `${space}|${key}`;
  function gaCount() {
    const n = ga.sel.size, s = new Set([...ga.sel.values()].map(x => x.space)).size;
    return n ? `${plural(n, "file")}${s > 1 ? ` in ${s} spaces` : ""} chosen` : "none chosen";
  }
  function gaFiles() {
    const kinds = [...new Set(gaPool().map(e => W.fileKind(e.key).name))].sort();
    const sel = (k, opts, all) => `<select class="input" data-on-change="gaFilter" data-k="${k}" aria-label="${esc(all)}"><option value="">${esc(all)}</option>` +
      opts.map(([v, t]) => `<option value="${esc(v)}" ${String(ga[k] || "") === String(v) ? "selected" : ""}>${esc(t)}</option>`).join("") + `</select>`;
    return stepHead(2, "Which files", `<span class="badge ${ga.sel.size ? "accent" : "muted"}">${gaCount()}</span>`) +
      `<div class="browse-bar"><select class="input" data-on-change="gaSpace" aria-label="Space">${spaces.filter(s => s.encryption !== "client")
        .map(s => `<option value="${esc(s.name)}" ${s.name === ga.space ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</select>` +
      `<input class="input" id="gaQ" placeholder="Search by name" value="${esc(ga.q)}" data-on-input="gaQ" autocomplete="off" aria-label="Search files"></div>` +
      `<div class="filter-row">${sel("kind", kinds.map(k => [k, k]), "Any kind")}${sel("daysAgo", [["7", "Added in 7 days"], ["30", "Added in 30 days"], ["90", "Added in 90 days"]], "Added any time")}</div>` +
      `<div id="gaList">${gaList()}</div>` +
      (ga.sel.size ? `<details class="chosen"><summary>Show the chosen files</summary><div class="chosen-list">${[...ga.sel.entries()].slice(0, 60).map(([id, x]) =>
        `<div class="mini-row">${fileIcon(x.key)}<span class="grow min0"><span class="fname">${esc(x.space)}/${esc(x.key)}</span></span>` +
        `<button class="btn sm ghost icon" data-act="gaUnpick" data-id="${esc(id)}" aria-label="Unchoose">${icon("x", "sm")}</button></div>`).join("")}</div></details>` +
        `<button class="btn sm ghost" data-act="gaClear">Clear the choice</button>` : "");
  }
  function gaList() {
    const pool = gaPool(), filtering = gaFiltering();
    const view = filtering ? { folders: [], files: pool.filter(gaMatch).sort((a, b) => a.key.localeCompare(b.key)) } : folderView(pool, ga.folder);
    ga.visible = view.files.map(e => e.key);
    const unpicked = view.files.filter(e => !ga.sel.has(fid(ga.space, e.key)));
    const crumbsHtml = filtering ? `<span class="muted small">${plural(view.files.length, "file matches", "files match")} in ${esc(ga.space)}</span>`
      : [`<button class="linkish" data-act="gaFolder" data-f="">${esc(ga.space)}</button>`, ...(ga.folder ? ga.folder.split("/") : []).map((p, i, arr) =>
        i === arr.length - 1 ? `<b>${esc(p)}</b>` : `<button class="linkish" data-act="gaFolder" data-f="${esc(arr.slice(0, i + 1).join("/"))}">${esc(p)}</button>`)]
        .join(`<span class="sep">${icon("chevron", "sm")}</span>`);
    const bulk = filtering ? (view.files.length ? `<button class="btn sm" data-act="gaPickAll" ${unpicked.length ? "" : "disabled"}>${icon("check", "sm")}Choose all ${view.files.length}</button>` : "")
      : (!ga.folder && pool.length ? `<button class="btn sm ghost" data-act="gaPickSpace">Choose all ${pool.length} in the space</button>` : "");
    const rows = view.folders.map(([f, n]) => {
      const inside = pool.filter(e => e.key.startsWith(f + "/")), all = inside.length && inside.every(e => ga.sel.has(fid(ga.space, e.key)));
      return `<div class="brow"><label class="check"><input type="checkbox" data-on-change="gaFolderPick" data-f="${esc(f)}" ${all ? "checked" : ""} aria-label="Every file in ${esc(f)}"></label>` +
        `<span class="fk fk-folder">${icon("folder")}</span><button class="linkish grow" data-act="gaFolder" data-f="${esc(f)}"><b>${esc(f.split("/").pop())}</b> <span class="muted small">${plural(n, "file")}</span></button>` +
        `<button class="btn sm ghost icon" data-act="gaFolder" data-f="${esc(f)}" aria-label="Open folder">${icon("chevron")}</button></div>`;
    }).join("") + view.files.map(e => `<label class="brow"><input type="checkbox" data-on-change="gaPick" data-k="${esc(e.key)}" ${ga.sel.has(fid(ga.space, e.key)) ? "checked" : ""}>` +
      `${fileIcon(e.key)}<span class="grow min0"><b class="fname">${esc(filtering ? e.key : baseName(e.key))}</b><small>${esc(W.fileKind(e.key).name)} · ${esc(day(e.created))}</small></span></label>`).join("");
    return `<div class="list-head"><div class="crumbs small-crumbs">${crumbsHtml}</div><div class="btn-row">${bulk}</div></div>` +
      `<div class="browse">${rows || `<div class="muted small pad">Nothing here.</div>`}</div>` +
      `<p class="muted small">Ticking a folder chooses the files in it and its subfolders now; files added later are not included. Shift-click to choose a range. ` +
      `fga decides for each file whether you may share it.</p>`;
  }
  const gaRefresh = () => gaRender(["gaFiles"]);
  const pick = (key, on) => { const id = fid(ga.space, key); if (on) ga.sel.set(id, { space: ga.space, key }); else ga.sel.delete(id); };
  acts.gaSpace = async (d, el) => { ga.space = el.value; ga.folder = ""; ga.q = ""; ga.last = null; await gaLoad(); gaRefresh(); };
  acts.gaFolder = d => { ga.folder = d.f; ga.q = ""; ga.last = null; gaRefresh(); };
  acts.gaFilter = (d, el) => { ga[d.k] = el.value; ga.last = null; gaRefresh(); };
  acts.gaQ = (d, el) => { ga.q = el.value; ga.last = null; document.getElementById("gaList").innerHTML = gaList(); };
  acts.gaPick = (d, el) => {
    const i = ga.visible.indexOf(d.k);
    if (ga.shift && ga.last !== null && i >= 0) ga.visible.slice(Math.min(i, ga.last), Math.max(i, ga.last) + 1).forEach(k => pick(k, el.checked));
    else pick(d.k, el.checked);
    ga.last = i;
    ga.shift = false;
    gaRender(["gaFiles"]);
  };
  acts.gaPickAll = () => { gaPool().filter(gaMatch).forEach(e => pick(e.key, true)); gaRefresh(); };
  acts.gaPickSpace = () => { gaPool().forEach(e => pick(e.key, true)); gaRefresh(); };
  acts.gaFolderPick = (d, el) => { gaPool().filter(e => e.key.startsWith(d.f + "/")).forEach(e => pick(e.key, el.checked)); gaRefresh(); };
  acts.gaUnpick = d => { ga.sel.delete(d.id); gaRefresh(); };
  acts.gaClear = () => { ga.sel.clear(); gaRefresh(); };

  function gaWhat() {
    return stepHead(3, "What they may do") + SHARE_OPTS.map(([a, label, help]) => `<label class="check big"><input type="checkbox" data-on-change="gaOpt" data-a="${a}" ${ga.opts.has(a) ? "checked" : ""}>` +
      `<span><b>${esc(label)}</b><small>${esc(help)}</small></span></label>`).join("") +
      `<div class="not-possible"><b>Not possible for a single file</b><div class="chips">${["Upload", "Replace", "Delete", "Change sensitivity", "Approve requests"]
        .map(x => `<span class="chip off">${x}</span>`).join("")}</div><small>These come with rights and roles, which an administrator gives.</small></div>`;
  }
  acts.gaOpt = (d, el) => { if (el.checked) ga.opts.add(d.a); else ga.opts.delete(d.a); gaRender([]); };
  function gaUntil() {
    return stepHead(4, "Until") + `<div class="seg">${[1, 7, 30, 90].map(n => `<button class="${ga.until === n ? "on" : ""}" data-act="gaDays" data-n="${n}">${n === 1 ? "1 day" : `${n} days`}</button>`).join("")}</div>` +
      `<p class="muted small">Until ${esc(day(new Date(Date.now() + ga.until * 864e5).toISOString()))}. fga ends shared access then, or earlier if your own access ends.</p>`;
  }
  acts.gaDays = d => { ga.until = Number(d.n); gaRender(["gaUntil"]); };

  // gaGive asks fga to record one share per file; fga decides each one and
  // the result step shows its answer, file by file.
  acts.gaGive = async () => {
    const go2 = document.getElementById("gaGo");
    go2.disabled = true;
    go2.textContent = "Asking fga…";
    const files = [...ga.sel.values()];
    const r = await api("POST", "/api/shares", { grantee: ga.who, actions: [...ga.opts], days: ga.until, files });
    if (!r.ok) { go2.disabled = false; go2.textContent = "Give access"; return toast(plainError(r.error), "bad"); }
    const res = r.data.results || [], okN = res.filter(x => x.status === 200).length;
    const el = document.getElementById("gaResult");
    el.classList.remove("hidden");
    el.innerHTML = stepHead(5, "What fga did") + `<p class="summary"><b>${esc(displayName(ga.who))}</b> got access to <b>${plural(okN, "file")}</b>` +
      `${okN ? ` until <b>${esc(day(r.data.expires))}</b>` : ""}.</p><div class="results">` + res.map(x => `<div class="result-row">${fileIcon(x.key)}<div class="grow min0">` +
        `<b class="fname">${esc(x.space)}/${esc(x.key)}</b><div class="note-line">${x.status === 200 ? `${icon("check", "xs")} Shared` : x.status === 202
          ? `${icon("info", "xs")} Needs an approval: a request was sent` : `${icon("x", "xs")} ${esc(x.error === "NOT_FOUND" ? "Not shared: you may not share it, or it no longer exists" : plainError(x.error))}`}</div></div></div>`).join("") + `</div>`;
    el.scrollIntoView({ block: "nearest" });
    go2.remove();
    document.getElementById("gaFoot").textContent = "";
  };

  acts.myBatches = async () => {
    openDrawer("Access you gave", loading("Loading…"));
    const r = await api("GET", "/api/batches");
    if (!r.ok) return openDrawer("Access you gave", `<p>${esc(plainError(r.error))}</p>`);
    const list = r.data.batches || [];
    openDrawer("Access you gave", list.length ? list.map(b => `<div class="batch">${avatar(b.grantee)}<div class="grow min0"><b>${esc(displayName(b.grantee))}</b> · ${plural(b.files.length, "file")}` +
      `<div class="muted small">given ${esc(day(b.created))} · until ${esc(day(b.expires))} · ${esc(b.actions.map(a => W.action(a, "storage.object").label).join(", "))}</div>` +
      `<details><summary class="small">Show the files</summary>${b.files.slice(0, 40).map(f => `<div class="mini-row">${fileIcon(f.key)}<span class="grow min0"><span class="fname">${esc(f.space)}/${esc(f.key)}</span></span></div>`).join("")}` +
      `${b.files.length > 40 ? `<div class="muted small pad">and ${b.files.length - 40} more</div>` : ""}</details></div>` +
      `<button class="btn sm danger" data-act="takeBack" data-id="${esc(b.id)}" data-who="${esc(b.grantee)}" data-n="${b.files.length}">Take back</button></div>`).join("")
      : `<div class="empty">Nothing you gave through this console is still running.</div>`);
  };
  acts.takeBack = d => confirmBox(`Take back ${plural(Number(d.n), "share")}?`, `<p>${esc(displayName(d.who))} loses the access you gave, at once.</p>`, "Take back", async () => {
    const r = await api("POST", `/api/batches/${encodeURIComponent(d.id)}/take-back`);
    if (!r.ok) return toast(plainError(r.error), "bad");
    const failed = (r.data.failed || []).length;
    toast(`Took back ${plural(r.data.taken_back, "share")}${failed ? `; ${failed} not: ${plainError(r.data.failed[0].error)}` : ""}`, failed ? "bad" : "ok");
  });

  // ---------------------------------------------------------------- approvals

  // renderNoPages is the page of someone fga lets use none of the console's
  // pages: without the right "Use the web console", or with no right that
  // has a page.
  function renderNoPages() {
    const text = session.access_error ? "fga can't be reached right now, so the console can't tell which pages are yours. Try again in a moment."
      : !session.access ? "fga doesn't let you use this console. An administrator can give you the right “Use the web console”."
      : "fga lets you use this console, but none of your rights has a page here yet. An administrator can give you more rights.";
    shell("Welcome", "", `<div class="page">${pageHead("Welcome")}<div class="card"><div class="empty">${icon("lock")}<div>${esc(text)}</div></div></div></div>`);
  }

  async function renderApprovals() {
    shell("Approvals", "", `<div class="page">${pageHead("Approvals", "Requests that need a second person, as fga lists them for you.")}${loading("Asking fga…")}</div>`);
    const r = await api("GET", "/api/approvals");
    const body = !r.ok ? `<div class="card"><div class="empty">${esc(plainError(r.error))}</div></div>` : !(r.data.approvals || []).length
      ? `<div class="card"><div class="empty">${icon("inbox")}<div>No requests wait for a decision.</div></div></div>`
      : `<div class="card">${r.data.approvals.map(a => {
        const p = a.plan || {}, t = (p.targets || [])[0] || {};
        const what = `${W.action(p.action || "", t.type || "").label} ${W.type(t.type || "").a}`;
        const changes = Object.entries(p.changes || {}).map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`).join(", ");
        return `<div class="approval">${avatar(a.requested_by || "?")}<div class="grow"><p><b>${esc(displayName(a.requested_by || ""))}</b> asks to <b>${esc(what.toLowerCase())}</b></p>` +
          `<div class="muted small">${esc((p.targets || []).map(x => x.id).join(", "))}${changes ? ` · ${esc(changes)}` : ""}</div>` +
          `<div class="muted small">until ${esc(when(a.expires_at))}</div></div><div class="btn-row">` +
          `<button class="btn danger sm" data-act="decide" data-id="${esc(a.approval_id)}" data-v="reject">Reject</button>` +
          `<button class="btn primary sm" data-act="decide" data-id="${esc(a.approval_id)}" data-v="approve">${icon("check", "sm")}Approve</button></div></div>`;
      }).join("")}</div>`;
    shell("Approvals", "", `<div class="page">${pageHead("Approvals", "Requests that need a second person, as fga lists them for you. fga decides whether you may decide each one.")}${body}</div>`);
  }
  acts.decide = async d => {
    const r = await api("POST", `/api/approvals/${encodeURIComponent(d.id)}`, { decision: d.v });
    if (!r.ok) return toast(plainError(r.error), "bad");
    toast(d.v === "approve" ? "Approved" : "Rejected", "ok");
    route();
  };

  // ---------------------------------------------------------------- theme, events, start

  function isDark() {
    const t = document.documentElement.dataset.theme;
    return t ? t === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  acts.theme = (d, el) => {
    const t = isDark() ? "light" : "dark";
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem("fga-console-theme", t); } catch { /* lasts for this page only */ }
    el.innerHTML = icon(isDark() ? "sun" : "moon");
  };

  document.addEventListener("click", e => {
    const el = e.target.closest("[data-act]");
    if (!el || el.disabled || !acts[el.dataset.act]) return;
    if (el.tagName === "INPUT" || el.tagName === "LABEL") return;
    const ctl = e.target.closest("input, select, textarea, label");
    if (ctl && ctl !== el && el.contains(ctl)) return;
    e.preventDefault();
    acts[el.dataset.act](el.dataset, el, e);
  });
  for (const type of ["change", "input"]) {
    document.addEventListener(type, e => {
      const attr = type === "change" ? "onChange" : "onInput", el = e.target.closest(`[data-on-${type}]`);
      if (el && acts[el.dataset[attr]]) acts[el.dataset[attr]](el.dataset, el, e);
    });
  }
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeDrawer(); });

  window.FGA_CONSOLE = {
    W, acts, routes, api, icon, esc, avatar, displayName, when, day, bytes, plural, val, toast, plainError, shell, pageHead, loading,
    openDrawer, closeDrawer, confirmBox, go, params, route, session: () => session,
  };

  async function loadSession() {
    const r = await api("GET", "/api/session");
    return r.ok ? r.data : { signed_in: false, organisation: "", people: [] };
  }
  async function start() { session = await loadSession(); }

  document.addEventListener("DOMContentLoaded", async () => {
    try { const t = localStorage.getItem("fga-console-theme"); if (t) document.documentElement.dataset.theme = t; } catch { /* system theme */ }
    await start();
    window.addEventListener("hashchange", route);
    route();
  });
})();

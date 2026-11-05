// End-user prototype: shell, state, routing and the made-up access
// answers. Nothing here talks to fga; mock() stands in for fga's answers
// only so the pages can be clicked through.
(function () {
  "use strict";
  const D = window.PROTO_DATA;

  const ICONS = {
    mark: '<path d="M12 3l7 3v6c0 4.4-3 7.4-7 9-4-1.6-7-4.6-7-9V6z"/><path d="M9 12l2 2 4-4"/>',
    folder: '<path d="M4 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/>',
    inbox: '<path d="M4 13l2.2-7h11.6L20 13v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/><path d="M4 13h5l1 2h4l1-2h5"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c1.9.8 3.1 2.5 3.5 5.2"/>',
    lock: '<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    logout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 8l-4 4 4 4M6 12h10"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
    upload: '<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>',
    share: '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.3 10.8l7.4-3.6M8.3 13.2l7.4 3.6"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
    doc: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M10 12h5M10 16h3"/>',
    pdf: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4"/><path d="M9.5 17v-4h1.5a1.2 1.2 0 0 1 0 2.4H9.5"/>',
    sheet: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 10h16M4 15h16M10 4v16"/>',
    archive: '<rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    chevron: '<path d="M9 6l6 6-6 6"/>',
    back: '<path d="M15 6l-6 6 6 6"/>',
    home: '<path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1z"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4.4 4.2-6.5 8-6.5s7 2.1 8 6.5"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l8-8M16 7l3 3"/>',
    bot: '<rect x="5" y="8" width="14" height="11" rx="3"/><path d="M12 4v4M9 13h.01M15 13h.01M9.5 16.5h5"/>',
    audit: '<path d="M8 4h8M8 4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2"/><path d="M9 11l2 2 4-4M9 17h6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    live: '<path d="M3 12h4l3-7 4 14 3-7h4"/>',
    shield: '<path d="M12 3l7 3v6c0 4.4-3 7.4-7 9-4-1.6-7-4.6-7-9V6z"/>',
    ban: '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  };
  const icon = (n, cls = "") => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ""}</svg>`;
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const initials = name => name.split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase();
  const avatar = (id, cls = "") => {
    const a = D.AGENTS.find(x => x.id === id);
    if (a) return `<span class="av bot ${cls}">${icon("bot", "sm")}</span>`;
    return `<span class="av ${cls}">${esc(initials(nameOf(id)))}</span>`;
  };
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const day = iso => { const [, m, d] = iso.split("-"); return `${+d} ${MONTHS[+m - 1]}`; };
  const addDays = (iso, n) => { const t = new Date(iso + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
  const UNTIL = { "1 week": 7, "1 month": 30, "End of year": null };
  const untilDate = len => UNTIL[len] === null ? "2026-12-31" : addDays(D.TODAY, UNTIL[len] ?? 7);

  // ---- state, kept in this browser only --------------------------------
  const KEY = "fga-end-user-prototype-v1";
  const fresh = () => ({
    me: null,
    rights: Object.fromEntries(D.PEOPLE.map(p => [p.id, [...p.rights]])),
    team: Object.fromEntries(D.PEOPLE.map(p => [p.id, p.team])),
    extra: {},
    shares: D.SHARES.map(s => ({ ...s })),
    requests: D.REQUESTS.map(r => ({ ...r })),
    approvals: D.APPROVALS.map(a => ({ ...a })),
    changes: D.CHANGES.map(c => ({ ...c })),
    activity: D.ACTIVITY.map(a => [...a]),
    stopped: {},
    labels: {},
    seq: 100,
  });
  let S;
  try { S = JSON.parse(localStorage.getItem(KEY) || "null"); } catch { S = null; }
  if (!S || !S.rights) S = fresh();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* private window: keep in memory */ } };
  const reset = () => { S = fresh(); save(); location.hash = "#/signin"; render(); };
  const nextId = p => p + (++S.seq);
  const log = text => { const t = new Date(); S.activity.unshift([`${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`, text]); };

  // ---- lookups -----------------------------------------------------------
  const person = id => D.PEOPLE.find(p => p.id === id);
  const nameOf = id => (person(id) || D.AGENTS.find(a => a.id === id) || { name: id }).name;
  const place = id => D.PLACES.find(p => p.id === id);
  const file = id => D.FILES.find(f => f.id === id);
  const teamOf = id => S.team[id];
  const has = (id, r) => (S.rights[id] || []).includes(r);
  const labelOf = f => S.labels[f.id] || f.label;
  const liveShares = () => S.shares.filter(s => s.until >= D.TODAY);
  const shareTo = (fid, pid) => liveShares().find(s => s.file === fid && s.to === pid);
  const isAdmin = id => !!(person(id) || {}).admin;

  // ---- made-up answers (stand-in for fga, prototype only) ----------------
  function fileAccess(pid, f) {
    const pl = place(f.place), sh = shareTo(f.id, pid), owner = f.owner === pid;
    const member = teamOf(pid) === pl.team, conf = labelOf(f) === "conf";
    const keyOK = !pl.locked || pl.keys.includes(pid) || owner;
    const visible = owner || !!sh || member;
    const open = has(pid, "open") && (owner || !!sh || (member && !conf && keyOK));
    const needsKey = member && pl.locked && !keyOK && !conf;
    const edit = open && has(pid, "upload") && (owner || (sh && sh.can === "edit") || (member && !conf && !pl.locked));
    const share = has(pid, "share") && (owner || (member && !conf && !pl.locked));
    return { visible, open, needsKey, edit, share, copies: open && has(pid, "copies"), del: has(pid, "delete") && owner, owner, sh };
  }
  function partVisible(pid, pl, part) {
    if (!has(pid, "open")) return false;
    if (pl.owner === pid) return true;
    if ((S.extra[pid] || []).includes(pl.id + ":" + part.name)) return true;
    return teamOf(pid) === pl.team && !part.conf;
  }
  function shareCheck(from, f, to) {
    if (D.AGENTS.find(a => a.id === to)) return { ok: false, facts: `${nameOf(to)} is an assistant.` };
    if (to === from) return { ok: false, facts: "That's you." };
    if (f.owner === to) return { ok: false, facts: `${nameOf(to)} owns this file.` };
    if (labelOf(f) === "conf" && teamOf(to) !== place(f.place).team)
      return { ok: false, facts: `${nameOf(to)} is in the ${D.TEAMS[teamOf(to)].name}. This file is confidential.` };
    return { ok: true };
  }

  // ---- small UI helpers ----------------------------------------------------
  function toast(msg) {
    const t = document.createElement("div"); t.className = "toast"; t.textContent = msg;
    document.getElementById("toasts").appendChild(t); setTimeout(() => t.remove(), 3200);
  }
  function modal(html, wire) {
    const root = document.getElementById("modal-root");
    root.innerHTML = `<div class="overlay"><div class="dialog" role="dialog" aria-modal="true">${html}</div></div>`;
    const ov = root.firstChild;
    const close = () => { root.innerHTML = ""; document.removeEventListener("keydown", onKey); };
    const onKey = e => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    ov.addEventListener("click", e => { if (e.target === ov) close(); });
    ov.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", close));
    wire(ov.querySelector(".dialog"), close);
  }
  const fileIcon = f => icon(f.type in ICONS ? f.type : "doc");
  const labelTag = f => labelOf(f) === "conf" ? `<span class="tag conf">Confidential</span>` : `<span class="tag">Team</span>`;

  // The access picture: one person box, arrows to a few place boxes.
  function picture(who, boxes) {
    const n = boxes.length, H = Math.max(n * 46 + 4, 60), cy = H / 2;
    const arrows = boxes.map((b, i) => {
      const y = 4 + i * 46 + 19;
      return `<path class="ar" d="M150,${cy} C270,${cy} 270,${y} 396,${y}" marker-end="url(#pmk)"${b.dashed ? ' style="stroke-dasharray:4 3"' : ""}/>`;
    }).join("");
    const rects = boxes.map((b, i) => {
      const y = 4 + i * 46;
      return `<g class="bx" data-i="${i}"><rect x="400" y="${y}" width="230" height="38" rx="8"${b.dashed ? ' style="stroke-dasharray:4 3"' : ""}/>` +
        `<text class="t1" x="414" y="${y + 17}">${esc(b.title)}</text><text class="t2" x="414" y="${y + 31}">${esc(b.short)}</text></g>`;
    }).join("");
    return `<svg class="pic" viewBox="0 0 640 ${H}" role="img" aria-label="Arrows from ${esc(who)} to ${n} places">` +
      `<defs><marker id="pmk" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path class="mk" d="M0,1 L9,5 L0,9 z"/></marker></defs>` +
      arrows + `<g class="me"><rect x="20" y="${cy - 20}" width="130" height="40" rx="8"/><text x="85" y="${cy + 5}" text-anchor="middle">${esc(who)}</text></g>` + rects + `</svg>`;
  }
  function wirePicture(root, boxes, out) {
    root.querySelectorAll(".pic .bx").forEach(g => g.addEventListener("click", () => {
      root.querySelectorAll(".pic .bx").forEach(x => x.classList.remove("on"));
      g.classList.add("on");
      out.textContent = boxes[+g.dataset.i].facts;
    }));
  }

  // ---- shell and routing -----------------------------------------------------
  const pages = {};
  function nav() {
    const me = S.me, cur = location.hash.slice(1).split("/")[1] || "";
    const a = (path, ic, label, badge) => `<a href="#/${path}" class="${cur === path.split("/")[0] ? "on" : ""}">${icon(ic)}<span>${esc(label)}</span>${badge ? `<span class="badge">${badge}</span>` : ""}</a>`;
    if (isAdmin(me)) {
      const waiting = S.changes.filter(c => c.status !== "live").length;
      return `<div class="nav-h">Administration</div>${a("people", "users", "People")}${a("teams", "folder", "Teams")}` +
        `${a("changes", "shield", "Rule changes", waiting)}${a("activity", "audit", "Activity")}`;
    }
    const waiting = S.requests.filter(r => r.owner === me && r.status === "waiting").length +
      S.approvals.filter(x => x.lead === me && x.status === "waiting").length;
    const agent = D.AGENTS.find(x => x.for === me);
    return `${a("home", "home", "Home")}${a("files", "folder", "Files")}${a("me", "user", "My access")}` +
      `${a("requests", "inbox", "Requests", waiting)}${agent ? a("assistant", "bot", "My assistant") : ""}`;
  }
  function shell(body) {
    const me = person(S.me);
    const sub = me.admin ? "Administrator" : D.TEAMS[teamOf(me.id)].name;
    return `<div class="shell"><aside class="side"><div class="brand"><span class="mk">${icon("mark")}</span><span>fga<small>Acme (made up)</small></span></div>` +
      `<nav class="nav">${nav()}</nav><div class="grow"></div>` +
      `<div class="who">${avatar(me.id)}<span class="nm">${esc(me.name)}<small>${esc(sub)}</small></span>` +
      `<button class="btn ghost small" id="theme" aria-label="Switch light or dark">${icon("moon", "sm")}</button>` +
      `<a class="btn ghost small" href="#/signin" aria-label="Switch person">${icon("logout", "sm")}</a></div></aside>` +
      `<main class="main">${body}<div class="foot"><span>Prototype: nothing here is connected to fga. Changes stay in this browser.</span><button id="reset">Reset prototype data</button></div></main></div>`;
  }
  function render() {
    const parts = location.hash.slice(1).split("/").filter(Boolean);
    const app = document.getElementById("app");
    document.getElementById("modal-root").innerHTML = "";
    if (!S.me || parts[0] === "signin" || !parts[0]) { app.innerHTML = pages.signin(); pages.signinWire(app); return; }
    const page = pages[parts[0]];
    const allowed = isAdmin(S.me) ? ["people", "teams", "changes", "activity"] : ["home", "files", "me", "requests", "assistant"];
    if (!page || !allowed.includes(parts[0])) { location.hash = isAdmin(S.me) ? "#/people" : "#/home"; return; }
    const out = page(parts.slice(1));
    app.innerHTML = shell(out.html);
    app.querySelector("#reset").addEventListener("click", () => { if (confirm("Reset all prototype data?")) reset(); });
    app.querySelector("#theme").addEventListener("click", () => {
      const dark = document.documentElement.dataset.theme === "dark" ||
        (!document.documentElement.dataset.theme && matchMedia("(prefers-color-scheme: dark)").matches);
      document.documentElement.dataset.theme = dark ? "light" : "dark";
      try { localStorage.setItem(KEY + "-theme", document.documentElement.dataset.theme); } catch { /* ignore */ }
    });
    if (out.wire) out.wire(app.querySelector(".main"));
    window.scrollTo(0, 0);
  }
  try { const t = localStorage.getItem(KEY + "-theme"); if (t) document.documentElement.dataset.theme = t; } catch { /* ignore */ }

  window.PROTO = {
    D, S: () => S, save, log, nextId, icon, esc, avatar, day, untilDate, person, nameOf, place, file, teamOf, has, labelOf,
    liveShares, shareTo, isAdmin, fileAccess, partVisible, shareCheck, toast, modal, fileIcon, labelTag, picture, wirePicture, pages, render,
    setMe: id => { S.me = id; save(); },
  };
  window.addEventListener("hashchange", render);
  window.addEventListener("DOMContentLoaded", render);
})();

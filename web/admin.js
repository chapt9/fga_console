// The administrator's pages. Everything on them comes from fga's admin API
// through the console server, with the administrator's own pass; fga checks
// and records every change. Rights and profiles are the console's names for
// sets of fga capabilities; rule changes become a draft, signed outside the
// console.
"use strict";

(() => {
  const C = window.FGA_CONSOLE;
  const { W, acts, routes, api, icon, esc, avatar, displayName, when, day, plural, val, toast, plainError, shell, pageHead, loading,
    openDrawer, closeDrawer, confirmBox, go } = C;

  let people = [], rights = [], profiles = [], spacesList = [], delegations = [], policy = null;

  // fga's admin API answers errors in words; the console's own codes are
  // turned into words here.
  const fail = e => (/^[A-Z_]+$/.test(e || "") ? plainError(e) : `fga refused: ${e}`);
  const tech = code => `<code class="tech">${esc(code)}</code>`;

  // loadAll reads every page of an admin list.
  async function loadAll(path) {
    const items = [];
    let after = "";
    for (let i = 0; i < 40; i++) {
      const q = new URLSearchParams({ limit: "500" });
      if (after) q.set("after", after);
      const r = await api("GET", `${path}?${q}`);
      if (!r.ok) return { ok: false, error: r.error };
      items.push(...(r.data.items || []));
      if (!r.data.next) break;
      after = r.data.next;
    }
    return { ok: true, items };
  }
  async function loadPeople() {
    const r = await loadAll("/api/admin/people");
    if (r.ok) people = r.items.map(p => ({ ...p, roles: p.roles || [], attributes: p.attributes || {}, capabilities: p.capabilities || {} }));
    return r;
  }
  async function loadRights() {
    const r = await api("GET", "/api/admin/rights");
    if (r.ok) { rights = r.data.rights; profiles = r.data.profiles; }
    return r;
  }
  async function loadSpaces() {
    const r = await loadAll("/api/admin/spaces");
    if (r.ok) spacesList = r.items.map(b => ({ name: b.Name ?? b.name, project: b.Project ?? b.project, label: b.Label ?? b.label,
      scope: b.Scope ?? b.scope, encryption: b.Encryption ?? b.encryption }));
    return r;
  }

  // ---------------------------------------------------------------- rights

  const holds = (p, r) => Object.entries(r.capabilities).every(([t, as]) => as.every(a => (p.capabilities[t] || []).includes(a)));
  const heldRights = p => rights.filter(r => holds(p, r)).map(r => r.id);
  const rightName = id => (rights.find(r => r.id === id) || { name: id }).name;
  const capCount = p => Object.values(p.capabilities).reduce((n, a) => n + a.length, 0);
  const sameSet = (a, b) => a.length === b.length && a.every(x => b.includes(x));
  function rightsText(p) {
    const held = heldRights(p);
    if (!held.length) return capCount(p) ? `${plural(capCount(p), "permission")}, no full right` : "No rights";
    const exact = profiles.find(x => sameSet(x.rights, held));
    if (exact) return exact.name;
    const base = profiles.filter(x => x.rights.length && x.rights.every(r => held.includes(r))).sort((a, b) => b.rights.length - a.rights.length)[0];
    if (!base) return plural(held.length, "right");
    const extra = held.filter(r => !base.rights.includes(r)).map(rightName);
    return `${base.name}, plus ${extra.length > 2 ? plural(extra.length, "right") : extra.join(" and ")}`;
  }

  // capsFor merges the capabilities of several rights.
  function capsFor(ids) {
    const m = {};
    for (const r of rights.filter(x => ids.includes(x.id))) {
      for (const [t, as] of Object.entries(r.capabilities)) m[t] = [...new Set([...(m[t] || []), ...as])];
    }
    return m;
  }
  // changeRights gives and takes rights so that p holds exactly target. A
  // capability another kept right needs is never taken.
  async function changeRights(p, target) {
    const held = heldRights(p), give = target.filter(r => !held.includes(r)), take = held.filter(r => !target.includes(r));
    if (give.length) {
      const r = await api("POST", `/api/admin/people/${encodeURIComponent(p.id)}/grant`, { capabilities: capsFor(give) });
      if (!r.ok) return r;
    }
    if (take.length) {
      const keep = capsFor(target), drop = {};
      for (const [t, as] of Object.entries(capsFor(take))) {
        const left = as.filter(a => !(keep[t] || []).includes(a));
        if (left.length) drop[t] = left;
      }
      if (Object.keys(drop).length) {
        const r = await api("POST", `/api/admin/people/${encodeURIComponent(p.id)}/revoke`, { capabilities: drop });
        if (!r.ok) return r;
      }
    }
    return { ok: true };
  }

  // ---------------------------------------------------------------- overview

  routes["/admin"] = async () => {
    shell("Overview", "", `<div class="page">${loading("Asking fga…")}</div>`);
    const [pr, sr, dr, er, rr, hr] = await Promise.all([loadPeople(), loadSpaces(), loadAll("/api/admin/delegations"),
      api("GET", "/api/admin/events?limit=50"), api("GET", "/api/admin/rules"), api("GET", "/api/admin/servers")]);
    if (!pr.ok) return shell("Overview", "", `<div class="page">${pageHead(C.session().organisation)}${loading(fail(pr.error))}</div>`);
    const active = people.filter(p => !p.disabled).length;
    const now = Date.now(), runningDl = dr.ok ? dr.items.filter(d => !d.revoked && Date.parse(d.expires_at) > now).length : 0;
    const rules = rr.ok ? Object.values(rr.data.documents || {}).reduce((n, d) => n + ((d.rules || []).length), 0) : 0;
    const health = hr.ok ? hr.data.services : [];
    const kpi = (ic, label, value, foot, href) => `<a class="card kpi" href="#${href}"><div class="label">${icon(ic, "sm")}${esc(label)}</div>` +
      `<div class="value">${value}</div><div class="foot">${esc(foot)}</div></a>`;
    const events = er.ok ? (er.data.items || []) : [];
    shell("Overview", "", `<div class="page">${pageHead(C.session().organisation, "Who may do what, from fga itself. Every change you make here is checked and recorded by fga.")}` +
      `<div class="grid kpis">${kpi("users", "People", active, `${people.length - active} disabled`, "/admin/people")}` +
      `${kpi("bot", "Agents acting for people", runningDl, "running permissions to act", "/admin/agents")}` +
      `${kpi("bucket", "Spaces", sr.ok ? spacesList.length : "–", sr.ok ? "storage areas" : fail(sr.error), "/admin/spaces")}` +
      `${kpi("policy", "Rules", rr.ok ? rules : "–", rr.ok ? `version ${rr.data.epoch}, signed by ${rr.data.key_id}` : fail(rr.error), "/admin/rules")}` +
      `${kpi("server", "Services", health.length ? `${health.filter(s => s.ok).length}/${health.length}` : "–", health.length ? "answering" : "none configured", "/admin/servers")}</div>` +
      `<div class="card spaced"><div class="card-head"><h3>Latest events</h3><a class="right small" href="#/admin/audit">Audit log</a></div>` +
      (events.length ? events.slice(0, 8).map(eventRow).join("") : `<div class="empty small">${esc(er.ok ? "No events yet." : fail(er.error))}</div>`) + `</div></div>`);
  };

  // ---------------------------------------------------------------- people

  const pf = { q: "", right: "", project: "", role: "", status: "active", page: 0, sel: new Set() };
  const PAGE = 25;
  const projectsOf = p => (Array.isArray(p.attributes.projects) ? p.attributes.projects : []).map(String);
  const leadsOf = p => (Array.isArray(p.attributes.leads) ? p.attributes.leads : []).map(String);
  const allProjects = () => [...new Set([...people.flatMap(projectsOf), ...spacesList.map(s => s.project).filter(Boolean)])].sort();
  const allRoles = () => [...new Set(people.flatMap(p => p.roles))].sort();
  const match = (p, q) => !q || p.id.toLowerCase().includes(q) || displayName(p.id).toLowerCase().includes(q);

  routes["/admin/people"] = async params => {
    for (const k of ["right", "project", "role"]) if (params.get(k) !== null) Object.assign(pf, { q: "", right: "", project: "", role: "", page: 0, [k]: params.get(k) });
    shell("People", "", `<div class="page wide">${loading("Asking fga…")}</div>`);
    const [pr, rr] = await Promise.all([loadPeople(), loadRights(), loadSpaces()]);
    if (!pr.ok || !rr.ok) return shell("People", "", `<div class="page">${pageHead("People")}${loading(fail(pr.error || rr.error))}</div>`);
    const opts = (list, cur, all) => `<option value="">${all}</option>` + list.map(([v, t]) => `<option value="${esc(v)}" ${v === cur ? "selected" : ""}>${esc(t)}</option>`).join("");
    shell("People", "", `<div class="page wide">${pageHead("People",
      "Everyone fga knows in this organisation. Their <b>rights</b> are the most they may ever do; their <b>projects</b> and <b>roles</b> decide where the rules let them do it.",
      (C.session().dev ? "" : `<button class="btn" data-act="invitePerson">${icon("link")}Invite someone</button>`) +
      `<button class="btn primary" data-act="editPerson" data-new="1">${icon("plus")}Add a person</button>`)}` +
      `<div class="card"><div class="card-head filters"><input class="input search" placeholder="Search by name" value="${esc(pf.q)}" data-on-input="pfQ" aria-label="Search people">` +
      `<select class="input" data-on-change="pfSet" data-k="right" aria-label="Rights"><option value="">Any rights</option>` +
      `<optgroup label="Has the right">${rights.map(r => `<option value="+${esc(r.id)}" ${pf.right === "+" + r.id ? "selected" : ""}>Can: ${esc(r.name)}</option>`).join("")}</optgroup>` +
      `<optgroup label="Lacks the right">${rights.map(r => `<option value="-${esc(r.id)}" ${pf.right === "-" + r.id ? "selected" : ""}>Cannot: ${esc(r.name)}</option>`).join("")}</optgroup>` +
      `<option value="none" ${pf.right === "none" ? "selected" : ""}>No rights at all</option></select>` +
      `<select class="input" data-on-change="pfSet" data-k="project" aria-label="Project">${opts(allProjects().map(x => [x, x]), pf.project, "All projects")}</select>` +
      `<select class="input" data-on-change="pfSet" data-k="role" aria-label="Role">${opts(allRoles().map(x => [x, W.role(x).one]), pf.role, "All roles")}</select>` +
      `<select class="input" data-on-change="pfSet" data-k="status" aria-label="Status">${opts([["active", "Active"], ["disabled", "Disabled"]], pf.status, "Active and disabled")}</select></div>` +
      `<div id="peopleRows">${peopleRows()}</div></div><div id="invitations"></div></div>`);
    if (params.get("new")) acts.editPerson({ new: "1" });
    refreshInvitations();
  };

  // ---------------------------------------------------------------- invitations

  // An invitation is a one-time link for someone fga does not know yet. They
  // sign in with it at the organisation's login, and an administrator then
  // adds them to fga with the invitation's profile, roles and projects.
  async function refreshInvitations() {
    const box = document.getElementById("invitations");
    if (!box) return;
    const r = await api("GET", "/api/admin/invitations");
    const list = r.ok ? (r.data.invitations || []).filter(i => i.state === "open" || i.state === "waiting") : [];
    box.innerHTML = !list.length ? "" : `<div class="card spaced"><div class="card-head"><h3>Invitations</h3></div>` + list.map(i => {
      const what = i.state === "waiting"
        ? `signed in as ${tech(i.person)}${i.person_name ? ` (${esc(i.person_name)})` : ""}, waiting for you`
        : `link not used yet, until ${esc(day(i.expires))}`;
      return `<div class="list-row">${avatar(i.name)}<div class="grow"><b>${esc(i.name)}</b>` +
        `<div class="muted small">${esc((profiles.find(p => p.id === i.profile) || { name: i.profile }).name)}, ${what}</div></div>` +
        (i.state === "waiting" ? `<button class="btn sm primary" data-act="confirmInvite" data-id="${esc(i.id)}" data-name="${esc(i.name)}">Add to fga</button>` : "") +
        `<button class="btn sm ghost" data-act="cancelInvite" data-id="${esc(i.id)}" data-name="${esc(i.name)}">Cancel</button></div>`;
    }).join("") + `</div>`;
  }
  acts.invitePerson = () => openDrawer("Invite someone",
    `<p class="muted small">They get a one-time link, sign in with it at your organisation's login, and wait until you add them. Until then fga does not know them, so they can do nothing.</p>` +
    `<label class="field"><span>Name</span><input class="input" id="fInvName" placeholder="Dana Lee" autocomplete="off"></label>` +
    `<label class="field"><span>Profile</span><select class="input" id="fInvProfile">` +
      profiles.map(p => `<option value="${esc(p.id)}" ${p.id === "member" ? "selected" : ""}>${esc(p.name)}: ${esc(p.help)}</option>`).join("") + `</select></label>` +
    `<label class="field"><span>Roles</span><input class="input" id="fInvRoles" value="member" autocomplete="off"><small>Separated by commas. Rules name roles; a role no rule names gives nothing.</small></label>` +
    `<label class="field"><span>Projects</span><input class="input" id="fInvProjects" placeholder="p1, p2" autocomplete="off"></label>` +
    `<label class="field"><span>The link works for</span><select class="input" id="fInvDays">` +
      [1, 3, 7, 14, 30].map(n => `<option value="${n}" ${n === 3 ? "selected" : ""}>${plural(n, "day")}</option>`).join("") + `</select></label>`,
    `<button class="btn" data-act="closeDrawer">Cancel</button><button class="btn primary" id="inviteBtn" data-act="doInvite">Make the link</button>`);
  const words = id => val(id).split(",").map(x => x.trim()).filter(Boolean);
  acts.doInvite = async () => {
    const name = val("fInvName").trim();
    if (!name) return toast("Give their name", "bad");
    const btn = document.getElementById("inviteBtn");
    btn.disabled = true;
    const r = await api("POST", "/api/admin/invitations",
      { name, profile: val("fInvProfile"), roles: words("fInvRoles"), projects: words("fInvProjects"), days: Number(val("fInvDays")) });
    if (!r.ok) { btn.disabled = false; return toast(fail(r.error), "bad"); }
    openDrawer(`Invitation for ${name}`,
      `<p>Send ${esc(name)} this link. It works once, until ${esc(day(r.data.invitation.expires))}, and the console shows it only now.</p>` +
      `<div class="preview" id="inviteLink">${esc(r.data.link)}</div>` +
      `<p class="muted small spaced">Once they have signed in, they appear under Invitations on this page, and you add them to fga.</p>`,
      `<button class="btn" data-act="copyInvite">${icon("link")}Copy the link</button><span class="spacer"></span><button class="btn primary" data-act="closeDrawer">Done</button>`);
    refreshInvitations();
  };
  acts.copyInvite = async () => {
    try { await navigator.clipboard.writeText(document.getElementById("inviteLink").textContent); toast("Link copied", "ok"); }
    catch { toast("Select the link and copy it", "bad"); }
  };
  acts.confirmInvite = d => confirmBox(`Add ${d.name} to fga?`,
    `<p>fga then knows them by the name their login gave, with the invitation's profile, roles and projects. You can change them later like anyone else.</p>`,
    "Add to fga", async () => {
      const r = await api("POST", `/api/admin/invitations/${encodeURIComponent(d.id)}/confirm`);
      if (!r.ok) return toast(r.error === "ALREADY_KNOWN" ? "fga knows this person already; change them under People" : fail(r.error), "bad");
      await loadPeople();
      refreshPeople();
      refreshInvitations();
      toast(r.data.rights_error ? `Added ${d.name}, but fga refused the rights: ${fail(r.data.rights_error)}` : `Added ${d.name}`, r.data.rights_error ? "bad" : "ok");
    });
  acts.cancelInvite = d => confirmBox(`Cancel the invitation for ${d.name}?`,
    `<p>The link stops working. If they have signed in already, fga still does not know them.</p>`, "Cancel invitation", async () => {
      const r = await api("POST", `/api/admin/invitations/${encodeURIComponent(d.id)}/cancel`);
      if (!r.ok) return toast(fail(r.error), "bad");
      refreshInvitations();
      toast(`Invitation for ${d.name} cancelled`, "ok");
    });

  function peopleList() {
    const q = pf.q.trim().toLowerCase(), r = pf.right;
    return people.filter(p => match(p, q) && (!pf.role || p.roles.includes(pf.role)) && (!pf.project || projectsOf(p).includes(pf.project)) &&
      (!pf.status || (pf.status === "active") === !p.disabled) &&
      (!r || (r === "none" ? !heldRights(p).length : r[0] === "+" ? heldRights(p).includes(r.slice(1)) : !heldRights(p).includes(r.slice(1)))))
      .sort((a, b) => displayName(a.id).localeCompare(displayName(b.id)));
  }
  function peopleRows() {
    const list = peopleList(), pages = Math.max(1, Math.ceil(list.length / PAGE));
    pf.page = Math.min(pf.page, pages - 1);
    const page = list.slice(pf.page * PAGE, pf.page * PAGE + PAGE);
    const opt = (l, first) => `<option value="">${first}</option>` + l.map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join("");
    const bulk = pf.sel.size ? `<div class="bulk-bar"><b>${plural(pf.sel.size, "person", "people")} selected</b>` +
      (pf.sel.size < list.length ? `<button class="btn sm ghost" data-act="pfSelectAll">Select all ${list.length} matching</button>` : "") +
      `<select class="input" data-on-change="bulkProfile" aria-label="Apply a profile">${opt(profiles.map(x => [x.id, x.name]), "Apply a profile…")}</select>` +
      `<select class="input" data-on-change="bulkGive" aria-label="Give a right">${opt(rights.map(x => [x.id, x.name]), "Give a right…")}</select>` +
      `<select class="input" data-on-change="bulkTake" aria-label="Take a right">${opt(rights.map(x => [x.id, x.name]), "Take a right…")}</select>` +
      `<button class="btn sm ghost" data-act="pfClearSel">Clear</button></div>` : "";
    const rows = page.map(p => `<tr class="clickable" data-act="editPerson" data-id="${esc(p.id)}">` +
      `<td class="pick-cell"><input type="checkbox" data-on-change="pfPick" data-id="${esc(p.id)}" ${pf.sel.has(p.id) ? "checked" : ""} aria-label="Select ${esc(p.id)}"></td>` +
      `<td><div class="who">${avatar(p.id)}<div><b>${esc(displayName(p.id))}</b><div class="muted small">${esc(p.id)}</div></div></div></td>` +
      `<td><span class="chip ${heldRights(p).length ? "on" : ""}" title="${esc(heldRights(p).map(rightName).join(", ") || "No rights")}">${esc(rightsText(p))}</span></td>` +
      `<td class="hide-sm"><div class="chips">${projectsOf(p).map(x => `<span class="chip proj-chip ${leadsOf(p).includes(x) ? "lead" : ""}">${esc(x)}${leadsOf(p).includes(x) ? " · lead" : ""}</span>`).join("") || '<span class="muted small">none</span>'}</div></td>` +
      `<td class="hide-md"><div class="chips">${p.roles.map(r => `<span class="chip">${esc(W.role(r).one)}</span>`).join("") || '<span class="muted small">none</span>'}</div></td>` +
      `<td><span class="badge ${p.disabled ? "muted" : "ok"}">${p.disabled ? "Disabled" : "Active"}</span></td></tr>`).join("");
    const allOnPage = page.length && page.every(p => pf.sel.has(p.id));
    return bulk + (list.length ? `<table class="tbl"><thead><tr><th class="pick-cell"><input type="checkbox" data-on-change="pfPickPage" ${allOnPage ? "checked" : ""} aria-label="Select this page"></th>` +
      `<th>Person</th><th>Rights</th><th class="hide-sm">Projects</th><th class="hide-md">Roles</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>` +
      `<div class="pager"><span class="muted small">${plural(list.length, "person", "people")}</span><span class="spacer"></span>` +
      `<button class="btn sm" data-act="pfPage" data-d="-1" ${pf.page ? "" : "disabled"}>${icon("back", "sm")}Previous</button><span class="muted small">Page ${pf.page + 1} of ${pages}</span>` +
      `<button class="btn sm" data-act="pfPage" data-d="1" ${pf.page < pages - 1 ? "" : "disabled"}>Next${icon("chevron", "sm")}</button></div>`
      : `<div class="empty">${icon("users")}<div>No one matches.</div></div>`);
  }
  const refreshPeople = () => { const el = document.getElementById("peopleRows"); if (el) el.innerHTML = peopleRows(); };
  acts.pfQ = (d, el) => { pf.q = el.value; pf.page = 0; refreshPeople(); };
  acts.pfSet = (d, el) => { pf[d.k] = el.value; pf.page = 0; refreshPeople(); };
  acts.pfPage = d => { pf.page += Number(d.d); refreshPeople(); };
  acts.pfPick = (d, el) => { if (el.checked) pf.sel.add(d.id); else pf.sel.delete(d.id); refreshPeople(); };
  acts.pfPickPage = (d, el) => { peopleList().slice(pf.page * PAGE, pf.page * PAGE + PAGE).forEach(p => (el.checked ? pf.sel.add(p.id) : pf.sel.delete(p.id))); refreshPeople(); };
  acts.pfSelectAll = () => { peopleList().forEach(p => pf.sel.add(p.id)); refreshPeople(); };
  acts.pfClearSel = () => { pf.sel.clear(); refreshPeople(); };

  // bulk changes the rights of every selected person, one by one through
  // fga, and reports what fga refused.
  async function bulk(text, target, takes) {
    const list = people.filter(p => pf.sel.has(p.id)), go2 = async () => {
      toast(`${text}: ${plural(list.length, "person", "people")}…`);
      let failed = 0, first = "";
      for (const p of list) {
        const r = await changeRights(p, target(p));
        if (!r.ok) { failed++; first = first || r.error; }
      }
      await loadPeople();
      refreshPeople();
      toast(failed ? `${text}: fga refused ${failed} (${fail(first)})` : `${text}: done for ${plural(list.length, "person", "people")}`, failed ? "bad" : "ok");
    };
    if (!takes) return go2();
    confirmBox(`${text} for ${plural(list.length, "person", "people")}?`, `<p>This takes rights away from them, at once.</p>` +
      `<p class="muted small">fga writes what is taken away to its security journal first, so an old backup cannot bring it back.</p>`, "Apply", go2);
  }
  acts.bulkProfile = (d, el) => { const x = profiles.find(y => y.id === el.value); el.value = ""; if (x) bulk(`Rights set to ${x.name}`, () => x.rights, true); };
  acts.bulkGive = (d, el) => { const id = el.value; el.value = ""; if (id) bulk(`Gave ${rightName(id)}`, p => [...new Set([...heldRights(p), id])], false); };
  acts.bulkTake = (d, el) => { const id = el.value; el.value = ""; if (id) bulk(`Took ${rightName(id)}`, p => heldRights(p).filter(r => r !== id), true); };

  const checkRow = (attrs, on, title, help) => `<label class="check big"><input type="checkbox" ${attrs} ${on ? "checked" : ""}>` +
    `<span><b>${esc(title)}</b>${help ? `<small>${esc(help)}</small>` : ""}</span></label>`;

  acts.editPerson = d => {
    const isNew = d.new === "1";
    const p = isNew ? { id: "", roles: [], attributes: {}, capabilities: {}, disabled: false } : people.find(x => x.id === d.id);
    if (!p) return;
    const held = isNew ? (profiles.find(x => x.id === "member") || { rights: [] }).rights : heldRights(p);
    const projects = [...new Set([...allProjects(), ...projectsOf(p)])];
    const otherAttrs = Object.fromEntries(Object.entries(p.attributes).filter(([k]) => k !== "projects" && k !== "leads"));
    openDrawer(isNew ? "Add a person" : displayName(p.id),
      (isNew ? `<label class="field"><span>Sign-in name</span><input class="input" id="fPid" placeholder="dana.lee" autocomplete="off">` +
        `<small>The name in their sign-in pass, as your organisation's login sends it.</small></label>`
        : `<div class="file-head">${avatar(p.id, "lg")}<div><b>${esc(displayName(p.id))}</b><div class="muted small">${esc(p.id)} · ${p.disabled ? "Disabled" : "Active"}` +
          `${p.expires_at ? ` · until ${esc(day(p.expires_at))}` : ""}</div></div></div>`) +
      `<div class="field"><span>Rights</span><select class="input" data-on-change="applyProfile" aria-label="Start from a profile"><option value="">Start from a profile…</option>` +
        profiles.map(x => `<option value="${esc(x.id)}">${esc(x.name)}: ${esc(x.help)}</option>`).join("") + `</select>` +
        rights.map(r => checkRow(`data-right="${esc(r.id)}"`, held.includes(r.id), r.name, r.help)).join("") +
        `<small>A right is the most they may ever do; the rules decide where. With no rights, they can sign in and do nothing.</small></div>` +
      `<div class="field"><span>Projects</span><table class="mini-tbl"><thead><tr><th>Project</th><th>Member</th><th>Team lead</th></tr></thead><tbody>` +
        projects.map(x => `<tr><td>${esc(x)}</td><td><input type="checkbox" data-project="${esc(x)}" ${projectsOf(p).includes(x) ? "checked" : ""} aria-label="Member of ${esc(x)}"></td>` +
          `<td><input type="checkbox" data-lead="${esc(x)}" ${leadsOf(p).includes(x) ? "checked" : ""} aria-label="Team lead of ${esc(x)}"></td></tr>`).join("") +
        `</tbody></table><div class="inline spaced-sm"><input class="input" id="fNewProject" placeholder="Another project, such as p3" autocomplete="off"></div>` +
        `<small>Rules compare these with the project of a space or file. A team lead is also a member.</small></div>` +
      `<div class="field"><span>Roles</span><div class="check-grid">${[...new Set([...allRoles(), ...p.roles])].map(r => `<label class="check"><input type="checkbox" data-role="${esc(r)}" ${p.roles.includes(r) ? "checked" : ""}>${esc(W.role(r).one)}</label>`).join("")}</div>` +
        `<input class="input spaced-sm" id="fNewRole" placeholder="Another role, such as reviewer" autocomplete="off"><small>Rules name roles; a role no rule names gives nothing.</small></div>` +
      (Object.keys(otherAttrs).length ? `<div class="field"><span>Other attributes</span><div class="preview">${esc(JSON.stringify(otherAttrs, null, 1))}</div><small>Kept as they are.</small></div>` : "") +
      `<p class="muted small">${icon("lock", "xs")} fga records every change, and writes anything taken away to its security journal first.</p>`,
      (isNew || p.disabled ? "" : `<button class="btn danger" data-act="disablePerson" data-id="${esc(p.id)}">Disable</button><span class="spacer"></span>`) +
      `<button class="btn" data-act="closeDrawer">Cancel</button><button class="btn primary" id="savePersonBtn" data-act="savePerson" data-id="${esc(p.id)}" data-new="${isNew ? 1 : 0}">Save</button>`);
  };
  acts.applyProfile = (d, el) => {
    const x = profiles.find(y => y.id === el.value);
    if (!x) return;
    document.querySelectorAll("#drawer [data-right]").forEach(c => { c.checked = x.rights.includes(c.dataset.right); });
    el.value = "";
    toast(`Ticked the rights of ${x.name}; save to apply`);
  };
  const ids = sel => [...document.querySelectorAll(sel)].filter(c => c.checked);
  acts.savePerson = async d => {
    const isNew = d.new === "1", id = isNew ? val("fPid").trim() : d.id;
    if (!/^[^\s/\x00-\x1f\x7f]{1,256}$/.test(id)) return toast("Give a sign-in name without spaces or slashes", "bad");
    if (isNew && people.some(p => p.id === id)) return toast(`${id} exists already`, "bad");
    const old = isNew ? { id, roles: [], attributes: {}, capabilities: {} } : people.find(p => p.id === id);
    const extraP = val("fNewProject").trim(), extraR = val("fNewRole").trim();
    const leads = ids("#drawer [data-lead]").map(c => c.dataset.lead);
    const projects = [...new Set([...ids("#drawer [data-project]").map(c => c.dataset.project), ...leads, ...(extraP ? [extraP] : [])])];
    const roles = [...new Set([...ids("#drawer [data-role]").map(c => c.dataset.role), ...(extraR ? [extraR] : [])])];
    const attributes = { ...old.attributes, projects };
    if (leads.length) attributes.leads = leads; else delete attributes.leads;
    const btn = document.getElementById("savePersonBtn");
    btn.disabled = true;
    const r = await api("PUT", `/api/admin/people/${encodeURIComponent(id)}`, { roles, attributes });
    if (!r.ok) { btn.disabled = false; return toast(fail(r.error), "bad"); }
    const rr = await changeRights(old, ids("#drawer [data-right]").map(c => c.dataset.right));
    closeDrawer();
    await loadPeople();
    refreshPeople();
    toast(rr.ok ? `Saved ${displayName(id)}` : `Saved ${displayName(id)}, but fga refused a right: ${fail(rr.error)}`, rr.ok ? "ok" : "bad");
  };
  acts.disablePerson = d => confirmBox(`Disable ${displayName(d.id)}?`,
    `<p>They can no longer sign in or do anything, and nothing shared with them works any more. AI agents acting for them stop too.</p>` +
    `<p class="muted small">fga keeps the person, so its audit log still says who did what. Disabling is final: fga has no way to enable someone again.</p>`,
    "Disable", () => disablePerson(d.id, false));
  // fga refuses (409) to disable the last person who can open some
  // end-to-end encrypted files, with a count per space and never a file
  // name, since it keeps no other copy of their keys. The administrator may
  // confirm, and the request is repeated with confirm_unreadable.
  async function disablePerson(id, confirmed) {
    const r = await api("POST", `/api/admin/people/${encodeURIComponent(id)}/disable`, confirmed ? { confirm_unreadable: true } : undefined);
    const lost = !confirmed && r.status === 409 && r.data && Array.isArray(r.data.unreadable) ? r.data.unreadable : [];
    if (lost.length) {
      const n = lost.reduce((s, u) => s + (Number(u.files) || 0), 0), who = esc(displayName(id));
      return confirmBox(`Disable ${displayName(id)} anyway?`,
        `<div class="banner bad">${icon("warn")}<span>${who} is the only person who can open ${plural(n, "file")} in end-to-end encrypted spaces.</span></div>` +
        `<table class="mini-tbl"><thead><tr><th>Space</th><th>Files</th></tr></thead><tbody>` +
          lost.map(u => `<tr><td>${esc(u.bucket)}</td><td>${esc(String(u.files))}</td></tr>`).join("") + `</tbody></table>` +
        `<p>fga keeps no other copy of these files' keys. Once ${who} is disabled, nobody can ever open them again: not fga, not an administrator. Disabling is final.</p>` +
        `<p class="muted small">Cancel if these files are still needed.</p>`,
        `Disable and lose ${plural(n, "file")}`, () => disablePerson(id, true));
    }
    if (!r.ok) return toast(fail(r.error), "bad");
    await loadPeople();
    refreshPeople();
    toast(`${displayName(id)} is disabled`, "ok");
  }

  // ---------------------------------------------------------------- rights and profiles

  routes["/admin/rights"] = async () => {
    shell("Rights", "", `<div class="page">${loading("Loading…")}</div>`);
    const [rr, pr] = await Promise.all([loadRights(), loadPeople()]);
    if (!rr.ok) return shell("Rights", "", `<div class="page">${pageHead("Rights")}${loading(fail(rr.error))}</div>`);
    const holding = id => people.filter(p => !p.disabled && heldRights(p).includes(id)).length;
    const matching = x => people.filter(p => !p.disabled && sameSet(heldRights(p), x.rights)).length;
    shell("Rights", "", `<div class="page">${pageHead("Rights",
      "A right is the most someone may ever do, such as sharing files. Without it, no rule can allow it; the rules then decide where it applies. In fga each right is a set of permissions given to the person.",
      `<button class="btn primary" data-act="editProfile" data-new="1">${icon("plus")}New profile</button>`)}` +
      `<div class="card"><div class="card-head"><h3>Rights</h3><span class="muted small">Give or take them on a person, or for many people at once under People</span></div>` +
      `<table class="tbl"><thead><tr><th>Right</th><th class="hide-sm">Applies to</th><th class="num">People</th></tr></thead><tbody>` +
      rights.map(r => `<tr><td><b>${esc(r.name)}</b><div class="muted small">${esc(r.help)}</div></td>` +
        `<td class="hide-sm"><div class="chips">${Object.keys(r.capabilities).map(t => `<span class="chip" title="${esc(r.capabilities[t].map(a => W.action(a, t).label).join(", "))}">${esc(W.type(t).many)}</span>`).join("")}</div></td>` +
        `<td class="num">${pr.ok ? `<a class="small" href="#/admin/people?right=%2B${encodeURIComponent(r.id)}">${holding(r.id)}</a>` : "–"}</td></tr>`).join("") + `</tbody></table></div>` +
      `<div class="card spaced"><div class="card-head"><h3>Profiles</h3><span class="muted small">Ready-made sets of rights to start from; kept by the console</span></div>` +
      `<table class="tbl"><thead><tr><th>Profile</th><th class="hide-sm">Rights</th><th class="num">People</th></tr></thead><tbody>` +
      profiles.map(x => `<tr class="clickable" data-act="editProfile" data-id="${esc(x.id)}"><td><b>${esc(x.name)}</b><div class="muted small">${esc(x.help)}</div></td>` +
        `<td class="hide-sm"><div class="chips">${x.rights.map(r => `<span class="chip on">${esc(rightName(r))}</span>`).join("") || '<span class="muted small">none</span>'}</div></td>` +
        `<td class="num">${pr.ok ? matching(x) : "–"}</td></tr>`).join("") + `</tbody></table></div></div>`);
  };
  acts.editProfile = d => {
    const isNew = d.new === "1", x = isNew ? { id: "", name: "", help: "", rights: [] } : profiles.find(y => y.id === d.id);
    openDrawer(isNew ? "New profile" : x.name,
      `<label class="field"><span>Name</span><input class="input" id="fProfName" value="${esc(x.name)}" placeholder="Member who cannot export"></label>` +
      `<label class="field"><span>What it is for</span><input class="input" id="fProfHelp" value="${esc(x.help)}"></label>` +
      `<div class="field"><span>Rights</span>${rights.map(r => checkRow(`data-pr="${esc(r.id)}"`, x.rights.includes(r.id), r.name, r.help)).join("")}</div>` +
      `<p class="muted small">A profile only fills in rights when applied; changing it later changes nobody's rights.</p>`,
      (isNew ? "" : `<button class="btn danger" data-act="removeProfile" data-id="${esc(x.id)}">Remove</button><span class="spacer"></span>`) +
      `<button class="btn" data-act="closeDrawer">Cancel</button><button class="btn primary" data-act="saveProfile" data-id="${esc(x.id)}" data-new="${isNew ? 1 : 0}">Save</button>`);
  };
  async function putProfiles(list, done) {
    const r = await api("PUT", "/api/admin/profiles", { profiles: list });
    if (!r.ok) return toast(fail(r.error), "bad");
    closeDrawer();
    toast(done, "ok");
    C.route();
  }
  acts.saveProfile = d => {
    const name = val("fProfName").trim(), help = val("fProfHelp").trim(), rs = ids("#drawer [data-pr]").map(c => c.dataset.pr);
    if (!name) return toast("Give the profile a name", "bad");
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "profile";
    let id = d.new === "1" ? slug : d.id;
    for (let i = 2; d.new === "1" && profiles.some(x => x.id === id); i++) id = `${slug}-${i}`;
    const list = profiles.filter(x => x.id !== id).concat([{ id, name, help, rights: rs }]);
    putProfiles(list, `Saved the profile ${name}`);
  };
  acts.removeProfile = d => confirmBox("Remove this profile?", `<p>Nobody loses a right: a profile only fills in rights when applied.</p>`, "Remove",
    () => putProfiles(profiles.filter(x => x.id !== d.id), "Removed the profile"));

  // ---------------------------------------------------------------- AI agents

  const expired = d => d.revoked || Date.parse(d.expires_at) <= Date.now();
  routes["/admin/agents"] = async () => {
    shell("AI agents", "", `<div class="page wide">${loading("Asking fga…")}</div>`);
    const [dr] = await Promise.all([loadAll("/api/admin/delegations"), loadRights(), loadPeople()]);
    if (!dr.ok) return shell("AI agents", "", `<div class="page">${pageHead("AI agents")}${loading(fail(dr.error))}</div>`);
    delegations = dr.items.sort((a, b) => expired(a) - expired(b) || Date.parse(b.expires_at) - Date.parse(a.expires_at));
    shell("AI agents", "", `<div class="page wide">${pageHead("AI agents",
      "Permissions for software to act for a person. When it does, the rules look at that person, and the agent may do only what its own permissions and this permission both allow.",
      `<button class="btn primary" data-act="newDlg">${icon("link")}Let an agent act for someone</button>`)}` +
      `<div class="card">${delegations.length ? `<table class="tbl"><thead><tr><th>Agent</th><th>Acts for</th><th class="hide-sm">May</th><th>Until</th><th>Status</th><th></th></tr></thead><tbody>` +
        delegations.map(x => `<tr><td><div class="who">${avatar(x.actor, "sm")}<b>${esc(x.actor)}</b></div></td><td><div class="who">${avatar(x.subject, "sm")}<span>${esc(x.subject)}</span></div></td>` +
          `<td class="hide-sm"><div class="chips">${Object.entries(x.grants || {}).map(([t, a]) => `<span class="chip" title="${esc(a.map(y => W.action(y, t).label).join(", "))}">${esc(W.type(t).many)} · ${a.length}</span>`).join("")}</div></td>` +
          `<td class="muted nowrap">${esc(when(x.expires_at))}</td><td><span class="badge ${expired(x) ? "muted" : "ok"}">${x.revoked ? "Revoked" : expired(x) ? "Expired" : "Running"}</span></td>` +
          `<td class="actions">${expired(x) ? "" : `<button class="btn sm danger" data-act="revokeDlg" data-id="${esc(x.id)}" data-a="${esc(x.actor)}" data-s="${esc(x.subject)}">Revoke</button>`}</td></tr>`).join("") +
        `</tbody></table>` : `<div class="empty">${icon("link")}<div>No agent acts for anyone.</div></div>`}</div></div>`);
  };
  acts.newDlg = () => {
    const caps = capsFor(rights.map(r => r.id));
    const audiences = [...new Set(delegations.map(x => x.audience))];
    const ppl = `<datalist id="dlgPeople">${people.filter(p => !p.disabled).map(p => `<option value="${esc(p.id)}">${esc(displayName(p.id))}</option>`).join("")}</datalist>`;
    const DEFAULT = { "storage.bucket": ["list"], "storage.object": ["discover", "stat", "read"], "document.version": ["discover", "read-units"], "agent.tool": ["discover", "invoke"] };
    openDrawer("Let an agent act for someone",
      `<label class="field"><span>Agent</span><input class="input" id="fDlgActor" list="dlgPeople" placeholder="agent-7" autocomplete="off"><small>The agent's own sign-in name.</small></label>` +
      `<label class="field"><span>Acts for</span><input class="input" id="fDlgSubject" list="dlgPeople" placeholder="bob" autocomplete="off"></label>${ppl}` +
      `<label class="field"><span>Where it presents itself</span><input class="input" id="fDlgAud" value="${esc(audiences[0] || "")}" list="dlgAud" autocomplete="off">` +
      `<datalist id="dlgAud">${audiences.map(a => `<option value="${esc(a)}">`).join("")}</datalist><small>The audience fga checks, such as the AI assistant gateway's name.</small></label>` +
      `<div class="field"><span>For how long</span><div class="seg">${[["1h", "1 hour"], ["24h", "1 day"], ["168h", "7 days"], ["720h", "30 days"]].map(([h, t]) =>
        `<label class="seg-opt"><input type="radio" name="fDlgFor" value="${h}" ${h === "24h" ? "checked" : ""}>${t}</label>`).join("")}</div></div>` +
      `<div class="field"><span>What it may do for them</span>` + Object.keys(caps).map(t => `<details class="group" ${DEFAULT[t] ? "open" : ""}><summary>${esc(W.type(t).many)}</summary>` +
        `<div class="check-grid">${caps[t].map(a => `<label class="check" title="${esc(W.action(a, t).help)}"><input type="checkbox" data-dt="${esc(t)}" data-da="${esc(a)}" ` +
          `${(DEFAULT[t] || []).includes(a) ? "checked" : ""}>${esc(W.action(a, t).label)}</label>`).join("")}</div></details>`).join("") +
      `<small>Never more than the person may do themselves: the rules still decide for the person.</small></div>`,
      `<button class="btn" data-act="closeDrawer">Cancel</button><button class="btn primary" data-act="saveDlg">Allow</button>`);
  };
  acts.saveDlg = async () => {
    const actor = val("fDlgActor").trim(), subject = val("fDlgSubject").trim(), audience = val("fDlgAud").trim();
    const grants = {};
    for (const c of ids("#drawer [data-dt]")) (grants[c.dataset.dt] = grants[c.dataset.dt] || []).push(c.dataset.da);
    if (!actor || !subject || !audience) return toast("Give the agent, the person and where it presents itself", "bad");
    if (!Object.keys(grants).length) return toast("Choose at least one thing it may do", "bad");
    const base = `dlg-${subject.split(".")[0]}-${actor}`.replace(/[^A-Za-z0-9._:-]/g, "-").slice(0, 100);
    let id = base;
    for (let i = 2; delegations.some(x => x.id === id); i++) id = `${base}-${i}`;
    const r = await api("POST", "/api/admin/delegations", { id, actor, subject, audience, grants,
      expires_in: (document.querySelector("#drawer input[name=fDlgFor]:checked") || { value: "24h" }).value });
    if (!r.ok) return toast(fail(r.error), "bad");
    closeDrawer();
    toast(`${actor} may now act for ${subject}`, "ok");
    C.route();
  };
  acts.revokeDlg = d => confirmBox("Revoke this permission?", `<p>${esc(d.a)} stops acting for ${esc(d.s)} at once, including anything it is doing now.</p>`, "Revoke", async () => {
    const r = await api("POST", `/api/admin/delegations/${encodeURIComponent(d.id)}/revoke`);
    if (!r.ok) return toast(fail(r.error), "bad");
    toast("Revoked", "ok");
    C.route();
  });

  // ---------------------------------------------------------------- data sources and data tools

  // A data source is a device or system that sends readings. fga splits
  // each reading into field groups, each with its own sensitivity and, end
  // to end encrypted, its own readers, so people and agents get only the
  // groups they may read. A second administrator reviews every change. A
  // data tool is a view of a source's readings that agents call through
  // MCP; it grants nothing, and each call reads only what the caller may.
  let sources = [], tools = [], sb = null, tb = null;
  const enc = encodeURIComponent;
  async function loadData() {
    const [sr, tr] = await Promise.all([loadAll("/api/admin/sources"), loadAll("/api/admin/data-tools")]);
    if (sr.ok) sources = sr.items;
    if (tr.ok) tools = tr.items;
    return sr.ok ? tr : sr;
  }
  const defOf = v => (v && v.definition) || null;
  const versionText = (x, step) => [x.active ? `version ${x.active.version}` : "", x.draft ? `draft ${x.draft.version} to ${step}` : ""]
    .filter(Boolean).join(", ") || "none";
  const senders = id => people.filter(p => !p.disabled && p.roles.includes("source") &&
    (Array.isArray(p.attributes.sources) ? p.attributes.sources : []).includes(id)).map(p => p.id);
  const groupChips = def => (def ? def.groups : []).map(g => `<span class="chip" title="${esc(g.fields.join(", "))}">${esc(g.name)} · ` +
    `${esc(W.label(g.label).name)}${g.recipients ? ` · ${esc(plural(g.recipients.length, "reader"))}` : ""}</span>`).join("");
  const LABEL_NAMES = ["public", "internal", "confidential", "restricted"];
  const labelOptions = cur => LABEL_NAMES.map(l => `<option value="${l}" ${l === cur ? "selected" : ""}>${esc(W.label(l).name)}</option>`).join("");
  const radio = (name, act, cur, opts) => opts.map(([v, t]) => `<label class="check"><input type="radio" name="${name}" value="${v}" ` +
    `data-on-change="${act}" ${v === cur ? "checked" : ""}>${esc(t)}</label>`).join("");
  const reviewable = x => x.draft && x.draft.author !== C.session().person;

  routes["/admin/sources"] = async () => {
    shell("Data sources", "", `<div class="page wide">${loading("Asking fga…")}</div>`);
    const [r] = await Promise.all([loadData(), loadPeople()]);
    if (!r.ok) return shell("Data sources", "", `<div class="page">${pageHead("Data sources")}${loading(fail(r.error))}</div>`);
    shell("Data sources", "", `<div class="page wide">${pageHead("Data sources",
      `Devices and systems that ${esc(W.action("post-reading").label.toLowerCase())}. fga splits each reading into field groups; each group has its own sensitivity, so people and agents see only the groups they may read.`,
      `<button class="btn primary" data-act="editSource">${icon("plus")}New data source</button>`)}` +
      `<div class="card">${sources.length ? `<table class="tbl"><thead><tr><th>Source</th><th>Field groups</th><th class="hide-sm">Sent by</th><th>Version</th><th></th></tr></thead><tbody>` +
        sources.map(s => `<tr><td><div class="obj">${icon(s.encryption === "client" ? "lock" : "upload")}<span><b>${esc(s.id)}</b>` +
          `<small class="muted"> ${esc(s.project)} · ${esc(W.encryption(s.encryption).name)}</small></span></div></td>` +
          `<td><div class="chips">${groupChips(defOf(s.active || s.draft))}</div></td>` +
          `<td class="hide-sm">${esc(senders(s.id).join(", ") || "nobody yet")}<br><a href="#/admin/sources" class="small" data-act="sendHelp" ` +
            `data-id="${esc(s.id)}">How to send</a></td>` +
          `<td class="muted">${s.disabled ? "Stopped" : esc(versionText(s, "review"))}</td><td class="actions">` + (s.disabled ? "" :
            (reviewable(s) ? `<button class="btn sm primary" data-act="reviewSource" data-id="${esc(s.id)}">Review</button>` : "") +
            `<button class="btn sm" data-act="editSource" data-id="${esc(s.id)}">Change</button>`) + `</td></tr>`).join("") +
        `</tbody></table>` : `<div class="empty">${icon("upload")}<div>No data sources yet.</div></div>`}</div></div>`);
  };

  // The source builder keeps its state in sb; structural changes draw the
  // drawer again, typing only updates sb.
  acts.editSource = d => {
    const s = sources.find(x => x.id === d.id), def = s && defOf(s.draft || s.active);
    sb = !def ? { isNew: true, id: "", mode: "server", project: "", label: "internal", owner: "", fields: [], assign: {}, sample: "",
      groups: [{ name: "reading", label: "internal", recipients: "" }], keyMode: "pointer", keyField: "", pattern: "[a-z0-9-]{1,48}", prefix: "", unlisted: "refuse" } :
      { isNew: false, id: s.id, mode: s.encryption, project: s.project, label: s.label, owner: def.owner, sample: "",
        groups: def.groups.map(g => ({ name: g.name, label: g.label, recipients: (g.recipients || []).join(", ") })),
        fields: [...new Set([...def.groups.flatMap(g => g.fields), ...(def.key.pointer ? [def.key.pointer] : [])])],
        assign: Object.fromEntries(def.groups.flatMap(g => g.fields.map(f => [f, g.name]))),
        keyMode: def.key.mode, keyField: def.key.pointer || "", pattern: def.key.pattern || "", prefix: def.key.prefix || "", unlisted: def.unlisted || "refuse" };
    sourceDrawer();
  };
  function sourceDrawer() {
    const s = sb, client = s.mode === "client";
    const groupOptions = cur => `<option value="">Not kept</option>` + s.groups.map(g => `<option ${g.name === cur ? "selected" : ""}>${esc(g.name)}</option>`).join("");
    const input = (k, v, ph = "", extra = "") => `<input class="input" value="${esc(v)}" placeholder="${esc(ph)}" data-on-change="sbSet" data-k="${k}" autocomplete="off" ${extra}>`;
    openDrawer(s.isNew ? "New data source" : `Change ${s.id}`,
      (s.isNew ? `<label class="field"><span>Name</span>${input("id", s.id, "greenhouse-climate")}<small>Also the name of its space. Lowercase letters, digits and dashes.</small></label>` +
        `<label class="field"><span>Project</span>${input("project", s.project, "p1", `list="sbProjects"`)}<datalist id="sbProjects">${allProjects().map(x => `<option value="${esc(x)}">`).join("")}</datalist></label>` +
        `<label class="field"><span>Default sensitivity</span><select class="input" data-on-change="sbSet" data-k="label">${labelOptions(s.label)}</select></label>` +
        `<div class="field"><span>Encryption</span>${radio("sbMode", "sbMode", s.mode, [["server", W.encryption("server").name], ["client", W.encryption("client").name]])}</div>` : "") +
      `<label class="field"><span>Owner of the readings</span>${input("owner", s.owner, "lena", `list="sbPeople"`)}<datalist id="sbPeople">${people.filter(p => !p.disabled).map(p => `<option value="${esc(p.id)}">`).join("")}</datalist></label>` +
      `<label class="field"><span>A sample reading</span><textarea class="input mono" rows="4" data-on-change="sbSet" data-k="sample" placeholder='{"sensor":"gh-1","temperature":21.5}'>${esc(s.sample)}</textarea>` +
      `<small>Made-up values are fine: only the field names are used, and the sample is tested when you save.</small></label>` +
      `<button class="btn sm" data-act="sbFields">Read its fields</button>` +
      `<div class="field"><span>Field groups</span><table class="tbl"><thead><tr><th>Group</th><th>Sensitivity</th>${client ? "<th>Readers</th>" : ""}</tr></thead><tbody>` +
        s.groups.map((g, i) => `<tr><td><input class="input" value="${esc(g.name)}" data-on-change="sbGroup" data-i="${i}" data-k="name"></td>` +
          `<td><select class="input" data-on-change="sbGroup" data-i="${i}" data-k="label">${labelOptions(g.label)}</select></td>` +
          (client ? `<td><input class="input" value="${esc(g.recipients)}" placeholder="lena, alice" data-on-change="sbGroup" data-i="${i}" data-k="recipients"></td>` : "") + `</tr>`).join("") +
      `</tbody></table><button class="btn sm" data-act="sbAddGroup">${icon("plus")}Add group</button>` +
      `<small>${client ? "Readers get a key for their groups' sections of every reading." : "The rules decide who reads each group, by its sensitivity and its name."}</small></div>` +
      `<div class="field"><span>Fields</span>${s.fields.length ? `<table class="tbl"><thead><tr><th>Field</th><th>Group</th><th>Names the device</th></tr></thead><tbody>` +
        s.fields.map(f => `<tr><td><code>${esc(f)}</code></td><td><select class="input" data-on-change="sbAssign" data-f="${esc(f)}">${groupOptions(s.assign[f])}</select></td>` +
          `<td><input type="radio" name="sbKeyField" value="${esc(f)}" data-on-change="sbSet" data-k="keyField" ${f === s.keyField ? "checked" : ""}></td></tr>`).join("") +
        `</tbody></table>` : `<div class="muted small">Paste a sample and read its fields.</div>`}</div>` +
      `<div class="field"><span>Which document a reading goes to</span>${radio("sbKeyMode", "sbKeyMode", s.keyMode, [["pointer", "One per device, named by the chosen field"],
        ["principal", "One per sending system"], ["fixed", "Always the same document"]])}` +
        `<div class="row">${s.keyMode === "fixed" ? "" : `<label class="field"><span>Allowed names</span>${input("pattern", s.pattern, "[a-z0-9-]{1,48}")}</label>`}` +
        `<label class="field"><span>${s.keyMode === "fixed" ? "Document name" : "Name prefix"}</span>${input("prefix", s.prefix, "sensor/")}</label></div></div>` +
      `<div class="field"><span>Fields not in any group</span>${radio("sbUnlisted", "sbUnlisted", s.unlisted, [["refuse", "Refuse the reading"], ["drop", "Leave them out"]])}</div>`,
      (s.isNew ? "" : `<button class="btn danger" data-act="stopSource" data-id="${esc(s.id)}">Stop readings</button><span class="spacer"></span>`) +
      `<button class="btn" data-act="closeDrawer">Cancel</button><button class="btn primary" data-act="saveSource">Save draft</button>`, { wide: true });
  }
  acts.sbSet = (d, el) => { sb[d.k] = el.value; };
  acts.sbMode = (d, el) => { sb.mode = el.value; sourceDrawer(); };
  acts.sbKeyMode = (d, el) => { sb.keyMode = el.value; sourceDrawer(); };
  acts.sbUnlisted = (d, el) => { sb.unlisted = el.value; };
  acts.sbAssign = (d, el) => { sb.assign[d.f] = el.value; };
  acts.sbGroup = (d, el) => {
    const g = sb.groups[Number(d.i)], old = g.name;
    g[d.k] = el.value;
    if (d.k === "name") { for (const f of sb.fields) if (sb.assign[f] === old) sb.assign[f] = el.value; sourceDrawer(); }
  };
  acts.sbAddGroup = () => { sb.groups.push({ name: `group${sb.groups.length + 1}`, label: sb.label || "internal", recipients: "" }); sourceDrawer(); };
  acts.sbFields = () => {
    let v;
    try { v = JSON.parse(sb.sample); } catch { return toast("The sample is not JSON", "bad"); }
    if (!v || typeof v !== "object" || Array.isArray(v)) return toast("A reading is one JSON object", "bad");
    sb.fields = Object.keys(v).map(k => "/" + k.replace(/~/g, "~0").replace(/\//g, "~1"));
    for (const f of sb.fields) if (!(f in sb.assign)) sb.assign[f] = sb.groups[0].name;
    if (!sb.keyField) sb.keyField = sb.fields.find(f => /sensor|device|id/.test(f)) || "";
    sourceDrawer();
  };
  function sourceRecord(s) {
    const bad = t => (toast(t, "bad"), null);
    if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(s.id)) return bad("Name it with lowercase letters, digits and dashes");
    if (!s.owner.trim()) return bad("Name the owner of the readings");
    if (s.isNew && !s.project.trim()) return bad("Give the source a project");
    const groups = s.groups.map(g => ({ name: g.name.trim(), label: g.label, fields: s.fields.filter(f => s.assign[f] === g.name),
      ...(s.mode === "client" ? { recipients: g.recipients.split(",").map(x => x.trim()).filter(Boolean) } : {}) })).filter(g => g.fields.length);
    if (!groups.length) return bad("Put at least one field into a group");
    if (s.keyMode === "pointer" && !s.keyField) return bad("Choose the field that names the device");
    const key = s.keyMode === "fixed" ? { mode: "fixed", prefix: s.prefix } : { mode: s.keyMode, pattern: s.pattern, prefix: s.prefix,
      ...(s.keyMode === "pointer" ? { pointer: s.keyField } : {}) };
    return { format: "fga.source/v1", id: s.id, owner: s.owner.trim(), key, groups, ...(s.unlisted === "drop" ? { unlisted: "drop" } : {}) };
  }
  acts.saveSource = async () => {
    const s = sb, rec = sourceRecord(s);
    if (!rec) return;
    const r = s.isNew ? await api("POST", "/api/admin/sources", { bucket: { name: s.id, project: s.project.trim(), label: s.label, encryption: s.mode }, source: rec })
      : await api("PUT", `/api/admin/sources/${enc(s.id)}`, rec);
    if (!r.ok) return toast(fail(r.error), "bad");
    let tried = "";
    if (s.sample.trim()) {
      const t = await api("POST", `/api/admin/sources/${enc(s.id)}/try`, { payload: JSON.parse(s.sample) });
      tried = !t.ok ? ` The sample could not be tested: ${fail(t.error)}` : t.data.refused ? ` The sample would be refused: ${t.data.refused}${t.data.pointer ? ` (${t.data.pointer})` : ""}.` :
        ` The sample goes to ${t.data.key}, in ${plural(t.data.units.length, "section")}.`;
    }
    closeDrawer();
    toast(`Saved draft version ${r.data.version}. Another administrator reviews it.${tried}`, "ok");
    C.route();
  };
  acts.reviewSource = d => {
    const s = sources.find(x => x.id === d.id), v = s.draft, def = defOf(v);
    confirmBox(`Review ${s.id}?`, `<p>Draft version ${v.version}, written by ${esc(v.author)}. New readings will be split into:</p>` +
      `<div class="chips">${groupChips(def)}</div><p class="muted small">Readings already stored keep their groups. Sensitivities are as shown; rules decide who reads each.</p>`,
      "Review and activate", async () => {
        const r = await api("POST", `/api/admin/sources/${enc(s.id)}/review`, { version: v.version, digest: v.digest });
        if (!r.ok) return toast(fail(r.error), "bad");
        const broken = r.data.breaks_data_tools || [];
        toast(broken.length ? `Active. These data tools no longer fit and need a new version: ${broken.join(", ")}` : "Active: new readings are split this way", broken.length ? "bad" : "ok");
        C.route();
      }, "primary");
  };
  acts.stopSource = d => confirmBox(`Stop ${d.id}?`, "<p>fga accepts no more readings for it. Its readings stay, and its data tools keep answering. This cannot be undone.</p>",
    "Stop", async () => {
      const r = await api("POST", `/api/admin/sources/${enc(d.id)}/disable`);
      if (!r.ok) return toast(fail(r.error), "bad");
      toast(`${d.id} accepts no more readings`, "ok");
      C.route();
    });
  acts.sendHelp = d => {
    const s = sources.find(x => x.id === d.id), who = senders(s.id);
    openDrawer(`How to send to ${s.id}`, `<p>A sending system is a person record with the role ${tech("source")}, its sources (${tech(`"sources": ["${s.id}"]`)}) and the ` +
      `${tech(s.encryption === "client" ? "source-client" : "source")} rights. Its token comes from your organisation's login, never from this console.</p>` +
      `<p>${who.length ? `Sent by ${esc(who.join(", "))}.` : "Nobody sends to it yet."}</p>` +
      (s.encryption === "client" ? `<pre class="code">fga post-reading -source ${esc(s.id)} -in reading.json</pre><p class="muted small">The device encrypts each group for its readers; fga never sees the values.</p>`
        : `<pre class="code">curl -X POST "$FGA_STORAGE/v1/sources/${esc(s.id)}/readings" \\\n  -H "Authorization: Bearer $DEVICE_TOKEN" \\\n  -H "Content-Type: application/json" --data @reading.json</pre>`),
      `<button class="btn" data-act="closeDrawer">Close</button>`);
  };

  routes["/admin/data-tools"] = async () => {
    shell("Data tools", "", `<div class="page wide">${loading("Asking fga…")}</div>`);
    const [r] = await Promise.all([loadData(), loadPeople()]);
    if (!r.ok) return shell("Data tools", "", `<div class="page">${pageHead("Data tools")}${loading(fail(r.error))}</div>`);
    shell("Data tools", "", `<div class="page wide">${pageHead("Data tools",
      "Named views of a data source's readings that AI agents call. A tool gives nobody access: each call returns only the fields the caller may read.",
      `<button class="btn primary" data-act="editTool">${icon("plus")}New data tool</button>`)}` +
      `<div class="card">${tools.length ? `<table class="tbl"><thead><tr><th>Tool</th><th>Over</th><th class="hide-sm">Returns</th><th>Version</th><th></th></tr></thead><tbody>` +
        tools.map(t => { const def = defOf(t.active || t.draft);
          return `<tr><td><div class="obj">${icon("gear")}<span><b>${esc(t.name)}</b><small class="muted"> ${esc(def ? def.description : "")}</small></span></div></td>` +
            `<td>${esc(t.source)}</td><td class="hide-sm"><div class="chips">${(def ? def.outputs : []).map(o => `<span class="chip" title="${esc(o.group + " " + o.field)}">${esc(o.name)}</span>`).join("")}</div></td>` +
            `<td class="muted">${t.disabled ? "Turned off" : esc(versionText(t, "publish"))}</td><td class="actions">` + (t.disabled ? "" :
              (t.draft ? `<button class="btn sm primary" data-act="publishTool" data-id="${esc(t.name)}">Publish</button>` : "") +
              `<button class="btn sm" data-act="editTool" data-id="${esc(t.name)}">Change</button>` +
              `<button class="btn sm danger" data-act="offTool" data-id="${esc(t.name)}">Turn off</button>`) + `</td></tr>`; }).join("") +
        `</tbody></table>` : `<div class="empty">${icon("gear")}<div>No data tools yet.</div></div>`}</div></div>`);
  };
  const activeSources = () => sources.filter(s => !s.disabled && s.active);
  acts.editTool = d => {
    const t = tools.find(x => x.name === d.id), def = t && defOf(t.draft || t.active);
    const src = (def && def.source) || (activeSources()[0] || {}).id;
    if (!src) return toast("A data tool needs a data source with an active version first", "bad");
    tb = def ? { isNew: false, ...def, keys: Object.entries((def.select && def.select.keys) || {}).map(([v, k]) => `${v} = ${k}`).join("\n"),
      mode: def.select.fixed ? "fixed" : def.select.keys ? "enum" : "string", arg: def.select.argument || "sensor", fixed: def.select.fixed || "",
      max: def.history ? def.history.max_readings || "" : "", preview: "", answer: "" } :
      { isNew: true, name: "", description: "", source: src, operation: "latest", outputs: [], on_unreadable: "skip_fields", mode: "string", arg: "sensor",
        keys: "", fixed: "", max: "", preview: "", answer: "" };
    toolDrawer();
  };
  function toolDrawer() {
    const t = tb, src = sources.find(s => s.id === t.source), sdef = defOf(src && src.active);
    const out = (g, f) => t.outputs.find(o => o.group === g && o.field === f);
    const input = (k, v, ph = "") => `<input class="input" value="${esc(v)}" placeholder="${esc(ph)}" data-on-change="tbSet" data-k="${k}" autocomplete="off">`;
    openDrawer(t.isNew ? "New data tool" : `Change ${t.name}`,
      (t.isNew ? `<label class="field"><span>Over</span><select class="input" data-on-change="tbSource">${activeSources().map(s =>
        `<option ${s.id === t.source ? "selected" : ""}>${esc(s.id)}</option>`).join("")}</select></label>` +
        `<label class="field"><span>Name</span>${input("name", t.name, "read_climate")}<small>What agents call it: lowercase letters, digits and underscores.</small></label>` : "") +
      `<label class="field"><span>What it gives</span>${input("description", t.description, "Latest air temperature of one greenhouse.")}</label>` +
      `<div class="field"><span>Readings</span>${radio("tbOp", "tbOp", t.operation, [["latest", "The latest reading"], ["history", "Past readings, newest first"]])}` +
        (t.operation === "history" ? `<label class="field"><span>At most per call</span>${input("max", t.max, "50")}</label>` : "") + `</div>` +
      `<div class="field"><span>Which device</span>${radio("tbMode", "tbMode", t.mode, [["string", "The caller names it"], ["enum", "The caller picks from a list"], ["fixed", "Always the same"]])}` +
        (t.mode === "fixed" ? `<label class="field"><span>Document</span>${input("fixed", t.fixed, "sensor/gh-north-1")}</label>` :
          `<label class="field"><span>Argument</span>${input("arg", t.arg, "sensor")}</label>` +
          (t.mode === "enum" ? `<label class="field"><span>Choices</span><textarea class="input mono" rows="3" data-on-change="tbSet" data-k="keys" placeholder="north = sensor/gh-north-1">${esc(t.keys)}</textarea></label>` : "")) + `</div>` +
      `<div class="field"><span>Fields it returns</span>${sdef ? `<table class="tbl"><thead><tr><th></th><th>Field</th><th>Returned as</th><th>Kind</th></tr></thead><tbody>` +
        sdef.groups.flatMap(g => g.fields.map(f => { const o = out(g.name, f);
          return `<tr><td><input type="checkbox" data-on-change="tbOut" data-g="${esc(g.name)}" data-f="${esc(f)}" ${o ? "checked" : ""}></td>` +
            `<td><code>${esc(f)}</code> <small class="muted">${esc(g.name)} · ${esc(W.label(g.label).name)}</small></td>` +
            `<td>${o ? `<input class="input" value="${esc(o.name)}" data-on-change="tbOutName" data-g="${esc(g.name)}" data-f="${esc(f)}">` : ""}</td>` +
            `<td>${o ? `<select class="input" data-on-change="tbOutType" data-g="${esc(g.name)}" data-f="${esc(f)}">${["any", "number", "string", "boolean", "object", "array"].map(x =>
              `<option ${x === (o.type || "any") ? "selected" : ""}>${x}</option>`).join("")}</select>` : ""}</td></tr>`; })).join("") + `</tbody></table>` :
        `<div class="muted small">The source has no active version.</div>`}</div>` +
      `<div class="field"><span>When the caller may not read a group</span>${radio("tbUnreadable", "tbUnreadable", t.on_unreadable || "skip_reading",
        [["skip_fields", "Leave out that group's fields"], ["skip_reading", "Leave out the whole reading"]])}</div>` +
      `<div class="field"><span>Preview as yourself</span>${input("preview", t.preview, t.mode === "fixed" ? "{}" : `{"${t.arg}": "gh-1"}`)}` +
        `<button class="btn sm" data-act="previewTool">${icon("eye")}Preview</button>${t.answer ? `<pre class="code">${esc(t.answer)}</pre>` : ""}` +
        `<small>Runs the tool with your own access, as a call would${src && src.encryption === "client" ? "; end-to-end encrypted readings cannot be previewed here" : ""}.</small></div>`,
      `<button class="btn" data-act="closeDrawer">Cancel</button><button class="btn primary" data-act="saveTool">Save draft</button>`, { wide: true });
  }
  acts.tbSet = (d, el) => { tb[d.k] = el.value; };
  acts.tbSource = (d, el) => { tb.source = el.value; tb.outputs = []; toolDrawer(); };
  acts.tbOp = (d, el) => { tb.operation = el.value; toolDrawer(); };
  acts.tbMode = (d, el) => { tb.mode = el.value; toolDrawer(); };
  acts.tbUnreadable = (d, el) => { tb.on_unreadable = el.value; };
  acts.tbOut = (d, el) => {
    tb.outputs = tb.outputs.filter(o => !(o.group === d.g && o.field === d.f));
    if (el.checked) tb.outputs.push({ name: d.f.slice(1).replace(/[^a-z0-9_]/gi, "_").toLowerCase(), group: d.g, field: d.f, type: "any" });
    toolDrawer();
  };
  const outOf = d => tb.outputs.find(o => o.group === d.g && o.field === d.f);
  acts.tbOutName = (d, el) => { outOf(d).name = el.value; };
  acts.tbOutType = (d, el) => { outOf(d).type = el.value; };
  function toolRecord(t) {
    const bad = m => (toast(m, "bad"), null);
    if (!/^[a-z][a-z0-9_]{0,63}$/.test(t.name)) return bad("Name it with lowercase letters, digits and underscores, starting with a letter");
    if (!t.description.trim()) return bad("Say what it gives");
    if (!t.outputs.length) return bad("Choose at least one field");
    const arg = t.arg.trim(), select = t.mode === "fixed" ? { fixed: t.fixed.trim() } : { argument: arg };
    const args = [];
    if (t.mode === "enum") {
      select.keys = Object.fromEntries(t.keys.split("\n").map(l => l.split("=").map(x => x.trim())).filter(([v, k]) => v && k));
      args.push({ name: arg, type: "enum", values: Object.keys(select.keys) });
    } else if (t.mode === "string") args.push({ name: arg, type: "string" });
    return { format: "fga.data-tool/v1", name: t.name, description: t.description.trim(), source: t.source, operation: t.operation,
      ...(args.length ? { arguments: args } : {}), select, outputs: t.outputs.map(o => ({ name: o.name, group: o.group, field: o.field, ...(o.type && o.type !== "any" ? { type: o.type } : {}) })),
      on_unreadable: t.on_unreadable || "skip_reading", ...(t.operation === "history" && Number(t.max) ? { history: { max_readings: Number(t.max) } } : {}) };
  }
  acts.previewTool = async () => {
    const rec = toolRecord(tb);
    if (!rec) return;
    let args;
    try { args = JSON.parse(tb.preview || "{}"); } catch { return toast("The arguments are not JSON", "bad"); }
    const r = await api("POST", "/api/data-tools/preview", { definition: rec, arguments: args });
    tb.answer = r.ok ? JSON.stringify(r.data, null, 2) : `${fail(r.error)}${r.status === 404 ? ": nothing you may read" : ""}`;
    toolDrawer();
  };
  acts.saveTool = async () => {
    const rec = toolRecord(tb);
    if (!rec) return;
    const r = tb.isNew ? await api("POST", "/api/admin/data-tools", rec) : await api("PUT", `/api/admin/data-tools/${enc(rec.name)}`, rec);
    if (!r.ok) return toast(fail(r.error), "bad");
    closeDrawer();
    toast(`Saved draft version ${r.data.version}. Publish it to let agents use it.`, "ok");
    C.route();
  };
  acts.publishTool = d => {
    const t = tools.find(x => x.name === d.id), v = t.draft;
    confirmBox(`Publish ${t.name}?`, `<p>Draft version ${v.version}, written by ${esc(v.author)}. Agents and people the rules allow then see it as an MCP tool; ` +
      `each call returns only what the caller may read.</p>`, "Publish", async () => {
      const r = await api("POST", `/api/admin/data-tools/${enc(t.name)}/review`, { version: v.version, digest: v.digest });
      if (!r.ok) return toast(fail(r.error), "bad");
      toast(`${t.name} is published`, "ok");
      C.route();
    }, "primary");
  };
  acts.offTool = d => confirmBox(`Turn off ${d.id}?`, "<p>Agents no longer see or call it. This cannot be undone; a new tool needs a new name.</p>", "Turn off", async () => {
    const r = await api("POST", `/api/admin/data-tools/${enc(d.id)}/disable`);
    if (!r.ok) return toast(fail(r.error), "bad");
    toast(`${d.id} is turned off`, "ok");
    C.route();
  });

  // ---------------------------------------------------------------- spaces

  routes["/admin/spaces"] = async () => {
    shell("Spaces", "", `<div class="page">${loading("Asking fga…")}</div>`);
    const [sr] = await Promise.all([loadSpaces(), loadPeople()]);
    if (!sr.ok) return shell("Spaces", "", `<div class="page">${pageHead("Spaces")}${loading(fail(sr.error))}</div>`);
    shell("Spaces", "", `<div class="page">${pageHead("Spaces",
      "Each space belongs to one project and holds its files. In spaces encrypted by fga the rules alone decide who reads; in end-to-end encrypted spaces people also need a key from the owner.",
      `<button class="btn primary" data-act="newSpace">${icon("plus")}New space</button>`)}` +
      `<div class="card"><table class="tbl"><thead><tr><th>Space</th><th>Project</th><th class="hide-sm">Default sensitivity</th><th>Encryption</th></tr></thead><tbody>` +
      spacesList.map(b => `<tr><td><div class="obj">${icon(b.encryption === "client" ? "lock" : "bucket")}<b>${esc(b.name)}</b></div></td>` +
        `<td><a class="chip proj-chip" href="#/admin/people?project=${encodeURIComponent(b.project || "")}">${esc(b.project || "none")}</a></td>` +
        `<td class="hide-sm">${b.label ? esc(W.label(b.label).name) : "–"}</td><td>${esc(b.encryption ? W.encryption(b.encryption).name : "–")}</td></tr>`).join("") +
      `</tbody></table></div><p class="muted small">Removing a space needs a change in fga, which cannot remove spaces yet.</p></div>`);
  };
  acts.newSpace = () => openDrawer("New space",
    `<label class="field"><span>Name</span><input class="input" id="fSpace" placeholder="minutes" autocomplete="off"><small>Lowercase letters, digits, dots and dashes.</small></label>` +
    `<label class="field"><span>Project</span><input class="input" id="fSpaceProject" list="spProjects" placeholder="p1" autocomplete="off">` +
    `<datalist id="spProjects">${allProjects().map(x => `<option value="${esc(x)}">`).join("")}</datalist></label>` +
    `<label class="field"><span>Default sensitivity</span><select class="input" id="fSpaceLabel">${["public", "internal", "confidential", "restricted"].map(l =>
      `<option value="${l}" ${l === "internal" ? "selected" : ""}>${esc(W.label(l).name)}</option>`).join("")}</select></label>` +
    `<div class="field"><span>Encryption</span>${["server", "client"].map(m => `<label class="check big"><input type="radio" name="fMode" value="${m}" ${m === "server" ? "checked" : ""}>` +
      `<span><b>${esc(W.encryption(m).name)}</b><small>${esc(W.encryption(m).help)}</small></span></label>`).join("")}</div>`,
    `<button class="btn" data-act="closeDrawer">Cancel</button><button class="btn primary" data-act="saveSpace">Create</button>`);
  acts.saveSpace = async () => {
    const name = val("fSpace").trim(), project = val("fSpaceProject").trim();
    if (!/^[a-z0-9][a-z0-9.-]{1,62}$/.test(name)) return toast("Use lowercase letters, digits, dots and dashes", "bad");
    if (!project) return toast("Give the space a project", "bad");
    const r = await api("POST", "/api/admin/spaces", { name, project, label: val("fSpaceLabel"),
      encryption: (document.querySelector("#drawer input[name=fMode]:checked") || { value: "server" }).value });
    if (!r.ok) return toast(fail(r.error), "bad");
    closeDrawer();
    toast(`Created the space ${name}. Add it to the console's spaces setting so people see it under Files.`, "ok");
    C.route();
  };

  // ---------------------------------------------------------------- rules

  // A draft holds the rule files as fga's bundle has them; editing changes
  // the draft only, kept by the console until exported and signed.
  let draft = null;
  const docsOf = () => (draft ? draft.documents : (policy && policy.documents) || {});
  function allRules() {
    const out = [];
    for (const [file, doc] of Object.entries(docsOf())) (doc.rules || []).forEach((r, i) => out.push({ ...r, type: doc.resource, set: doc.set, file, index: i }));
    return out;
  }
  async function saveDraft() {
    const r = await api("PUT", "/api/admin/rules/draft", draft);
    if (!r.ok) toast(fail(r.error), "bad");
    return r.ok;
  }

  routes["/admin/rules"] = async () => {
    shell("Rules", "", `<div class="page">${loading("Asking fga…")}</div>`);
    const [pr, dr] = await Promise.all([api("GET", "/api/admin/rules"), api("GET", "/api/admin/rules/draft")]);
    if (!pr.ok) return shell("Rules", "", `<div class="page">${pageHead("Rules")}${loading(fail(pr.error))}</div>`);
    policy = pr.data;
    draft = dr.ok && dr.data.draft && dr.data.draft.base_digest === policy.digest ? dr.data.draft : null;
    const stale = dr.ok && dr.data.draft && !draft;
    const rules = allRules(), types = [...new Set(rules.map(r => r.type))].sort((a, b) => W.type(a).many.localeCompare(W.type(b).many));
    const sentence = r => {
      const w = W.rule(r);
      return `<b>${esc(w.who)}</b> ${w.verb} ${r.actions.map(a => `<span class="chip ${r.effect === "deny" ? "deny" : "on"}">${esc(W.action(a, r.type).label)}</span>`).join(" ")} ` +
        `on ${esc(w.what)}${w.when ? ` when ${esc(w.when.text)}` : ""}${w.when && w.when.custom ? ` ${tech(w.when.custom)}` : ""}`;
    };
    shell("Rules", draft ? "Editing a draft" : "", `<div class="page">${pageHead("Rules",
      `Version ${esc(String(policy.epoch))}, signed by ${esc(policy.key_id)}. Rules change only when a new version is signed outside the console; the signing key never reaches it.`,
      draft ? `<button class="btn" data-act="discardDraft">Discard draft</button><button class="btn" data-act="editRule" data-new="1">${icon("plus")}New rule</button>` +
        `<button class="btn primary" data-act="exportDraft">${icon("download")}Export draft</button>`
        : `<button class="btn primary" data-act="startDraft">Edit rules</button>`)}` +
      (stale ? `<div class="banner warn">${icon("warn")}<span>A saved draft was based on an older version of the rules and is not shown. Start a new one to replace it.</span></div>` : "") +
      (draft ? `<div class="banner warn">${icon("policy")}<span><b>Draft:</b> ${plural((draft.changes || []).length, "change")} from version ${esc(String(policy.epoch))}. ` +
        `Nothing changes in fga until the draft is signed and fga-decision restarts with it.</span></div>` : "") +
      types.map(t => `<div class="card spaced"><div class="card-head"><div><h3>${esc(W.type(t).many)} ${tech(t)}</h3><div class="muted small">${esc(W.type(t).help)}</div></div></div>` +
        rules.filter(r => r.type === t).map(r => `<div class="rule-row ${draft ? "clickable" : ""}" ${draft ? `data-act="editRule" data-file="${esc(r.file)}" data-i="${r.index}"` : ""}>` +
          `<span class="badge ${r.set === "ceiling" ? "deny solid" : r.effect}">${esc(W.rule(r).kind)}</span>` +
          `<div class="grow min0"><b>${esc(W.ruleTitle(r))}</b> ${tech(r.id)}<div class="sentence">${sentence(r)}</div></div></div>`).join("") + `</div>`).join("") + `</div>`);
  };
  acts.startDraft = async () => {
    draft = { format: "fga.policy-draft/v1", base_epoch: policy.epoch, base_digest: policy.digest, documents: JSON.parse(JSON.stringify(policy.documents)), changes: [] };
    if (await saveDraft()) C.route();
  };
  acts.discardDraft = () => confirmBox("Discard the draft?", `<p>Its ${plural((draft.changes || []).length, "change")} are lost. The rules in force do not change.</p>`, "Discard", async () => {
    await api("DELETE", "/api/admin/rules/draft");
    draft = null;
    C.route();
  });
  acts.exportDraft = () => {
    const out = { ...draft, epoch: policy.epoch + 1, instructions: [
      "Write each entry of documents to the bundle folder under its name (for example policies/buckets.json), keeping manifest.json.",
      `Sign it on the computer that keeps the publisher key: fga policy sign -key publisher.key -key-id ${policy.key_id} -epoch ${policy.epoch + 1} bundle`,
      "Restart fga-decision with the signed bundle." ] };
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: "application/json" }));
    a.download = `fga-rules-draft-${policy.epoch + 1}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast("Draft exported. Sign it outside the console, then restart fga-decision with it.", "ok");
  };

  // The rule form: kind of thing, effect, who, what and only when.
  let rf = null;
  const actionsFor = t => [...new Set([...allRules().filter(r => r.type === t).flatMap(r => r.actions), ...(capsFor(rights.map(r => r.id))[t] || [])])].sort();
  acts.editRule = async d => {
    if (!rights.length) await loadRights();
    const r = d.new === "1" ? null : docsOf()[d.file].rules[Number(d.i)];
    const doc = r ? docsOf()[d.file] : null, m = W.matchCondition(r ? r.when : "");
    rf = r ? { file: d.file, i: Number(d.i), id: r.id, type: doc.resource, ceiling: doc.set === "ceiling", effect: r.effect, roles: new Set(r.roles), actions: new Set(r.actions), conds: new Set(m.ids), custom: m.custom }
      : { file: null, id: "", type: "storage.object", ceiling: false, effect: "allow", roles: new Set(), actions: new Set(), conds: new Set(["project"]), custom: "" };
    openDrawer(r ? "Edit rule" : "New rule", `<div id="rfForm"></div>`,
      (r ? `<button class="btn danger" data-act="removeRule">Remove rule</button><span class="spacer"></span>` : "") +
      `<button class="btn" data-act="closeDrawer">Cancel</button><button class="btn primary" data-act="saveRule">Save to draft</button>`, { wide: true });
    rfRender();
  };
  function rfRule() {
    return { type: rf.type, set: rf.ceiling ? "ceiling" : "business", effect: rf.ceiling ? "deny" : rf.effect, roles: [...rf.roles], actions: [...rf.actions],
      when: W.conditionExpr([...rf.conds], rf.custom, [...rf.actions]) };
  }
  function rfRender() {
    const t = rf.type, roles = [...new Set(["*", ...people.flatMap(p => p.roles), ...allRules().flatMap(r => r.roles), ...rf.roles])];
    const types = [...new Set([...Object.keys(W.TYPES), ...allRules().map(r => r.type)])].sort((a, b) => W.type(a).many.localeCompare(W.type(b).many));
    document.getElementById("rfForm").innerHTML =
      `<label class="field"><span>About</span><select class="input" data-on-change="rfType" ${rf.file ? "disabled" : ""}>${types.map(x => `<option value="${esc(x)}" ${x === t ? "selected" : ""}>${esc(W.type(x).many)}</option>`).join("")}</select></label>` +
      `<div class="field"><span>Effect</span><div class="seg">${[["allow", "Allow"], ["deny", "Never allow"], ["ceiling", "Hard limit"]].map(([v, l]) => {
        const on = v === "ceiling" ? rf.ceiling : !rf.ceiling && rf.effect === v;
        return `<button class="${on ? `on ${v === "allow" ? "allow" : "deny"}` : ""}" data-act="rfEffect" data-v="${v}" ${rf.file && (v === "ceiling") !== rf.ceiling ? "disabled" : ""}>${l}</button>`;
      }).join("")}</div><small>A rule that forbids always wins over one that allows. Hard limits are checked before all other rules.</small></div>` +
      `<div class="field"><span>Who</span><div class="check-grid">${roles.map(r => `<label class="check"><input type="checkbox" data-on-change="rfRole" data-r="${esc(r)}" ${rf.roles.has(r) ? "checked" : ""}>${esc(W.role(r).many)}</label>`).join("")}</div></div>` +
      `<div class="field"><span>May</span><div class="check-grid">${actionsFor(t).map(a => `<label class="check" title="${esc(W.action(a, t).help)}"><input type="checkbox" data-on-change="rfAction" data-a="${esc(a)}" ${rf.actions.has(a) ? "checked" : ""}>${esc(W.action(a, t).label)}</label>`).join("") || '<span class="muted small">No known actions for this kind of thing.</span>'}</div></div>` +
      `<div class="field"><span>Only when</span>${W.conditionsFor(t).map(c => `<label class="check"><input type="checkbox" data-on-change="rfCond" data-c="${esc(c.id)}" ${rf.conds.has(c.id) ? "checked" : ""}>${esc(W.condText(c, t))}</label>`).join("")}` +
      `<label class="field sub"><span>Custom condition (CEL, as fga reads it)</span><textarea class="input" id="rfCustom" data-on-input="rfCustom" placeholder="resource.attributes.label_rank < 2">${esc(rf.custom)}</textarea></label></div>` +
      `<div class="preview-rule"><small>Reads as</small><div id="rfPreview"></div></div>`;
    rfPreview();
  }
  function rfPreview() {
    const r = rfRule(), w = W.rule(r), el = document.getElementById("rfPreview");
    if (el) el.innerHTML = `<b>${esc(w.who)}</b> ${w.verb} ${esc(w.actions.join(", ") || "do nothing yet")} on ${esc(w.what)}${w.when ? ` when ${esc(w.when.text)}` : ""}`;
  }
  const toggle = (set, v, on) => (on ? set.add(v) : set.delete(v));
  acts.rfType = (d, el) => { rf.type = el.value; rf.actions.clear(); rf.conds = new Set([...rf.conds].filter(c => W.condition(c).types.includes(rf.type))); rfRender(); };
  acts.rfEffect = d => { rf.ceiling = d.v === "ceiling"; if (!rf.ceiling) rf.effect = d.v; rfRender(); };
  acts.rfRole = (d, el) => { toggle(rf.roles, d.r, el.checked); rfPreview(); };
  acts.rfAction = (d, el) => { toggle(rf.actions, d.a, el.checked); rfPreview(); };
  acts.rfCond = (d, el) => { toggle(rf.conds, d.c, el.checked); rfPreview(); };
  acts.rfCustom = (d, el) => { rf.custom = el.value; rfPreview(); };
  acts.saveRule = async () => {
    const r = rfRule();
    if (!r.roles.length) return toast("Choose who the rule is for", "bad");
    if (!r.actions.length) return toast("Choose what it allows or forbids", "bad");
    if (rf.conds.has("shared") && r.actions.length !== 1) return toast("A rule about shared access names exactly one action", "bad");
    const entry = { id: rf.id || "", effect: r.effect, actions: r.actions, roles: r.roles, ...(r.when ? { when: r.when } : {}) };
    const title = W.ruleTitle(r);
    if (rf.file) {
      draft.documents[rf.file].rules[rf.i] = entry;
      draft.changes.push(`Changed ${rf.id}`);
    } else {
      let file = Object.keys(draft.documents).find(f => draft.documents[f].resource === r.type && draft.documents[f].set === r.set);
      if (!file) {
        file = `policies/${r.set === "ceiling" ? "ceiling-" : ""}${r.type.replace(/[^a-z0-9]+/g, "-")}.json`;
        draft.documents[file] = { format: "fga.policy/v1", set: r.set, resource: r.type, scope: "", rules: [] };
      }
      const all = allRules().map(x => x.id), base = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "rule";
      let id = base;
      for (let i = 2; all.includes(id); i++) id = `${base}-${i}`;
      entry.id = id;
      draft.documents[file].rules.push(entry);
      draft.changes.push(`New rule ${id}`);
    }
    if (await saveDraft()) { closeDrawer(); toast("Saved to the draft", "ok"); C.route(); }
  };
  acts.removeRule = () => confirmBox("Remove this rule from the draft?", `<p>What it allows is no longer allowed, unless another rule allows it; what it forbids may then be allowed.</p>`, "Remove", async () => {
    const [gone] = draft.documents[rf.file].rules.splice(rf.i, 1);
    draft.changes.push(`Removed ${gone.id}`);
    if (await saveDraft()) C.route();
  });

  // ---------------------------------------------------------------- audit log

  const KINDS = { decision: "Decision", mutation: "Change to a file", administration: "Administration", key_release: "File key handed out",
    approval_consumption: "Approval used", external_delivery: "Sent outside", read_admission: "Read", envelope_publication: "Key share published" };
  function eventRow(e) {
    const target = (e.targets || [])[0], check = (e.checks || [])[0];
    const what = check ? `${W.action(check.action, check.resource_type).label} · ${check.resource_id}` : target ? `${target.type} ${target.id}` : "";
    const good = /^(ALLOW|allow|OK|ok|DONE|done|PUBLISHED|RELEASED|ADMITTED)/.test(e.outcome || "") || e.kind === "administration";
    return `<div class="list-row"><span class="badge ${good ? "allow" : "deny"}">${esc(KINDS[e.kind] || e.kind)}</span><div class="grow min0">` +
      `<b>${esc(e.actor || "?")}</b>${e.subject && e.subject !== e.actor ? ` <span class="muted">for ${esc(e.subject)}</span>` : ""} <span class="muted">· ${esc(e.outcome || "")}</span>` +
      `<div class="muted small">${esc(what)}${e.reason ? ` · ${esc(e.reason)}` : ""}</div></div><span class="muted small nowrap">${esc(when(e.at))}</span></div>`;
  }
  const af = { kind: "", q: "" };
  routes["/admin/audit"] = async () => {
    shell("Audit log", "", `<div class="page wide">${loading("Asking fga…")}</div>`);
    const r = await api("GET", "/api/admin/events?limit=200");
    if (!r.ok) return shell("Audit log", "", `<div class="page">${pageHead("Audit log")}${loading(fail(r.error))}</div>`);
    const events = r.data.items || [];
    const rows = () => {
      const q = af.q.trim().toLowerCase(), list = events.filter(e => (!af.kind || e.kind === af.kind) && (!q || JSON.stringify(e).toLowerCase().includes(q)));
      return list.length ? list.map(eventRow).join("") : `<div class="empty">Nothing matches.</div>`;
    };
    const kinds = [...new Set(events.map(e => e.kind))];
    shell("Audit log", "", `<div class="page wide">${pageHead("Audit log", "fga's latest events: every decision, change and key handed out, as fga recorded them. fga exports the full log as a signed chain.")}` +
      `<div class="card"><div class="card-head filters"><select class="input" data-on-change="afKind" aria-label="Kind"><option value="">Every kind</option>` +
      kinds.map(k => `<option value="${esc(k)}" ${af.kind === k ? "selected" : ""}>${esc(KINDS[k] || k)}</option>`).join("") + `</select>` +
      `<input class="input search right" placeholder="Search who, what or why" value="${esc(af.q)}" data-on-input="afQ" aria-label="Search the audit log"></div>` +
      `<div id="auditRows">${rows()}</div></div></div>`);
    acts.afQ = (d, el) => { af.q = el.value; document.getElementById("auditRows").innerHTML = rows(); };
    acts.afKind = (d, el) => { af.kind = el.value; document.getElementById("auditRows").innerHTML = rows(); };
  };

  // ---------------------------------------------------------------- servers

  routes["/admin/servers"] = async () => {
    shell("Servers", "", `<div class="page">${loading("Checking the services…")}</div>`);
    const r = await api("GET", "/api/admin/servers");
    if (!r.ok) return shell("Servers", "", `<div class="page">${pageHead("Servers")}${loading(fail(r.error))}</div>`);
    const list = r.data.services || [];
    shell("Servers", "", `<div class="page">${pageHead("Servers",
      "fga's services, checked live by the console. The console never changes a running server: it makes settings files, which someone on that server puts in place before restarting the service.",
      `<button class="btn" data-act="serverRefresh">Check again</button><button class="btn primary" data-act="settingsFile">${icon("gear")}Make a settings file</button>`)}` +
      `<div class="card">${list.length ? `<table class="tbl"><thead><tr><th>Service</th><th class="hide-sm">Runs on</th><th>Health</th></tr></thead><tbody>` +
        list.map(s => `<tr><td><b>${esc(s.purpose || s.name)}</b><div class="muted small">${esc(s.name)}</div></td><td class="hide-sm">${esc(s.host || "")}</td>` +
          `<td><span class="badge ${s.ok ? "ok" : "bad"}">${s.ok ? "Answering" : s.status ? `Answers ${s.status}` : "Not answering"}</span> <span class="muted small">${s.ms} ms</span></td></tr>`).join("") +
        `</tbody></table>` : `<div class="empty">No services are configured. Add them to the console's settings to check them here.</div>`}</div></div>`);
  };
  acts.serverRefresh = () => C.route();

  const ROLES = [["decision", "Decides every request"], ["storage", "Stores files and documents"], ["keys", "Hands out file keys"], ["kms", "Keeps the master keys"],
    ["mcp", "Connects AI assistants"], ["tools", "Runs tools"], ["admin", "Serves this console's changes"]];
  const field = (id, label, value, help = "", ph = "") => `<label class="field"><span>${esc(label)}</span><input class="input" id="${id}" value="${esc(value)}" placeholder="${esc(ph)}" autocomplete="off">${help ? `<small>${esc(help)}</small>` : ""}</label>`;
  acts.settingsFile = () => openDrawer("Make a settings file",
    `<label class="field"><span>Service</span><select class="input" id="sRole">${ROLES.map(([k, t]) => `<option value="${k}">${esc(t)} (fga-${k})</option>`).join("")}</select></label>` +
    `<div class="field"><span>Mode</span><div class="seg">${[["production", "Production"], ["development", "Development"]].map(([v, l]) =>
      `<label class="seg-opt"><input type="radio" name="sMode" value="${v}" ${v === "production" ? "checked" : ""}>${l}</label>`).join("")}</div></div>` +
    field("sListen", "Listens on", "0.0.0.0:8443", "Address and port") +
    `<fieldset><legend>Certificates</legend>${field("sCert", "Certificate file", "/etc/fga/tls/service.crt")}${field("sKey", "Private key file", "/etc/fga/tls/service.key")}` +
    `${field("sCa", "Trusted client certificates", "/etc/fga/tls/clients-ca.crt", "Only callers with a certificate from this authority get in")}</fieldset>` +
    `<fieldset><legend>Database and sign-in</legend>${field("sDb", "Database address", "postgres://fga:PASSWORD@db.internal:5432/fga", "Put the real password in on the server, never here")}` +
    `${field("sIss", "Login provider", "", "", "https://login.example.org/")}${field("sJwks", "Login provider's keys", "", "", "https://login.example.org/.well-known/jwks.json")}</fieldset>` +
    `<div id="sErrors"></div>`,
    `<button class="btn" data-act="closeDrawer">Cancel</button><button class="btn primary" data-act="exportSettings">${icon("download")}Check and export</button>`, { wide: true });
  acts.exportSettings = () => {
    const v = id => val(id).trim(), mode = (document.querySelector("#drawer input[name=sMode]:checked") || { value: "production" }).value, errors = [];
    const c = { version: 1, profile: mode, listen: v("sListen"), tls: { cert_file: v("sCert"), key_file: v("sKey"), client_ca_file: v("sCa") },
      database_url: v("sDb"), token_issuer: { issuer: v("sIss"), jwks_url: v("sJwks") } };
    const m = /^(.+):(\d{1,5})$/.exec(c.listen), loop = m && /^(127\.|localhost$|\[::1\]$)/.test(m[1]);
    const noTls = !c.tls.cert_file || !c.tls.key_file || !c.tls.client_ca_file;
    if (!m) errors.push("Listens on needs an address and a port, such as 0.0.0.0:8443");
    if (mode === "production" && noTls) errors.push("Production needs a certificate, its private key and trusted client certificates");
    if (mode === "development" && noTls && !loop) errors.push("Without certificates, a development service may listen only on this machine (127.0.0.1)");
    if (mode === "production" && !/^https:\/\//.test(c.token_issuer.issuer)) errors.push("In production the login provider must use https://");
    if (!/^postgres(ql)?:\/\/\S+$/.test(c.database_url) && v("sRole") !== "kms") errors.push("The database address must start with postgres://");
    const box = document.getElementById("sErrors");
    if (errors.length) { box.innerHTML = `<div class="banner bad">${icon("warn")}<ul>${errors.map(e => `<li>${esc(e)}</li>`).join("")}</ul></div>`; return; }
    if (noTls) delete c.tls;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(c, null, 2)], { type: "application/json" }));
    a.download = `${v("sRole")}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    closeDrawer();
    toast(`Exported ${v("sRole")}.json: add the service's own settings, put it on the server, and restart the service`, "ok");
  };
})();

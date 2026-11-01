// The administrator's pages of the console mockup: overview, people, AI
// agents, roles, permission sets, spaces, tools, rules, servers and the
// audit log. People and permission changes apply at once (in fga through
// the admin API, each one audited); rule changes collect in a draft that is
// signed offline; server settings are exported as files, never pushed.
"use strict";

(() => {
  const A = window.FGA_APP, { S, W, P, acts } = A;
  const { icon, esc, avatar, displayName, when, day, ago, bytes, val, checked, unique, slug, go, plural, tech, typeName, actChip, roleName,
    roleChip, labelChip, projectName, projChip, setName, ruleTitle, person, bucketOf, allRoles, rolesText, people, matchPerson, toast,
    applyBoth, change, shell, pageHead, openDrawer, closeDrawer, confirm, gap, recordAdmin, auditTable, eventText, nowIso } = A;

  const statusBadge = s => `<span class="badge ${s === "active" ? "ok" : "muted"}">${s === "active" ? "Active" : "Disabled"}</span>`;
  const checkRow = (attrs, on, title, help, extra = "") => `<label class="check big"><input type="checkbox" ${attrs} ${on ? "checked" : ""}>` +
    `<span><b>${title}</b>${help ? `<small>${esc(help)}</small>` : ""}</span>${extra}</label>`;
  const journalNote = `<p class="muted small">${icon("lock", "xs")} Anything taken away is first written to fga's security journal, so restoring an old backup cannot bring it back.</p>`;

  // ---------------------------------------------------------------- overview

  function renderOverview() {
    const users = people(), active = users.filter(p => p.status === "active"), agents = S.principals.filter(p => p.kind === "agent");
    const denied = S.audit.filter(e => e.decision === "deny").length;
    const kpi = (ic, label, value, foot, href) => `<a class="card kpi" href="#${href}"><div class="label">${icon(ic, "sm")}${esc(label)}</div>` +
      `<div class="value">${value}</div><div class="foot">${esc(foot)}</div></a>`;
    const body = `<div class="page">${pageHead(S.org.name, "Who may do what, and what was decided. Changes made here are checked and recorded by fga.",
      `<a class="btn" href="#/admin/people?new=1">${icon("plus")}Add a person</a><a class="btn primary" href="#/admin/graph">${icon("graph")}Access graph</a>`)}` +
      `<div class="grid kpis">${kpi("users", "People", active.length, `${users.length - active.length} disabled`, "/admin/people")}` +
      `${kpi("bot", "AI agents", agents.length, `${S.delegations.filter(d => d.status === "active").length} acting for people`, "/admin/agents")}` +
      `${kpi("bucket", "Spaces", S.buckets.length, `${S.objects.length} files`, "/admin/spaces")}` +
      `${kpi("policy", "Rules", S.rules.length, `version ${S.bundle.epoch}`, "/admin/rules")}` +
      `${kpi("inbox", "Waiting approvals", S.approvals.filter(a => a.state === "pending").length, "less sensitive requests", "/admin/audit")}` +
      `${kpi("x", "Not allowed", denied, "in the audit log", "/admin/audit?d=deny")}</div>` +
      `<div class="grid two spaced"><div class="card"><div class="card-head"><h3>Latest decisions</h3><a class="right small" href="#/admin/audit">Audit log</a></div>` +
      S.audit.slice(0, 8).map(e => `<div class="list-row"><span class="badge ${e.decision}">${e.admin ? "Changed" : e.decision === "allow" ? "Allowed" : "Not allowed"}</span>` +
        `<div class="grow min0">${eventText(e)}<div class="muted small">${esc(e.why)}</div></div><span class="muted small nowrap">${ago(e.at)}</span></div>`).join("") + `</div>` +
      `<div class="grid"><div class="card"><div class="card-head"><h3>Servers</h3><a class="right small" href="#/admin/servers">Servers</a></div>` +
      S.servers.map(s => `<div class="service"><span class="dot ${s.status === "running" ? "" : s.status === "retired" ? "off" : "warn"}"></span>` +
        `<div><b>${esc(s.purpose)}</b>${tech(s.name)}<div class="muted small">${esc(s.host)}</div></div></div>`).join("") + `</div>` +
      `<div class="card"><div class="card-head"><h3>Rules in force</h3><a class="right small" href="#/admin/rules">Rules</a></div><div class="card-body">` +
      `<dl class="kv"><dt>Version</dt><dd>${S.bundle.epoch}</dd><dt>Signed by</dt><dd>${esc(S.bundle.keyId)}</dd>` +
      `<dt>Active since</dt><dd>${when(S.bundle.activated)}</dd><dt>Sensitivity</dt><dd><div class="chips">${S.bundle.labels.map(labelChip).join("")}</div></dd></dl>` +
      `</div></div></div></div></div>`;
    shell("Overview", "", body);
  }
  A.routes["/admin"] = renderOverview;

  // ---------------------------------------------------------------- people

  const pf = { q: "", role: "", project: "", status: "active", page: 0 };
  const PAGE = 25;

  function renderPeople(params) {
    if (params.get("role") !== null) { pf.role = params.get("role"); pf.q = ""; pf.project = ""; pf.page = 0; }
    const opts = (list, cur, all) => `<option value="">${all}</option>` + list.map(([v, t]) => `<option value="${esc(v)}" ${v === cur ? "selected" : ""}>${esc(t)}</option>`).join("");
    shell("People", "", `<div class="page wide">${pageHead("People",
      "Everyone who can sign in. Roles and projects decide which rules apply to them; permission sets are the most they may ever do.",
      `<button class="btn primary" data-act="editPerson" data-new="1">${icon("plus")}Add a person</button>`)}` +
      `<div class="card"><div class="card-head filters"><input class="input search" id="pq" placeholder="Search by name" value="${esc(pf.q)}" data-on-input="pfQ" aria-label="Search people">` +
      `<select class="input" data-on-change="pfSet" data-k="role" aria-label="Role">${opts(allRoles().map(r => [r, W.role(r).one]), pf.role, "All roles")}</select>` +
      `<select class="input" data-on-change="pfSet" data-k="project" aria-label="Project">${opts(S.projects.map(p => [p.id, p.name]), pf.project, "All projects")}</select>` +
      `<select class="input" data-on-change="pfSet" data-k="status" aria-label="Status">${opts([["active", "Active"], ["disabled", "Disabled"]], pf.status, "Active and disabled")}</select></div>` +
      `<div id="peopleRows">${peopleRows()}</div></div></div>`);
    if (params.get("new")) acts.editPerson({ new: "1" });
  }
  A.routes["/admin/people"] = renderPeople;

  function peopleRows() {
    const list = people().filter(p => matchPerson(p, pf.q.trim()) && (!pf.role || p.roles.includes(pf.role)) &&
      (!pf.project || (p.attributes.projects || []).includes(pf.project)) && (!pf.status || p.status === pf.status))
      .sort((a, b) => displayName(a.id).localeCompare(displayName(b.id)));
    const pages = Math.max(1, Math.ceil(list.length / PAGE));
    pf.page = Math.min(pf.page, pages - 1);
    const rows = list.slice(pf.page * PAGE, pf.page * PAGE + PAGE).map(p => `<tr class="clickable" data-act="editPerson" data-id="${esc(p.id)}">` +
      `<td><div class="who">${avatar(p.id)}<div><b>${esc(displayName(p.id))}</b><div class="muted small">${esc(p.id)}</div></div></div></td>` +
      `<td><div class="chips">${p.roles.map(r => roleChip(r)).join("") || '<span class="muted small">none</span>'}</div></td>` +
      `<td class="hide-sm"><div class="chips">${(p.attributes.projects || []).map(projChip).join("") || '<span class="muted small">none</span>'}</div></td>` +
      `<td class="hide-sm"><div class="chips">${p.grants.map(g => `<span class="chip on">${setName(g)}</span>`).join("") || '<span class="muted small">none: may do nothing</span>'}</div></td>` +
      `<td>${statusBadge(p.status)}</td></tr>`).join("");
    return list.length ? `<table class="tbl"><thead><tr><th>Person</th><th>Roles</th><th class="hide-sm">Projects</th><th class="hide-sm">Permission sets</th><th>Status</th></tr></thead>` +
      `<tbody>${rows}</tbody></table><div class="pager"><span class="muted small">${plural(list.length, "person", "people")}</span><span class="spacer"></span>` +
      `<button class="btn sm" data-act="pfPage" data-d="-1" ${pf.page ? "" : "disabled"}>${icon("back", "sm")}Previous</button>` +
      `<span class="muted small">Page ${pf.page + 1} of ${pages}</span>` +
      `<button class="btn sm" data-act="pfPage" data-d="1" ${pf.page < pages - 1 ? "" : "disabled"}>Next${icon("chevron", "sm")}</button></div>`
      : `<div class="empty">${icon("users")}<div>No one matches.</div></div>`;
  }
  const refreshPeople = () => { const el = document.getElementById("peopleRows"); if (el) el.innerHTML = peopleRows(); };
  acts.pfQ = (d, el) => { pf.q = el.value; pf.page = 0; refreshPeople(); };
  acts.pfSet = (d, el) => { pf[d.k] = el.value; pf.page = 0; refreshPeople(); };
  acts.pfPage = d => { pf.page += Number(d.d); refreshPeople(); };

  acts.editPerson = d => {
    const isNew = d.new === "1";
    const p = isNew ? { id: "", kind: "user", roles: ["member"], attributes: { projects: [] }, grants: ["storage"], status: "active" } : person(d.id);
    const shares = S.shares.filter(s => s.grantee === p.id && Date.parse(s.expires) > A.clock());
    const delegations = S.delegations.filter(x => x.status === "active" && x.subject === p.id);
    openDrawer(isNew ? "Add a person" : displayName(p.id),
      (isNew ? `<label class="field"><span>Sign-in name</span><input class="input" id="fPid" placeholder="dana.lee" autocomplete="off">` +
        `<small>The name in their sign-in pass, as your organisation's login sends it.</small></label>`
        : `<div class="file-head">${avatar(p.id, "lg")}<div><b>${esc(displayName(p.id))}</b><div class="muted small">${esc(p.id)} · ${statusBadge(p.status)}</div></div></div>`) +
      `<div class="field"><span>Roles</span>${allRoles().map(r => checkRow(`data-role="${esc(r)}"`, p.roles.includes(r), roleName(r) + tech(r), W.role(r).help)).join("")}</div>` +
      `<div class="field"><span>Projects</span><div class="check-grid">${S.projects.map(x => `<label class="check"><input type="checkbox" data-project="${esc(x.id)}" ` +
        `${(p.attributes.projects || []).includes(x.id) ? "checked" : ""}>${esc(x.name)}</label>`).join("")}</div><small>Rules compare these with the project of a space or file.</small></div>` +
      `<div class="field"><span>Permission sets</span>${Object.keys(S.permSets).map(id => checkRow(`data-set="${esc(id)}"`, p.grants.includes(id), setName(id) + tech(id),
        W.set(id, S.permSets).help)).join("")}<small>Without a permission set, no rule can allow them anything.</small></div>` +
      (isNew ? "" : `<div class="field"><span>Single files shared with them</span>${shares.length ? shares.map(s => `<div class="mini-row">${icon("file", "sm")}` +
        `<span class="grow">${esc(s.bucket)}/${esc(s.key)}</span><span class="muted small">until ${day(s.expires)}</span></div>`).join("")
        : `<span class="muted small">None.</span>`}<small>Only a file's owner or a file steward can change these.</small></div>` +
        (delegations.length ? `<div class="field"><span>AI agents acting for them</span>${delegations.map(x => `<div class="mini-row">${icon("bot", "sm")}` +
          `<span class="grow">${esc(displayName(x.actor))}</span><span class="muted small">until ${day(x.expires)}</span></div>`).join("")}</div>` : "")) + journalNote,
      (isNew || p.status !== "active" ? "" : `<button class="btn danger" data-act="disablePerson" data-id="${esc(p.id)}">Disable</button><span class="spacer"></span>`) +
      `<button class="btn" data-act="closeDrawer">Cancel</button><button class="btn primary" data-act="savePerson" data-id="${esc(p.id)}" data-new="${isNew ? 1 : 0}">Save</button>`);
  };
  acts.savePerson = d => {
    const isNew = d.new === "1", id = isNew ? val("fPid").trim() : d.id;
    if (!/^[a-z0-9][a-z0-9._-]{0,62}$/.test(id)) return toast("Use lowercase letters, digits, dots, dashes or underscores", "bad");
    if (isNew && person(id)) return toast(`${id} already exists`, "bad");
    const roles = checked("#drawer [data-role]").map(x => x.dataset.role), projects = checked("#drawer [data-project]").map(x => x.dataset.project);
    const grants = checked("#drawer [data-set]").map(x => x.dataset.set);
    applyBoth(st => {
      let p = st.principals.find(x => x.id === id);
      if (!p) { p = { id, kind: "user", roles: [], attributes: {}, grants: [], status: "active" }; st.principals.push(p); }
      p.roles = roles;
      p.grants = grants;
      p.attributes = { ...p.attributes, projects };
    });
    recordAdmin(isNew ? "added a person" : "changed a person's roles and permissions", id);
    closeDrawer();
    toast(`Saved ${displayName(id)}`, "ok");
    if (location.hash.includes("new=1")) go("/admin/people"); else A.route();
  };
  acts.disablePerson = d => confirm(`Disable ${displayName(d.id)}?`,
    `<p>They can no longer sign in or do anything, and nothing shared with them works any more. AI agents acting for them stop too.</p>` +
    `<p class="muted small">fga keeps the person, so the audit log still says who did what. Disabling is final: fga has no way to enable someone again.</p>`,
    "Disable", () => {
      applyBoth(st => { st.principals.find(x => x.id === d.id).status = "disabled"; });
      recordAdmin("disabled a person", d.id);
      toast(`${displayName(d.id)} is disabled`, "ok");
      A.route();
    });

  // ---------------------------------------------------------------- AI agents

  function renderAgents() {
    const agents = S.principals.filter(p => p.kind === "agent");
    const dl = S.delegations.filter(x => x.status === "active");
    shell("AI agents", "", `<div class="page wide">${pageHead("AI agents",
      "Software that acts for a person. When it does, the rules look at that person, and the agent may do only what its own permission sets and its permission to act both allow.",
      `<button class="btn" data-act="newAgent">${icon("plus")}Add an agent</button><button class="btn primary" data-act="newDlg">${icon("link")}Let an agent act for someone</button>`)}` +
      `<div class="card"><div class="card-head"><h3>Acting for people</h3><span class="right muted small">${plural(dl.length, "permission")}</span></div>` +
      (dl.length ? `<table class="tbl"><thead><tr><th>Agent</th><th>Acts for</th><th class="hide-sm">May</th><th>Until</th><th></th></tr></thead><tbody>` +
        dl.map(x => `<tr><td><div class="who">${avatar(x.actor, "sm")}<b>${esc(displayName(x.actor))}</b></div></td>` +
          `<td><div class="who">${avatar(x.subject, "sm")}<span>${esc(displayName(x.subject))}</span></div></td>` +
          `<td class="hide-sm"><div class="chips">${Object.entries(x.grants).map(([t, a]) => `<span class="chip" title="${esc(a.map(y => W.action(y, t).label).join(", "))}">` +
            `${esc(W.type(t).many)} · ${a.length}</span>`).join("")}</div></td><td class="muted nowrap">${when(x.expires)}</td>` +
          `<td class="actions"><button class="btn sm danger" data-act="revokeDlg" data-id="${esc(x.id)}">Revoke</button></td></tr>`).join("") + `</tbody></table>`
        : `<div class="empty">${icon("link")}<div>No agent acts for anyone.</div></div>`) + `</div>` +
      `<div class="card spaced"><div class="card-head"><h3>Agents</h3></div><table class="tbl"><thead><tr><th>Agent</th><th>Acts for</th><th class="hide-sm">Permission sets</th><th>Status</th><th></th></tr></thead><tbody>` +
      agents.map(p => `<tr><td><div class="who">${avatar(p.id)}<div><b>${esc(displayName(p.id))}</b><div class="muted small">${esc(p.id)}</div></div></div></td>` +
        `<td>${dl.filter(x => x.actor === p.id).map(x => esc(displayName(x.subject))).join(", ") || '<span class="muted small">nobody</span>'}</td>` +
        `<td class="hide-sm"><div class="chips">${p.grants.map(g => `<span class="chip on">${setName(g)}</span>`).join("")}</div></td><td>${statusBadge(p.status)}</td>` +
        `<td class="actions">${p.status === "active" ? `<button class="btn sm danger" data-act="disableAgent" data-id="${esc(p.id)}">Remove</button>` : ""}</td></tr>`).join("") +
      `</tbody></table></div></div>`);
  }
  A.routes["/admin/agents"] = renderAgents;

  acts.newAgent = () => openDrawer("Add an AI agent",
    `<label class="field"><span>Name</span><input class="input" id="fAgent" placeholder="agent-90" autocomplete="off"><small>The name in the agent's own sign-in pass.</small></label>` +
    `<div class="field"><span>Permission sets</span>${Object.keys(S.permSets).map(id => checkRow(`data-set="${esc(id)}"`, id === "storage", setName(id), W.set(id, S.permSets).help)).join("")}</div>` +
    `<p class="muted small">An agent does nothing on its own until it is allowed to act for someone.</p>`,
    `<button class="btn" data-act="closeDrawer">Cancel</button><button class="btn primary" data-act="saveAgent">Add</button>`);
  acts.saveAgent = () => {
    const id = val("fAgent").trim();
    if (!/^[a-z0-9][a-z0-9._-]{0,62}$/.test(id)) return toast("Use lowercase letters, digits, dots or dashes", "bad");
    if (person(id)) return toast(`${id} already exists`, "bad");
    const grants = checked("#drawer [data-set]").map(x => x.dataset.set);
    applyBoth(st => st.principals.push({ id, kind: "agent", roles: ["agent"], attributes: {}, grants, status: "active" }));
    recordAdmin("added an AI agent", id);
    closeDrawer();
    toast(`Added ${displayName(id)}`, "ok");
    A.route();
  };
  acts.disableAgent = d => confirm(`Remove ${displayName(d.id)}?`,
    `<p>The agent can no longer act for anyone; its permissions to act end at once.</p><p class="muted small">fga keeps it as disabled, so the audit log still names it.</p>`,
    "Remove", () => {
      applyBoth(st => {
        st.principals.find(x => x.id === d.id).status = "disabled";
        st.delegations.filter(x => x.actor === d.id).forEach(x => { x.status = "revoked"; });
      });
      recordAdmin("removed an AI agent", d.id);
      toast(`${displayName(d.id)} is removed`, "ok");
      A.route();
    });

  const DLG_DEFAULT = { "storage.bucket": ["list"], "storage.object": ["discover", "stat", "read"], "document.version": ["discover", "read-units"], "agent.tool": ["discover", "invoke"] };
  acts.newDlg = () => {
    const agents = S.principals.filter(p => p.kind === "agent" && p.status === "active");
    const types = Object.keys(S.permSets.storage.caps);
    openDrawer("Let an agent act for someone",
      `<label class="field"><span>Agent</span><select class="input" id="fDlgActor">${agents.map(p => `<option value="${esc(p.id)}">${esc(displayName(p.id))}</option>`).join("")}</select></label>` +
      `<label class="field"><span>Acts for</span><input class="input" id="fDlgSubject" list="dlgPeople" placeholder="Type a name" autocomplete="off">` +
      `<datalist id="dlgPeople">${people().filter(p => p.status === "active").map(p => `<option value="${esc(p.id)}">${esc(displayName(p.id))}</option>`).join("")}</datalist></label>` +
      `<div class="field"><span>For how long</span><div class="seg">${[["1", "1 hour"], ["24", "1 day"], ["168", "7 days"], ["720", "30 days"]].map(([h, t]) =>
        `<label class="seg-opt"><input type="radio" name="fDlgHours" value="${h}" ${h === "24" ? "checked" : ""}>${t}</label>`).join("")}</div></div>` +
      `<div class="field"><span>What it may do for them</span>` + types.map(t => `<details class="group" ${DLG_DEFAULT[t] ? "open" : ""}><summary>${typeName(t, true)}</summary>` +
        `<div class="check-grid">${S.types[t].filter(a => S.permSets.storage.caps[t].includes(a)).map(a => `<label class="check" title="${esc(W.action(a, t).help)}">` +
          `<input type="checkbox" data-dt="${esc(t)}" data-da="${esc(a)}" ${(DLG_DEFAULT[t] || []).includes(a) ? "checked" : ""}>${esc(W.action(a, t).label)}${tech(a)}</label>`).join("")}</div></details>`).join("") +
      `<small>Never more than the person may do themselves: the rules still decide for the person.</small></div>`,
      `<button class="btn" data-act="closeDrawer">Cancel</button><button class="btn primary" data-act="saveDlg">Allow</button>`);
  };
  acts.saveDlg = () => {
    const actor = val("fDlgActor"), subject = val("fDlgSubject").trim(), p = person(subject);
    if (!p || p.kind !== "user" || p.status !== "active") return toast("Choose an active person to act for", "bad");
    const grants = {};
    for (const x of checked("#drawer [data-dt]")) (grants[x.dataset.dt] = grants[x.dataset.dt] || []).push(x.dataset.da);
    if (!Object.keys(grants).length) return toast("Choose at least one thing it may do", "bad");
    const hours = Number((checked("#drawer input[name=fDlgHours]")[0] || { value: 24 }).value);
    const id = unique(`dlg-${subject.split(".")[0]}`, x => S.delegations.some(y => y.id === x));
    const dlg = { id, actor, subject, audience: "local-dev", expires: new Date(A.clock() + hours * 3600e3).toISOString(), status: "active", grants };
    applyBoth(st => st.delegations.push(structuredClone(dlg)));
    recordAdmin(`let ${displayName(actor)} act for ${displayName(subject)}`, id);
    closeDrawer();
    toast(`${displayName(actor)} may now act for ${displayName(subject)}`, "ok");
    A.route();
  };
  acts.revokeDlg = d => {
    const x = S.delegations.find(y => y.id === d.id);
    confirm("Revoke this permission?", `<p>${esc(displayName(x.actor))} stops acting for ${esc(displayName(x.subject))} at once, including anything it is doing now.</p>`, "Revoke", () => {
      applyBoth(st => { st.delegations.find(y => y.id === d.id).status = "revoked"; });
      recordAdmin(`stopped ${displayName(x.actor)} acting for ${displayName(x.subject)}`, x.id);
      toast("Revoked", "ok");
      A.route();
    });
  };

  // ---------------------------------------------------------------- roles

  const rulesOf = r => S.rules.filter(x => x.roles.includes(r));
  const holders = r => S.principals.filter(p => p.roles.includes(r));

  function renderRoles() {
    const card = r => {
      const rs = rulesOf(r), n = r === "*" ? S.principals.filter(p => p.status === "active").length : holders(r).length;
      const kinds = [...new Set(rs.map(x => x.type))];
      return `<div class="card role-card"><div class="card-head"><div><h3>${roleName(r)}${tech(r)}</h3><div class="muted small">${esc(W.role(r).help) || "&nbsp;"}</div></div>` +
        `<div class="btn-row right">${r === "*" ? "" : `<button class="btn sm" data-act="editRole" data-id="${esc(r)}">Edit</button>`}` +
        `${r === "*" ? "" : `<button class="btn sm icon ghost" data-act="removeRole" data-id="${esc(r)}" aria-label="Remove role" title="Remove role">${icon("trash")}</button>`}</div></div>` +
        `<div class="card-body"><div class="stat-row"><a href="#/admin/people?role=${encodeURIComponent(r === "*" ? "" : r)}"><b>${n}</b> ${n === 1 ? "person" : "people"}</a>` +
        `<span><b>${rs.length}</b> ${rs.length === 1 ? "rule" : "rules"}</span></div>` +
        `<div class="chips">${kinds.map(t => `<span class="chip">${esc(W.type(t).many)}</span>`).join("") || '<span class="muted small">No rule uses it yet: it gives nothing</span>'}</div></div></div>`;
    };
    shell("Roles", "", `<div class="page wide">${pageHead("Roles",
      "A role means nothing by itself: rules give it meaning. Rules for <b>Everyone</b> apply to every active person, usually with a condition such as ownership.",
      `<button class="btn primary" data-act="newRole">${icon("plus")}New role</button>`)}` +
      `<div class="grid cards">${card("*")}${allRoles().map(card).join("")}</div></div>`);
  }
  A.routes["/admin/roles"] = renderRoles;

  acts.newRole = () => openDrawer("New role",
    `<label class="field"><span>Name</span><input class="input" id="fRoleName" placeholder="Reviewer" autocomplete="off"></label>` +
    `<label class="field"><span>What it is for</span><input class="input" id="fRoleHelp" placeholder="Reviews documents before they go out"></label>` +
    `<label class="field"><span>Start with the rules of</span><select class="input" id="fRoleCopy"><option value="">No rules yet</option>` +
    allRoles().map(r => `<option value="${esc(r)}">${roleName(r)}</option>`).join("") + `</select>` +
    `<small>The new role is added to the same rules. You can change them afterwards under Rules.</small></label>` +
    `<p class="insp-note policy">A new role changes the rules, so it becomes active when the next rule set is signed. You can give it to people at once.</p>`,
    `<button class="btn" data-act="closeDrawer">Cancel</button><button class="btn primary" data-act="saveNewRole">Create</button>`);
  acts.saveNewRole = () => {
    const name = val("fRoleName").trim(), help = val("fRoleHelp").trim(), from = val("fRoleCopy");
    if (!name) return toast("Give the role a name", "bad");
    const id = unique(slug(name) || "role", x => allRoles().includes(x) || x === "*");
    S.roleInfo[id] = { name, help };
    S.extraRoles.push(id);
    let n = 0;
    if (from) S.rules.forEach(r => { if (r.roles.includes(from)) { r.roles.push(id); n++; } });
    change("policy", `New role ${name}${from ? ` with the ${n} rules of ${W.role(from).one}` : ""}`);
    closeDrawer();
    toast(`Created role ${name}`, "ok");
    A.route();
  };

  acts.editRole = d => {
    const r = d.id, rs = rulesOf(r), others = S.rules.filter(x => !x.roles.includes(r));
    openDrawer(`Role: ${W.role(r).one}`,
      `<label class="field"><span>Name</span><input class="input" id="fRoleName" value="${esc(W.role(r).one)}"></label>` +
      `<label class="field"><span>What it is for</span><input class="input" id="fRoleHelp" value="${esc(W.role(r).help)}"></label>` +
      `<div class="field"><span>Rules for this role</span>${rs.map(x => `<div class="mini-row"><span class="badge ${x.effect}">${esc(W.rule(x).kind)}</span>` +
        `<span class="grow">${esc(ruleTitle(x))}</span><button class="btn sm ghost icon" data-act="roleDropRule" data-r="${esc(r)}" data-id="${esc(x.id)}" ` +
        `aria-label="Take the role off this rule" title="Take the role off this rule">${icon("x")}</button></div>`).join("") || '<span class="muted small">None.</span>'}` +
      `<select class="input" data-on-change="roleAddRule" data-r="${esc(r)}" aria-label="Add the role to a rule"><option value="">Add to a rule…</option>` +
      others.map(x => `<option value="${esc(x.id)}">${esc(W.type(x.type).many)}: ${esc(ruleTitle(x))}</option>`).join("") + `</select></div>` +
      `<p class="muted small">${plural(holders(r).length, "person has", "people have")} this role. <a href="#/admin/people?role=${encodeURIComponent(r)}">Show them</a></p>`,
      `<button class="btn danger" data-act="removeRole" data-id="${esc(r)}">Remove role</button><span class="spacer"></span>` +
      `<button class="btn" data-act="closeDrawer">Cancel</button><button class="btn primary" data-act="saveRole" data-id="${esc(r)}">Save</button>`);
  };
  acts.roleDropRule = d => {
    const x = S.rules.find(y => y.id === d.id);
    x.roles = x.roles.filter(y => y !== d.r);
    change("policy", `Rule “${ruleTitle(x)}” no longer applies to ${W.role(d.r).many}`);
    acts.editRole({ id: d.r });
  };
  acts.roleAddRule = (d, el) => {
    if (!el.value) return;
    const x = S.rules.find(y => y.id === el.value);
    x.roles.push(d.r);
    change("policy", `Rule “${ruleTitle(x)}” also applies to ${W.role(d.r).many}`);
    acts.editRole({ id: d.r });
  };
  acts.saveRole = d => {
    const name = val("fRoleName").trim(), help = val("fRoleHelp").trim(), cur = W.role(d.id);
    if (!name) return toast("Give the role a name", "bad");
    if (name !== cur.one || help !== cur.help) {
      S.roleInfo[d.id] = { name, help };
      change("policy", `Role ${cur.one} described as “${name}”`);
    }
    closeDrawer();
    A.route();
  };
  acts.removeRole = d => {
    const r = d.id, hs = holders(r), rs = rulesOf(r), orphan = rs.filter(x => x.roles.length === 1);
    confirm(`Remove the role ${W.role(r).one}?`,
      `<ul class="consequences"><li><b>${plural(hs.length, "person loses", "people lose")}</b> the role, at once.</li>` +
      `<li><b>${plural(rs.length, "rule")}</b> no longer ${rs.length === 1 ? "applies" : "apply"} to it.</li>` +
      (orphan.length ? `<li><b>${plural(orphan.length, "rule")}</b> would then apply to nobody and ${orphan.length === 1 ? "is" : "are"} removed: ` +
        `${orphan.map(x => `“${esc(ruleTitle(x))}”`).join(", ")}</li>` : "") + `</ul>` +
      `<p class="muted small">The rule changes become active when the next rule set is signed.</p>` + journalNote,
      "Remove role", () => {
        applyBoth(st => st.principals.forEach(p => { p.roles = p.roles.filter(x => x !== r); }));
        S.rules.forEach(x => { x.roles = x.roles.filter(y => y !== r); });
        S.rules = S.rules.filter(x => x.roles.length);
        delete S.roleInfo[r];
        S.extraRoles = S.extraRoles.filter(x => x !== r);
        if (hs.length) recordAdmin(`took the role ${W.role(r).one} from ${plural(hs.length, "person", "people")}`, r);
        change("policy", `Removed role ${W.role(r).one}${orphan.length ? ` and ${plural(orphan.length, "rule")} left without a role` : ""}`);
        toast(`Removed the role ${W.role(r).one}`, "ok");
        A.route();
      });
  };

  // ---------------------------------------------------------------- permission sets

  function renderPermissions() {
    const rows = Object.entries(S.permSets).map(([id, s]) => {
      const n = S.principals.filter(p => p.grants.includes(id)).length;
      return `<tr class="clickable" data-act="editSet" data-id="${esc(id)}"><td><b>${setName(id)}</b>${tech(id)} ${s.builtin ? '<span class="badge muted">built in</span>' : ""}` +
        `<div class="muted small">${esc(W.set(id, S.permSets).help)}</div></td>` +
        `<td class="hide-sm"><div class="chips">${Object.entries(s.caps).map(([t, a]) => `<span class="chip" title="${esc(a.map(x => W.action(x, t).label).join(", "))}">${esc(W.type(t).many)} · ${a.length}</span>`).join("")}</div></td>` +
        `<td class="num">${n}</td></tr>`;
    }).join("");
    shell("Permission sets", "", `<div class="page">${pageHead("Permission sets",
      "The most a person may ever do. Something is allowed only if one of their permission sets includes it <i>and</i> a rule allows it.",
      `<button class="btn primary" data-act="editSet" data-new="1">${icon("plus")}New permission set</button>`)}` +
      `<div class="card"><table class="tbl"><thead><tr><th>Permission set</th><th class="hide-sm">Includes</th><th class="num">People</th></tr></thead><tbody>${rows}</tbody></table></div></div>`);
  }
  A.routes["/admin/permissions"] = renderPermissions;

  acts.editSet = d => {
    const isNew = d.new === "1", s = isNew ? { name: "", caps: {} } : S.permSets[d.id], fixed = !isNew && s.builtin;
    const n = isNew ? 0 : S.principals.filter(p => p.grants.includes(d.id)).length;
    openDrawer(isNew ? "New permission set" : W.set(d.id, S.permSets).name,
      (fixed ? `<p class="muted small">Built into fga: its contents are fixed.</p>` : `<label class="field"><span>Name</span><input class="input" id="fSetName" value="${esc(s.name)}" placeholder="Read documents"></label>` +
        `<label class="field"><span>What it is for</span><input class="input" id="fSetHelp" value="${esc(s.help || "")}"></label>`) +
      `<div class="field"><span>Includes</span>` + Object.keys(S.types).sort((a, b) => W.type(a).many.localeCompare(W.type(b).many)).map(t => {
        const on = s.caps[t] || [];
        if (fixed && !on.length) return "";
        return `<details class="group" ${on.length ? "open" : ""}><summary>${typeName(t, true)}${on.length ? ` <span class="muted small">· ${on.length}</span>` : ""}</summary><div class="check-grid">` +
          S.types[t].map(a => `<label class="check" title="${esc(W.action(a, t).help)}"><input type="checkbox" data-st="${esc(t)}" data-sa="${esc(a)}" ` +
            `${on.includes(a) ? "checked" : ""} ${fixed ? "disabled" : ""}>${esc(W.action(a, t).label)}${tech(a)}</label>`).join("") + `</div></details>`;
      }).join("") + `</div>` + (isNew ? "" : `<p class="muted small">${plural(n, "person holds", "people hold")} it.</p>`) + (fixed ? "" : journalNote),
      (isNew || fixed ? "" : `<button class="btn danger" data-act="removeSet" data-id="${esc(d.id)}">Remove</button><span class="spacer"></span>`) +
      `<button class="btn" data-act="closeDrawer">${fixed ? "Close" : "Cancel"}</button>` +
      (fixed ? "" : `<button class="btn primary" data-act="saveSet" data-id="${esc(d.id || "")}" data-new="${isNew ? 1 : 0}">Save</button>`));
  };
  acts.saveSet = d => {
    const name = val("fSetName").trim(), help = val("fSetHelp").trim(), caps = {};
    for (const x of checked("#drawer [data-st]")) (caps[x.dataset.st] = caps[x.dataset.st] || []).push(x.dataset.sa);
    if (!name) return toast("Give the set a name", "bad");
    if (!Object.keys(caps).length) return toast("Choose at least one thing it includes", "bad");
    const id = d.new === "1" ? unique(slug(name) || "set", x => S.permSets[x]) : d.id;
    applyBoth(st => { st.permSets[id] = { name, help, caps }; });
    recordAdmin(d.new === "1" ? "created a permission set" : "changed a permission set", name);
    closeDrawer();
    toast(`Saved ${name}`, "ok");
    A.route();
  };
  acts.removeSet = d => {
    const n = S.principals.filter(p => p.grants.includes(d.id)).length;
    confirm(`Remove ${W.set(d.id, S.permSets).name}?`, `<p><b>${plural(n, "person loses", "people lose")}</b> what it included, at once.</p>` + journalNote, "Remove", () => {
      applyBoth(st => { st.principals.forEach(p => { p.grants = p.grants.filter(g => g !== d.id); }); delete st.permSets[d.id]; });
      recordAdmin("removed a permission set", d.id);
      toast("Removed", "ok");
      A.route();
    });
  };

  // ---------------------------------------------------------------- spaces

  function renderSpaces() {
    const rows = S.buckets.map(b => {
      const files = S.objects.filter(o => o.bucket === b.name);
      return `<tr><td><div class="obj">${icon(b.mode === "client" ? "lock" : "bucket")}<b>${esc(b.name)}</b></div></td><td>${projChip(b.project)}</td>` +
        `<td class="hide-sm"><span title="${esc(W.encryption(b.mode).help)}">${esc(W.encryption(b.mode).name)}</span>${tech(b.mode)}</td>` +
        `<td class="num">${files.length}</td><td class="num hide-sm">${bytes(files.reduce((s, o) => s + o.size, 0))}</td>` +
        `<td class="actions"><button class="btn sm icon ghost" data-act="removeSpace" data-id="${esc(b.name)}" aria-label="Remove space" title="Remove space">${icon("trash")}</button></td></tr>`;
    }).join("");
    shell("Spaces", "", `<div class="page">${pageHead("Spaces",
      "Each space holds one project's files. In spaces encrypted by fga, the rules alone decide who reads; in end-to-end encrypted spaces, people also need a key from the owner.",
      `<button class="btn primary" data-act="newSpace">${icon("plus")}New space</button>`)}` +
      `<div class="card"><table class="tbl"><thead><tr><th>Space</th><th>Project</th><th class="hide-sm">Encryption</th><th class="num">Files</th><th class="num hide-sm">Size</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></div>`);
  }
  A.routes["/admin/spaces"] = renderSpaces;

  acts.newSpace = () => openDrawer("New space",
    `<label class="field"><span>Name</span><input class="input" id="fSpace" placeholder="minutes" autocomplete="off"><small>Lowercase letters, digits, dots and dashes.</small></label>` +
    `<label class="field"><span>Project</span><select class="input" id="fSpaceProject">${S.projects.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("")}</select></label>` +
    `<div class="field"><span>Encryption</span>${["server", "client"].map(m => `<label class="check big"><input type="radio" name="fMode" value="${m}" ${m === "server" ? "checked" : ""}>` +
      `<span><b>${esc(W.encryption(m).name)}</b><small>${esc(W.encryption(m).help)}</small></span></label>`).join("")}</div>`,
    `<button class="btn" data-act="closeDrawer">Cancel</button><button class="btn primary" data-act="saveSpace">Create</button>`);
  acts.saveSpace = () => {
    const name = val("fSpace").trim(), project = val("fSpaceProject"), mode = (checked("#drawer input[name=fMode]")[0] || { value: "server" }).value;
    if (!/^[a-z0-9][a-z0-9.-]{1,62}$/.test(name)) return toast("Use lowercase letters, digits, dots and dashes", "bad");
    if (bucketOf(name)) return toast(`${name} already exists`, "bad");
    applyBoth(st => st.buckets.push({ name, project, mode }));
    recordAdmin("created a space", name);
    closeDrawer();
    toast(`Created the space ${name}`, "ok");
    A.route();
  };
  acts.removeSpace = d => {
    const files = S.objects.filter(o => o.bucket === d.id);
    confirm(`Remove the space ${d.id}?`, `<p>${files.length ? `Its <b>${plural(files.length, "file")}</b> are deleted with it, and everything shared from it ends.` : "It is empty."}</p>` +
      gap("fga cannot remove a space yet. It needs a new admin operation that deletes the files, their keys and their shares, and journals it."),
      "Remove space", () => {
        applyBoth(st => { st.buckets = st.buckets.filter(b => b.name !== d.id); });
        S.objects = S.objects.filter(o => o.bucket !== d.id);
        S.shares = S.shares.filter(s => s.bucket !== d.id);
        recordAdmin("removed a space", d.id);
        toast(`Removed the space ${d.id}`, "ok");
        A.route();
      });
  };

  // ---------------------------------------------------------------- tools

  const MCP_NAMES = { "resources.list": "List files", "resources.read": "Read a file", "documents.search": "Search documents",
    "documents.read": "Read a document", "text.read": "Read text entries", "documents.export": "Export a document" };
  const toolRunners = kind => S.rules.filter(r => r.type === "agent.tool" && r.effect === "allow" && r.actions.includes("invoke") &&
    r.when.includes(`"${kind}"`)).flatMap(r => r.roles);

  function renderTools() {
    const runners = [...new Set(toolRunners("executor"))].map(r => W.role(r).many).join(", ") || "nobody";
    const mcpUsers = [...new Set(toolRunners("mcp"))].map(r => W.role(r).many).join(", ") || "nobody";
    shell("Tools", "", `<div class="page">${pageHead("Tools",
      "Tools do things outside fga for people and AI agents, such as sending a notification. A tool runs only after it is reviewed, only to approved addresses, and only for those the rules allow.")}` +
      `<div class="card"><div class="card-head"><h3>Tools</h3><span class="muted small">Run by ${esc(runners)}</span>` +
      `<button class="btn sm primary right" data-act="newTool">${icon("plus")}New tool</button></div>` +
      `<table class="tbl"><thead><tr><th>Tool</th><th class="hide-sm">Sends to</th><th>Status</th><th></th></tr></thead><tbody>` +
      S.tools.map(t => `<tr><td><b>${esc(t.name)}</b>${tech(t.id)}<div class="muted small">${esc(t.description)}</div></td><td class="hide-sm">${esc(t.destination)}</td>` +
        `<td><span class="badge ${t.reviewed ? "ok" : "warn"}">${t.reviewed ? "Ready" : "Waiting for review"}</span></td>` +
        `<td class="actions">${t.reviewed ? "" : `<button class="btn sm" data-act="reviewTool" data-id="${esc(t.id)}">Mark reviewed</button>`}` +
        `<button class="btn sm icon ghost" data-act="removeTool" data-id="${esc(t.id)}" aria-label="Remove tool" title="Remove tool">${icon("trash")}</button></td></tr>`).join("") +
      `</tbody></table></div>` +
      `<div class="card spaced"><div class="card-head"><h3>External addresses</h3><span class="muted small">Where tools may send data</span>` +
      `<button class="btn sm right" data-act="newDest">${icon("plus")}New address</button></div>` +
      `<table class="tbl"><thead><tr><th>Name</th><th>Web address</th><th class="hide-md">Allowed networks</th><th>Status</th><th></th></tr></thead><tbody>` +
      S.destinations.map(x => `<tr><td><b>${esc(x.id)}</b></td><td><span class="mono">${esc(x.url)}</span></td><td class="hide-md"><span class="mono">${esc(x.cidrs)}</span></td>` +
        `<td><span class="badge ${x.approved ? "ok" : "warn"}">${x.approved ? "Approved" : "Waiting"}</span></td>` +
        `<td class="actions">${x.approved ? "" : `<button class="btn sm" data-act="approveDest" data-id="${esc(x.id)}">Approve</button>`}` +
        `<button class="btn sm icon ghost" data-act="removeDest" data-id="${esc(x.id)}" aria-label="Remove address" title="Remove address">${icon("trash")}</button></td></tr>`).join("") +
      `</tbody></table></div>` +
      `<div class="card spaced"><div class="card-head"><h3>AI assistant tools</h3><span class="badge ${S.mcp.enabled ? "ok" : "muted"}">${S.mcp.enabled ? "On" : "Off"}</span>` +
      `<span class="muted small">Used by ${esc(mcpUsers)}</span><button class="btn sm right ${S.mcp.enabled ? "danger" : "primary"}" data-act="toggleMcp">${S.mcp.enabled ? "Turn off" : "Turn on"}</button></div>` +
      `<div class="card-body"><p class="muted small">Let AI assistants find and read what a person may find and read, through fga.</p>` +
      `<div class="chips">${S.mcp.tools.map(t => `<span class="chip">${esc(MCP_NAMES[t] || t)}${tech(t)}</span>`).join("")}</div></div></div></div>`);
  }
  A.routes["/admin/tools"] = renderTools;

  acts.newTool = () => openDrawer("New tool",
    `<label class="field"><span>Name</span><input class="input" id="fToolName" placeholder="Send a text message"></label>` +
    `<label class="field"><span>What it does</span><input class="input" id="fToolHelp" placeholder="Sends a short text message to a phone"></label>` +
    `<label class="field"><span>Sends to</span><select class="input" id="fToolDest">${S.destinations.map(x => `<option value="${esc(x.id)}">${esc(x.id)} · ${esc(x.url)}</option>`).join("")}</select></label>` +
    `<p class="insp-note">A new tool cannot run until it is reviewed. Who may run it is up to the rules for tools.</p>`,
    `<button class="btn" data-act="closeDrawer">Cancel</button><button class="btn primary" data-act="saveTool">Add</button>`);
  acts.saveTool = () => {
    const name = val("fToolName").trim(), description = val("fToolHelp").trim(), destination = val("fToolDest");
    if (!name) return toast("Give the tool a name", "bad");
    const id = unique(slug(name) || "tool", x => S.tools.some(t => t.id === x));
    applyBoth(st => st.tools.push({ id, name, description, destination, reviewed: false }));
    recordAdmin("added a tool", id);
    closeDrawer();
    toast(`Added ${name}; it waits for review`, "ok");
    A.route();
  };
  acts.reviewTool = d => { applyBoth(st => { st.tools.find(t => t.id === d.id).reviewed = true; }); recordAdmin("reviewed a tool", d.id); A.route(); };
  acts.removeTool = d => {
    const t = S.tools.find(x => x.id === d.id);
    confirm(`Remove ${t.name}?`, `<p>Nobody can run it any more; runs already started finish or are settled.</p>` +
      gap("the tool service can add and review tools, not remove them. It needs a remove that keeps the record of past runs."), "Remove tool", () => {
      applyBoth(st => { st.tools = st.tools.filter(x => x.id !== d.id); });
      recordAdmin("removed a tool", d.id);
      toast(`Removed ${t.name}`, "ok");
      A.route();
    });
  };
  acts.newDest = () => openDrawer("New external address",
    `<label class="field"><span>Name</span><input class="input" id="fDestId" placeholder="sms" autocomplete="off"></label>` +
    `<label class="field"><span>Web address</span><input class="input" id="fDestUrl" placeholder="https://sms.example.com/send"></label>` +
    `<label class="field"><span>Allowed networks</span><input class="input" id="fDestCidrs" placeholder="203.0.113.0/24"><small>The network addresses the web address may resolve to; anything else is refused.</small></label>` +
    `<label class="check"><input type="checkbox" id="fDestOk">Approved: tools may send to it</label>`,
    `<button class="btn" data-act="closeDrawer">Cancel</button><button class="btn primary" data-act="saveDest">Add</button>`);
  acts.saveDest = () => {
    const id = val("fDestId").trim(), url = val("fDestUrl").trim(), cidrs = val("fDestCidrs").trim();
    if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) return toast("Use lowercase letters, digits and dashes for the name", "bad");
    if (S.destinations.some(x => x.id === id)) return toast(`${id} already exists`, "bad");
    if (!/^https?:\/\/[^\s]+$/.test(url)) return toast("Give a web address starting with https://", "bad");
    if (!/^[0-9a-f:.]+\/\d+(\s*,\s*[0-9a-f:.]+\/\d+)*$/i.test(cidrs)) return toast("Give networks such as 203.0.113.0/24", "bad");
    applyBoth(st => st.destinations.push({ id, url, cidrs, approved: document.getElementById("fDestOk").checked }));
    recordAdmin("added an external address", id);
    closeDrawer();
    A.route();
  };
  acts.approveDest = d => { applyBoth(st => { st.destinations.find(x => x.id === d.id).approved = true; }); recordAdmin("approved an external address", d.id); A.route(); };
  acts.removeDest = d => {
    const used = S.tools.filter(t => t.destination === d.id);
    confirm(`Remove ${d.id}?`, `<p>Tools can no longer send to it.${used.length ? ` <b>${plural(used.length, "tool")}</b> use it and stop working: ${used.map(t => esc(t.name)).join(", ")}.` : ""}</p>` +
      gap("the tool service has no way to remove an address yet."), "Remove address", () => {
      applyBoth(st => { st.destinations = st.destinations.filter(x => x.id !== d.id); });
      recordAdmin("removed an external address", d.id);
      A.route();
    });
  };
  acts.toggleMcp = () => {
    if (S.mcp.enabled) {
      return confirm("Turn off the AI assistant tools?", `<p>AI assistants can no longer reach anything through fga.</p>` + gap("fga can turn them on, not off. Today the rules can stop them instead."),
        "Turn off", () => { applyBoth(st => { st.mcp.enabled = false; }); recordAdmin("turned off the AI assistant tools", "mcp"); A.route(); });
    }
    applyBoth(st => { st.mcp.enabled = true; });
    recordAdmin("turned on the AI assistant tools", "mcp");
    A.route();
  };

  // ---------------------------------------------------------------- rules

  const rq = { q: "", type: "", role: "" };
  function ruleSentence(r) {
    const w = W.rule(r);
    return `<span class="sentence"><b>${esc(w.who)}</b> ${w.verb} ${r.actions.map(a => actChip(a, r.type, r.effect === "deny" ? "deny" : "on")).join(" ") || "<i>do nothing yet</i>"} ` +
      `on ${esc(w.what)}${w.when ? ` when ${esc(w.when.text)}` : ""}</span>` + (A.tech && r.when ? `<code class="tech block">${esc(r.when)}</code>` : "");
  }
  A.ruleSentence = ruleSentence;

  function renderRules() {
    const draft = A.changes.filter(c => c.area === "policy").length;
    shell("Rules", "", `<div class="page">${pageHead("Rules",
      `Version ${S.bundle.epoch}, signed by ${esc(S.bundle.keyId)}, in force since ${when(S.bundle.activated)}. Changes collect in a draft, which is signed on a separate computer; the signing key never reaches this console.`,
      `<a class="btn" href="#/admin/graph">${icon("graph")}Access graph</a><button class="btn primary" data-act="editRule" data-new="1">${icon("plus")}New rule</button>`)}` +
      (draft ? `<div class="banner warn">${icon("policy")}<span><b>${plural(draft, "unsaved rule change")}</b> in the draft.</span><button class="btn sm" data-act="reviewChanges">Review and export</button></div>` : "") +
      `<div class="card filters-card"><div class="card-head filters"><input class="input search" placeholder="Search rules" value="${esc(rq.q)}" data-on-input="rqQ" aria-label="Search rules">` +
      `<select class="input" data-on-change="rqSet" data-k="type" aria-label="Kind of thing"><option value="">Everything</option>${Object.keys(S.types).map(t => `<option value="${esc(t)}" ${rq.type === t ? "selected" : ""}>${esc(W.type(t).many)}</option>`).join("")}</select>` +
      `<select class="input" data-on-change="rqSet" data-k="role" aria-label="Role"><option value="">All roles</option>${["*", ...allRoles()].map(r => `<option value="${esc(r)}" ${rq.role === r ? "selected" : ""}>${roleName(r, true)}</option>`).join("")}</select></div></div>` +
      `<div id="ruleGroups">${ruleGroups()}</div></div>`);
  }
  A.routes["/admin/rules"] = renderRules;
  function ruleGroups() {
    const q = rq.q.trim().toLowerCase();
    const list = S.rules.filter(r => (!rq.type || r.type === rq.type) && (!rq.role || r.roles.includes(rq.role)) &&
      (!q || `${ruleTitle(r)} ${r.id} ${W.rule(r).who} ${r.actions.map(a => W.action(a, r.type).label).join(" ")}`.toLowerCase().includes(q)));
    const types = [...new Set(list.map(r => r.type))].sort((a, b) => W.type(a).many.localeCompare(W.type(b).many));
    if (!types.length) return `<div class="card"><div class="empty">${icon("policy")}<div>No rule matches.</div></div></div>`;
    return types.map(t => `<div class="card spaced"><div class="card-head"><div><h3>${typeName(t, true)}</h3><div class="muted small">${esc(W.type(t).help)}</div></div></div>` +
      list.filter(r => r.type === t).map(r => `<div class="rule-row clickable" data-act="editRule" data-id="${esc(r.id)}"><span class="badge ${r.set === "ceiling" ? "deny solid" : r.effect}">${esc(W.rule(r).kind)}</span>` +
        `<div class="grow min0"><b>${esc(ruleTitle(r))}</b>${tech(r.id)}<div>${ruleSentence(r)}</div></div>${icon("chevron", "sm")}</div>`).join("") + `</div>`).join("");
  }
  acts.rqQ = (d, el) => { rq.q = el.value; document.getElementById("ruleGroups").innerHTML = ruleGroups(); };
  acts.rqSet = (d, el) => { rq[d.k] = el.value; document.getElementById("ruleGroups").innerHTML = ruleGroups(); };

  // The rule form keeps its choices in rf and redraws the parts that depend
  // on them; the name field keeps its focus.
  let rf = null;
  acts.editRule = d => {
    const r = d.new === "1" ? null : S.rules.find(x => x.id === d.id);
    const m = W.matchCondition(r ? r.when : "");
    rf = r ? { id: r.id, name: r.name || "", type: r.type, effect: r.set === "ceiling" ? "ceiling" : r.effect, roles: new Set(r.roles),
      actions: new Set(r.actions), conds: new Set(m.ids), custom: m.custom }
      : { id: null, name: "", type: d.type || "storage.object", effect: "allow", roles: new Set(d.role ? [d.role] : []), actions: new Set(), conds: new Set(["project"]), custom: "" };
    openDrawer(r ? "Edit rule" : "New rule", `<div id="rfForm"></div>`,
      (r ? `<button class="btn danger" data-act="removeRule" data-id="${esc(r.id)}">Remove rule</button><span class="spacer"></span>` : "") +
      `<button class="btn" data-act="closeDrawer">Cancel</button><button class="btn primary" data-act="saveRule">Save to draft</button>`, { wide: true });
    rfRender();
  };
  function rfRender() {
    const t = rf.type, conds = W.conditionsFor(t), showCustom = A.tech || rf.custom;
    document.getElementById("rfForm").innerHTML =
      `<label class="field"><span>Name</span><input class="input" id="rfName" value="${esc(rf.name)}" placeholder="${esc(W.ruleTitle(rfRule()))}" data-on-input="rfName"></label>` +
      `<label class="field"><span>About</span><select class="input" data-on-change="rfType">${Object.keys(S.types).sort((a, b) => W.type(a).many.localeCompare(W.type(b).many))
        .map(x => `<option value="${esc(x)}" ${x === t ? "selected" : ""}>${esc(W.type(x).many)}</option>`).join("")}</select><small>${esc(W.type(t).help)}</small></label>` +
      `<div class="field"><span>Effect</span><div class="seg">${[["allow", "Allow"], ["deny", "Never allow"], ["ceiling", "Hard limit"]].map(([v, l]) =>
        `<button class="${rf.effect === v ? `on ${v === "allow" ? "allow" : "deny"}` : ""}" data-act="rfEffect" data-v="${v}">${l}</button>`).join("")}</div>` +
      `<small>${rf.effect === "allow" ? "Allows what it names, if no rule forbids it." : rf.effect === "deny" ? "Forbids what it names. A forbidding rule always wins over allowing ones."
        : "Checked before every other rule, and only forbids. For limits that must never be lifted."}</small></div>` +
      `<div class="field"><span>Who</span><div class="check-grid">${["*", ...allRoles()].map(r => `<label class="check" title="${esc(W.role(r).help)}">` +
        `<input type="checkbox" data-on-change="rfRole" data-r="${esc(r)}" ${rf.roles.has(r) ? "checked" : ""}>${roleName(r, true)}${tech(r)}</label>`).join("")}</div></div>` +
      `<div class="field"><span>May</span><div class="check-grid">${S.types[t].map(a => `<label class="check" title="${esc(W.action(a, t).help)}">` +
        `<input type="checkbox" data-on-change="rfAction" data-a="${esc(a)}" ${rf.actions.has(a) ? "checked" : ""}>${esc(W.action(a, t).label)}${tech(a)}</label>`).join("")}</div></div>` +
      `<div class="field"><span>Only when</span>${conds.map(c => `<label class="check"><input type="checkbox" data-on-change="rfCond" data-c="${esc(c.id)}" ${rf.conds.has(c.id) ? "checked" : ""}>${esc(c.text)}</label>`).join("") ||
        '<span class="muted small">No ready-made conditions for this kind of thing.</span>'}` +
      (showCustom ? `<label class="field sub"><span>Custom condition (technical)</span><textarea class="input" id="rfCustom" data-on-input="rfCustom" placeholder="resource.attributes.label_rank < 2">${esc(rf.custom)}</textarea>` +
        `<small id="rfCustomHint"></small></label>` : `<small>Nothing ticked: the rule always applies. Switch on Technical names for a custom condition.</small>`) + `</div>` +
      `<div class="preview-rule" id="rfPreview"></div>`;
    rfPreview();
  }
  const rfRule = () => ({ type: rf.type, effect: rf.effect === "allow" ? "allow" : "deny", set: rf.effect === "ceiling" ? "ceiling" : "business",
    roles: [...rf.roles], actions: [...rf.actions], when: W.conditionExpr([...rf.conds], rf.custom, [...rf.actions]) });
  function rfPreview() {
    const r = rfRule(), err = P.check(r.when), el = document.getElementById("rfPreview");
    el.innerHTML = `<small>Reads as</small><div>${ruleSentence(r)}</div>`;
    const hint = document.getElementById("rfCustomHint");
    if (hint) { hint.className = err ? "hint-bad" : "hint-ok"; hint.textContent = rf.custom ? (err || "Valid") : ""; }
    const name = document.getElementById("rfName");
    if (name) name.placeholder = W.ruleTitle(r);
  }
  acts.rfName = (d, el) => { rf.name = el.value; };
  acts.rfType = (d, el) => { rf.type = el.value; rf.actions.clear(); rf.conds = new Set([...rf.conds].filter(c => W.condition(c).types.includes(rf.type))); rfRender(); };
  acts.rfEffect = d => { rf.effect = d.v; rfRender(); };
  const toggle = (set, v, on) => (on ? set.add(v) : set.delete(v));
  acts.rfRole = (d, el) => { toggle(rf.roles, d.r, el.checked); rfPreview(); };
  acts.rfAction = (d, el) => { toggle(rf.actions, d.a, el.checked); rfPreview(); };
  acts.rfCond = (d, el) => { toggle(rf.conds, d.c, el.checked); rfPreview(); };
  acts.rfCustom = (d, el) => { rf.custom = el.value; rfPreview(); };
  acts.saveRule = () => {
    const r = rfRule();
    if (!r.roles.length) return toast("Choose who the rule is for", "bad");
    if (!r.actions.length) return toast("Choose what it allows or forbids", "bad");
    if (rf.conds.has("shared") && r.actions.length !== 1) return toast("A rule about shared access names exactly one action", "bad");
    const err = P.check(r.when);
    if (err) return toast(`The custom condition is not valid: ${err}`, "bad");
    const name = rf.name.trim() || W.ruleTitle(r);
    if (rf.id) {
      const x = S.rules.find(y => y.id === rf.id);
      Object.assign(x, r, { name });
      change("policy", `Changed rule “${name}”`);
    } else {
      const id = unique(slug(name) || "rule", y => S.rules.some(z => z.id === y));
      S.rules.push({ ...r, id, name });
      change("policy", `New rule “${name}”`);
    }
    closeDrawer();
    toast("Saved to the draft", "ok");
    A.route();
  };
  acts.removeRule = d => {
    const x = S.rules.find(y => y.id === d.id);
    confirm(`Remove the rule “${ruleTitle(x)}”?`, `<div class="preview-rule">${ruleSentence(x)}</div>` +
      `<p class="muted small">${x.effect === "allow" ? "What it allows is no longer allowed, unless another rule allows it." : "What it forbids may then be allowed by other rules."} ` +
      `The change becomes active when the next rule set is signed.</p>`, "Remove rule", () => {
      S.rules = S.rules.filter(y => y.id !== d.id);
      change("policy", `Removed rule “${ruleTitle(x)}”`);
      A.route();
    });
  };

  // ---------------------------------------------------------------- servers

  const ROLE_FILES = { decision: "decision.json", storage: "storage.json", keys: "keys.json", kms: "kms.json", mcp: "mcp.json", tools: "tools.json", admin: "admin.json" };
  const SERVER_KINDS = [["decision", "Decides every request"], ["storage", "Stores files and documents"], ["keys", "Hands out file keys"],
    ["kms", "Keeps the master keys"], ["mcp", "Connects AI assistants"], ["tools", "Runs tools"], ["admin", "Serves this console's changes"]];
  const STATUS = { running: ["ok", "Running"], pending: ["warn", "New settings to apply"], retired: ["muted", "Retired"] };

  function renderServers() {
    shell("Servers", "", `<div class="page wide">${pageHead("Servers",
      "The fga services and where they run. The console never changes a running server: it checks new settings and exports them as a file, which someone on that server puts in place before restarting the service.",
      `<button class="btn primary" data-act="addServer">${icon("plus")}Add a server</button>`)}` +
      `<div class="card"><table class="tbl"><thead><tr><th>Service</th><th>Runs on</th><th class="hide-sm">Listens on</th><th class="hide-md">Mode</th><th>Status</th><th></th></tr></thead><tbody>` +
      S.servers.map((s, i) => `<tr><td class="wcol"><b>${esc(s.purpose)}</b><div class="muted small">${esc(s.name)}</div></td><td class="nowrap">${esc(s.host)}</td>` +
        `<td class="hide-sm mono">${esc(s.settings.listen)}</td><td class="hide-md">${s.settings.profile === "production" ? "Production" : "Development"}</td>` +
        `<td><span class="badge ${STATUS[s.status][0]}">${STATUS[s.status][1]}</span></td>` +
        `<td class="actions">${s.status === "retired" ? "" : `<button class="btn sm" data-act="serverSettings" data-i="${i}">${icon("gear", "sm")}Settings</button>` +
          `<button class="btn sm icon ghost" data-act="retireServer" data-i="${i}" aria-label="Retire" title="Retire">${icon("trash")}</button>`}</td></tr>`).join("") +
      `</tbody></table></div></div>`);
  }
  A.routes["/admin/servers"] = renderServers;

  acts.addServer = () => openDrawer("Add a server",
    `<label class="field"><span>Service</span><select class="input" id="fKind">${SERVER_KINDS.map(([k, t]) => `<option value="${k}">${esc(t)} (fga-${k})</option>`).join("")}</select></label>` +
    `<label class="field"><span>Runs on</span><input class="input" id="fHost" placeholder="fga-store-2"><small>The server's name in your network.</small></label>`,
    `<button class="btn" data-act="closeDrawer">Cancel</button><button class="btn primary" data-act="addServerNext">Next: settings</button>`);
  acts.addServerNext = () => {
    const kind = val("fKind"), host = val("fHost").trim();
    if (!/^[a-z0-9][a-z0-9.-]*$/.test(host)) return toast("Give the server's name, such as fga-store-2", "bad");
    const like = S.servers.find(s => s.role === kind);
    const settings = structuredClone(like ? like.settings : { version: 1, profile: "production", listen: "0.0.0.0:8443", tls: {}, database_url: "", token_issuer: {} });
    S.servers.push({ role: kind, name: `fga-${kind}`, purpose: SERVER_KINDS.find(x => x[0] === kind)[1], host, status: "pending", settings, added: true });
    acts.serverSettings({ i: String(S.servers.length - 1) });
  };

  const maskDb = url => String(url || "").replace(/:\/\/([^:@/]+):[^@]*@/, "://$1:••••••@");
  function serverField(id, label, value, help = "", placeholder = "") {
    return `<label class="field"><span>${esc(label)}</span><input class="input" id="${id}" value="${esc(value || "")}" placeholder="${esc(placeholder)}" autocomplete="off">${help ? `<small>${esc(help)}</small>` : ""}</label>`;
  }
  acts.serverSettings = d => {
    const s = S.servers[Number(d.i)], c = s.settings, tls = c.tls || {}, ti = c.token_issuer || {};
    openDrawer(`${s.purpose} · ${s.host}`,
      `<p class="muted small">${esc(s.name)} on ${esc(s.host)}. Nothing here reaches the server until its settings file is replaced and the service restarted.</p>` +
      `<fieldset><legend>General</legend><div class="field"><span>Mode</span><div class="seg">${[["production", "Production"], ["development", "Development"]].map(([v, l]) =>
        `<label class="seg-opt"><input type="radio" name="sMode" value="${v}" ${c.profile === v ? "checked" : ""}>${l}</label>`).join("")}</div>` +
      `<small>Production needs certificates and refuses development shortcuts.</small></div>` +
      serverField("sListen", "Listens on", c.listen, "Address and port, such as 0.0.0.0:8443") + `</fieldset>` +
      `<fieldset><legend>Certificates</legend>` + serverField("sCert", "Certificate file", tls.cert_file) + serverField("sKey", "Private key file", tls.key_file) +
      serverField("sCa", "Trusted client certificates", tls.client_ca_file, "Only callers with a certificate from this authority get in") + `</fieldset>` +
      (s.role === "kms" ? "" : `<fieldset><legend>Database</legend>` + serverField("sDb", "Database address", maskDb(c.database_url),
        "The console never sees or exports the password: put it in on the server") + `</fieldset>`) +
      `<fieldset><legend>Sign-in</legend>` + serverField("sIss", "Login provider", ti.issuer, "", "https://login.example.org/") +
      serverField("sJwks", "Login provider's keys", ti.jwks_url, "", "https://login.example.org/.well-known/jwks.json") + `</fieldset>` +
      (c.decision ? `<fieldset><legend>Connections</legend>` + serverField("sDec", "Decision service", c.decision.url) +
        (c.storage_url ? serverField("sSto", "File storage", c.storage_url) : "") + `</fieldset>` : "") +
      (c.journal_dir || c.blob_dir || c.kek_file || c.bundle_dir ? `<fieldset><legend>Folders on the server</legend>` +
        (c.journal_dir ? serverField("sJournal", "Security journal", c.journal_dir) : "") + (c.blob_dir ? serverField("sBlobs", "Stored files", c.blob_dir) : "") +
        (c.kek_file ? serverField("sKek", "Master key file", c.kek_file) : "") + (c.bundle_dir ? serverField("sBundle", "Signed rules", c.bundle_dir) : "") + `</fieldset>` : "") +
      (s.role === "admin" ? `<fieldset><legend>Administration</legend>` + serverField("sAdmins", "Administrators", (c.admins[S.org.id] || []).join(", "),
        "Sign-in names, comma-separated. Only this file makes someone an administrator.") +
        serverField("sConsoles", "Allowed consoles", (c.consoles || []).join(", "), "The certificate names of consoles that may connect") + `</fieldset>` : "") +
      `<div id="sErrors"></div>`,
      `<button class="btn" data-act="closeDrawer">Cancel</button><button class="btn primary" data-act="exportServer" data-i="${esc(d.i)}">${icon("download")}Check and export</button>`, { wide: true });
  };
  acts.exportServer = d => {
    const s = S.servers[Number(d.i)], c = structuredClone(s.settings), v = id => val(id).trim(), errors = [];
    c.profile = (checked("#drawer input[name=sMode]")[0] || { value: c.profile }).value;
    c.listen = v("sListen");
    c.tls = { cert_file: v("sCert"), key_file: v("sKey"), client_ca_file: v("sCa") };
    if (document.getElementById("sDb")) {
      const db = v("sDb");
      c.database_url = db.includes("••••••") ? db.replace("••••••", "PASSWORD") : db;
      if (!/^postgres(ql)?:\/\/\S+$/.test(db)) errors.push("The database address must start with postgres://");
    }
    c.token_issuer = { issuer: v("sIss"), jwks_url: v("sJwks") };
    if (c.decision) c.decision = { url: v("sDec") };
    if (document.getElementById("sSto")) c.storage_url = v("sSto");
    for (const [id, k] of [["sJournal", "journal_dir"], ["sBlobs", "blob_dir"], ["sKek", "kek_file"], ["sBundle", "bundle_dir"]]) if (document.getElementById(id)) c[k] = v(id);
    if (s.role === "admin") {
      c.admins = { ...c.admins, [S.org.id]: v("sAdmins").split(/[\s,]+/).filter(Boolean) };
      c.consoles = v("sConsoles").split(/[\s,]+/).filter(Boolean);
      if (!c.admins[S.org.id].length) errors.push("Name at least one administrator");
      if (!c.consoles.length) errors.push("Name at least one allowed console");
    }
    const m = /^(.+):(\d{1,5})$/.exec(c.listen);
    if (!m) errors.push("Listens on needs an address and a port, such as 0.0.0.0:8443");
    const loopback = m && /^(127\.|localhost$|\[::1\]$)/.test(m[1]);
    const noTls = !c.tls.cert_file || !c.tls.key_file || !c.tls.client_ca_file;
    if (c.profile === "production" && noTls) errors.push("Production needs a certificate, its private key and trusted client certificates");
    if (c.profile === "development" && noTls && !loopback) errors.push("Without certificates, a development server may listen only on this machine (127.0.0.1)");
    if (c.profile === "production" && !/^https:\/\//.test(c.token_issuer.issuer || "")) errors.push("In production the login provider must use https://");
    for (const u of [c.decision && c.decision.url, c.storage_url].filter(Boolean)) if (c.profile === "production" && !/^https:\/\//.test(u)) errors.push(`${u} must use https:// in production`);
    if (!c.tls.cert_file && !c.tls.key_file && !c.tls.client_ca_file) delete c.tls;
    const box = document.getElementById("sErrors");
    if (errors.length) {
      box.innerHTML = `<div class="banner bad">${icon("warn")}<ul>${errors.map(e => `<li>${esc(e)}</li>`).join("")}</ul></div>`;
      box.scrollIntoView({ block: "nearest" });
      return;
    }
    s.settings = c;
    s.status = "pending";
    const file = ROLE_FILES[s.role];
    download(`${s.host}-${file}`, JSON.stringify(c, null, 2), "application/json");
    recordAdmin(`exported new settings for ${s.name}`, s.host);
    openDrawer("Settings exported", `<p>The file <b>${esc(s.host)}-${esc(file)}</b> is in your downloads. To apply it:</p><ol class="steps">` +
      `<li>Copy it to <b>${esc(s.host)}</b> as <span class="mono">/etc/fga/${esc(file)}</span>${c.database_url && c.database_url.includes("PASSWORD") ? ", and put in the database password where it says PASSWORD" : ""}.</li>` +
      `<li>Restart ${esc(s.name)}: <span class="mono">systemctl restart ${esc(s.name)}</span></li>` +
      `<li>Check that it reports healthy, here or with <span class="mono">curl https://${esc(s.host)}:${esc(c.listen.split(":").pop())}/healthz</span></li></ol>`,
      `<button class="btn" data-act="closeDrawer">Later</button><button class="btn primary" data-act="serverApplied" data-i="${esc(d.i)}">${icon("check")}It is applied</button>`);
  };
  acts.serverApplied = d => { S.servers[Number(d.i)].status = "running"; closeDrawer(); toast("Marked as applied", "ok"); A.route(); };
  acts.retireServer = d => {
    const s = S.servers[Number(d.i)], last = S.servers.filter(x => x.role === s.role && x.status !== "retired").length === 1;
    confirm(`Retire ${s.name} on ${s.host}?`, (last ? `<div class="banner bad">${icon("warn")}<span>This is the only ${esc(s.name)}: without it, ${esc(s.purpose.toLowerCase())} stops for everyone.</span></div>` : "") +
      `<p>The console cannot stop servers. Retiring lists it as retired; then, on ${esc(s.host)}:</p><ol class="steps"><li>Stop it: <span class="mono">systemctl disable --now ${esc(s.name)}</span></li>` +
      `<li>Remove <span class="mono">/etc/fga/${esc(ROLE_FILES[s.role])}</span> and its certificate.</li></ol>`, "Retire", () => {
      s.status = "retired";
      recordAdmin(`retired ${s.name}`, s.host);
      A.route();
    });
  };

  // ---------------------------------------------------------------- audit

  const af = { decision: "all", q: "", shown: 50 };
  function renderAudit(params) {
    if (params.get("d")) af.decision = params.get("d");
    const rows = () => S.audit.filter(e => (af.decision === "all" || (af.decision === "admin" ? e.admin : !e.admin && e.decision === af.decision)) &&
      (!af.q || `${displayName(e.actor)} ${e.actor} ${W.action(e.action, e.type).label} ${e.resource} ${e.why}`.toLowerCase().includes(af.q.toLowerCase())));
    const draw = () => {
      const list = rows();
      document.getElementById("auditRows").innerHTML = auditTable(list.slice(0, af.shown), { full: true }) +
        (list.length > af.shown ? `<div class="pager"><span class="muted small">${af.shown} of ${list.length}</span><span class="spacer"></span><button class="btn sm" data-act="auditMore">Show more</button></div>` : "");
    };
    shell("Audit log", "", `<div class="page wide">${pageHead("Audit log", "Every decision, allowed or not, and every change, with the reason. fga keeps this log as a signed chain that cannot be altered unnoticed.")}` +
      `<div class="card"><div class="card-head filters"><div class="seg">${[["all", "All"], ["allow", "Allowed"], ["deny", "Not allowed"], ["admin", "Changes"]].map(([v, l]) =>
        `<button class="${af.decision === v ? "on" : ""}" data-act="auditDecision" data-v="${v}">${l}</button>`).join("")}</div>` +
      `<input class="input search right" placeholder="Search who, what or why" value="${esc(af.q)}" data-on-input="auditSearch" aria-label="Search the audit log"></div>` +
      `<div id="auditRows"></div></div></div>`);
    draw();
    acts.auditSearch = (d, el) => { af.q = el.value; af.shown = 50; draw(); };
    acts.auditMore = () => { af.shown += 50; draw(); };
  }
  A.routes["/admin/audit"] = renderAudit;
  acts.auditDecision = d => { af.decision = d.v; af.shown = 50; go("/admin/audit"); };
})();

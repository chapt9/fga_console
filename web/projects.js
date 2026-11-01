// Projects: a team with its own spaces. Members use the files in the
// project's spaces; team leads run the project (members, leads, spaces).
// People with the right "Create projects" start their own projects and lead
// them. Every change a user makes is decided by the rules, like any other
// request; administrators can change any project. In fga, projects need
// new operations (see README): today they exist only as names on people
// and spaces.
"use strict";

(() => {
  const A = window.FGA_APP, { S, W, acts } = A;
  const { icon, esc, avatar, displayName, plural, tech, toast, applyBoth, shell, pageHead, openDrawer, closeDrawer, confirm, gap, person,
    bucketOf, decide, whyText, record, recordAdmin, people, matchPerson, projectName, val, checked, slug, go, actChip } = A;

  const project = id => S.projects.find(p => p.id === id);
  const projectRes = p => ({ type: "directory.project", id: p.id, attributes: { project: p.id } });
  const membersOf = p => S.principals.filter(x => x.kind === "user" && x.status === "active" && (x.attributes.projects || []).includes(p.id));
  const leadsOf = p => membersOf(p).filter(x => (x.attributes.leads || []).includes(p.id));
  const spacesOf = p => S.buckets.filter(b => b.project === p.id);
  const isAdmin = () => A.me.admin;
  A.projectRes = projectRes;

  // may decides an action on a project for the signed-in person; the
  // administrator works through the admin API and may do everything.
  function may(action, p) {
    if (isAdmin()) return { allowed: true };
    return decide(A.me.id, action, projectRes(p || { id: "new-project" }));
  }
  const why = (res, verb) => res.stage === "bound" ? `You don't have the right to ${verb}`
    : res.stage === "default" ? `Only the project's team leads may ${verb}` : `You may not ${verb}: ${whyText(res)}`;
  function note(action, p, res) {
    if (isAdmin()) recordAdmin(action, p.id);
    else record(A.me.id, action, "directory.project", p.id, res);
  }

  // ---------------------------------------------------------------- lists

  function projectCard(p, base) {
    const me = A.me.id, mine = (person(me) || { attributes: {} }).attributes;
    const role = isAdmin() ? "" : (mine.leads || []).includes(p.id) ? `<span class="badge accent">Team lead</span>` : `<span class="badge muted">Member</span>`;
    return `<a class="card project-card" href="#${base}?id=${encodeURIComponent(p.id)}"><div class="card-body"><div class="pc-head"><span class="fk fk-folder">${icon("folder")}</span>` +
      `<div class="grow"><b>${esc(p.name)}</b>${tech(p.id)}<div class="muted small">${esc(p.description || "")}</div></div>${role}</div>` +
      `<div class="stat-row"><span><b>${spacesOf(p).length}</b> ${spacesOf(p).length === 1 ? "space" : "spaces"}</span><span><b>${membersOf(p).length}</b> members</span>` +
      `<span class="muted small">led by ${leadsOf(p).slice(0, 2).map(x => esc(displayName(x.id))).join(", ") || "nobody"}${leadsOf(p).length > 2 ? ` and ${leadsOf(p).length - 2} more` : ""}</span></div></div></a>`;
  }

  function renderMyProjects() {
    const me = person(A.me.id), mine = S.projects.filter(p => (me.attributes.projects || []).includes(p.id));
    const create = may("create");
    shell("Projects", "", `<div class="page">${pageHead("Your projects",
      "A project is a team with its own spaces: its members use the files in them, and its team leads run it.",
      create.allowed ? `<button class="btn primary" data-act="newProject">${icon("plus")}New project</button>`
        : `<button class="btn" disabled title="${esc(why(create, "create projects"))}">${icon("plus")}New project</button>`)}` +
      (mine.length ? `<div class="grid cards">${mine.map(p => projectCard(p, "/project")).join("")}</div>`
        : `<div class="card"><div class="empty">${icon("folder")}<div>You are not in any project yet.${create.allowed ? " Start one with New project." : " A team lead or an administrator can add you."}</div></div></div>`) +
      `</div>`);
  }
  A.routes["/projects"] = renderMyProjects;

  function renderAllProjects() {
    const rows = S.projects.map(p => `<tr class="clickable" data-act="openProject" data-id="${esc(p.id)}"><td><b>${esc(p.name)}</b>${tech(p.id)}<div class="muted small">${esc(p.description || "")}</div></td>` +
      `<td class="hide-sm"><div class="avatars">${leadsOf(p).slice(0, 4).map(x => avatar(x.id, "sm")).join("")}${leadsOf(p).length > 4 ? `<span class="more">+${leadsOf(p).length - 4}</span>` : ""}</div></td>` +
      `<td class="num">${membersOf(p).length}</td><td class="num">${spacesOf(p).length}</td>` +
      `<td class="hide-md muted small">${p.createdBy ? esc(displayName(p.createdBy)) : "administrator"}</td></tr>`).join("");
    const creators = S.principals.filter(x => x.status === "active" && x.grants.includes("create-projects")).length;
    shell("Projects", "", `<div class="page">${pageHead("Projects",
      `A project is a team with its own spaces. ${creators ? `<a href="#/admin/people?right=%2Bcreate-projects">${plural(creators, "person", "people")}</a> may also create projects of their own.` : ""}`,
      `<button class="btn primary" data-act="newProject">${icon("plus")}New project</button>`)}` +
      `<div class="card"><table class="tbl"><thead><tr><th>Project</th><th class="hide-sm">Team leads</th><th class="num">Members</th><th class="num">Spaces</th><th class="hide-md">Created by</th></tr></thead>` +
      `<tbody>${rows}</tbody></table></div></div>`);
  }
  A.routes["/admin/projects"] = renderAllProjects;
  acts.openProject = d => go(`/admin/project?id=${encodeURIComponent(d.id)}`);

  // ---------------------------------------------------------------- one project

  let memberQ = "";
  function renderProject(params) {
    const p = project(params.get("id"));
    if (!p) return go(isAdmin() ? "/admin/projects" : "/projects");
    const me = person(A.me.id);
    if (!isAdmin() && !(me.attributes.projects || []).includes(p.id)) return go("/projects");
    const canMembers = may("manage-members", p), canLeads = may("manage-leads", p), canSpace = may("create-space", p), canRename = may("rename", p);
    const btn = (res, act, label, ic, verb, cls = "") => res.allowed ? `<button class="btn ${cls}" data-act="${act}" data-id="${esc(p.id)}">${icon(ic)}${label}</button>`
      : `<button class="btn ${cls}" disabled title="${esc(why(res, verb))}">${icon(ic)}${label}</button>`;
    const rulesHere = S.rules.filter(r => r.effect === "allow" && W.matchCondition(r.when).ids.some(id => id === "project" || id === "leads") && r.type !== "directory.project");
    const memberRules = rulesHere.filter(r => W.matchCondition(r.when).ids.includes("project") && r.roles.some(x => x === "member" || x === "*"));
    const leadRules = rulesHere.filter(r => W.matchCondition(r.when).ids.includes("leads"));
    const list = r => r.slice(0, 6).map(x => `<li>${esc(A.ruleTitle(x))}</li>`).join("") + (r.length > 6 ? `<li class="muted">and ${r.length - 6} more</li>` : "");
    shell(p.name, `Project${A.tech ? ` <code class="tech">${esc(p.id)}</code>` : ""}`, `<div class="page">` +
      `<a class="back-link" href="#${isAdmin() ? "/admin/projects" : "/projects"}">${icon("back", "sm")}${isAdmin() ? "All projects" : "Your projects"}</a>` +
      pageHead(p.name, esc(p.description || ""), btn(canRename, "renameProject", "Rename", "tag", "rename it") + btn(canSpace, "newProjectSpace", "New space", "plus", "create spaces in it", "primary")) +
      (isAdmin() ? `<p class="insp-note">As administrator you may change any project. People who lead it can do the same from their Projects page.</p>` : "") +
      `<div class="grid two"><div class="card"><div class="card-head"><h3>Members</h3><span class="muted small">${plural(membersOf(p).length, "person", "people")}</span></div>` +
      `<div class="card-body">${canMembers.allowed ? `<div class="inline"><input class="input" id="addMember" list="addPeople" placeholder="Add someone by name" autocomplete="off">` +
        `<datalist id="addPeople">${people().filter(x => x.status === "active" && !(x.attributes.projects || []).includes(p.id)).map(x => `<option value="${esc(x.id)}">${esc(displayName(x.id))}</option>`).join("")}</datalist>` +
        `<button class="btn" data-act="addMember" data-id="${esc(p.id)}">Add</button></div>` : `<p class="muted small">${esc(why(canMembers, "add or remove members"))}.</p>`}` +
      `<input class="input search-wide" placeholder="Search members" value="${esc(memberQ)}" data-on-input="memberQ" data-id="${esc(p.id)}" aria-label="Search members"></div>` +
      `<div id="memberRows">${memberRows(p, canMembers, canLeads)}</div></div>` +
      `<div class="grid"><div class="card"><div class="card-head"><h3>Spaces</h3></div>` +
      (spacesOf(p).length ? spacesOf(p).map(b => `<div class="list-row">${icon(b.mode === "client" ? "lock" : "bucket")}<div class="grow"><b>${esc(b.name)}</b>` +
        `<div class="muted small">${esc(W.encryption(b.mode).name)} · ${plural(S.objects.filter(o => o.bucket === b.name).length, "file")}</div></div>` +
        (isAdmin() ? "" : `<a class="btn sm" href="#/files?b=${encodeURIComponent(b.name)}">Open</a>`) + `</div>`).join("")
        : `<div class="empty small">No spaces yet.${canSpace.allowed ? " Create one with New space." : ""}</div>`) + `</div>` +
      `<div class="card"><div class="card-head"><h3>What being in it gives</h3></div><div class="card-body small">` +
      `<p><b>Members</b>, by the rules, within their own rights:</p><ul class="tight">${list(memberRules)}</ul>` +
      `<p><b>Team leads</b> also:</p><ul class="tight">${list(leadRules)}<li>${esc(A.ruleTitle(S.rules.find(r => r.id === "leads-run-projects") || { name: "Run the project" }))}</li></ul>` +
      `<p class="muted">What someone may do is always the smaller of their rights and these rules.</p></div></div>` +
      (isAdmin() ? `<div class="card"><div class="card-body"><button class="btn danger" data-act="removeProject" data-id="${esc(p.id)}">${icon("trash", "sm")}Remove project</button></div></div>` : "") +
      `</div></div></div>`);
    acts.memberQ = (d, el) => { memberQ = el.value; document.getElementById("memberRows").innerHTML = memberRows(p, canMembers, canLeads); };
  }
  A.routes["/project"] = renderProject;
  A.routes["/admin/project"] = renderProject;

  function memberRows(p, canMembers, canLeads) {
    const list = membersOf(p).filter(x => matchPerson(x, memberQ.trim()))
      .sort((a, b) => ((b.attributes.leads || []).includes(p.id) - (a.attributes.leads || []).includes(p.id)) || displayName(a.id).localeCompare(displayName(b.id)));
    const lead = x => (x.attributes.leads || []).includes(p.id);
    return list.slice(0, 40).map(x => `<div class="list-row">${avatar(x.id, "sm")}<div class="grow"><b>${esc(displayName(x.id))}</b>` +
      `${lead(x) ? ` <span class="badge accent">Team lead</span>` : ""}${lead(x) && !x.grants.includes("lead-projects") ? ` <span class="badge warn" title="Leads it, but lacks the right to run projects">cannot run it</span>` : ""}` +
      (isAdmin() && A.rightsText ? `<div class="muted small">${esc(A.rightsText(x))}</div>` : "") + `</div>` +
      (canLeads.allowed ? `<button class="btn sm ghost" data-act="${lead(x) ? "unmakeLead" : "makeLead"}" data-id="${esc(p.id)}" data-p="${esc(x.id)}">${lead(x) ? "No longer lead" : "Make lead"}</button>` : "") +
      (canMembers.allowed && x.id !== A.me.id ? `<button class="btn sm icon ghost" data-act="removeMember" data-id="${esc(p.id)}" data-p="${esc(x.id)}" aria-label="Remove from project" title="Remove from project">${icon("x")}</button>` : "") +
      `</div>`).join("") + (list.length > 40 ? `<div class="muted small pad">and ${list.length - 40} more: search to narrow</div>` : "") +
      (list.length ? "" : `<div class="empty small">No one matches.</div>`);
  }

  // change applies a project change for everyone at once: in fga, through
  // the project operations, each decided and recorded.
  function change(p, action, text, fn) {
    const res = may(action, p);
    if (!res.allowed) { note(action, p, res); return toast(why(res, text), "bad"); }
    applyBoth(fn);
    note(action, p, res);
    A.route();
  }
  const setProjects = (st, id, f) => { const x = st.principals.find(y => y.id === id); x.attributes = f({ ...x.attributes, projects: [...(x.attributes.projects || [])], leads: [...(x.attributes.leads || [])] }); };

  acts.addMember = d => {
    const p = project(d.id), id = val("addMember").trim(), x = person(id);
    if (!x || x.kind !== "user" || x.status !== "active") return toast("Choose an active person", "bad");
    if ((x.attributes.projects || []).includes(p.id)) return toast(`${displayName(id)} is already a member`, "bad");
    change(p, "manage-members", "add members", st => setProjects(st, id, a => ({ ...a, projects: [...a.projects, p.id] })));
    toast(`${displayName(id)} is now a member of ${p.name}`, "ok");
  };
  acts.removeMember = d => {
    const p = project(d.id);
    confirm(`Remove ${displayName(d.p)} from ${p.name}?`, `<p>They lose what membership gave them in its spaces, at once. Their own rights stay as they are.</p>` +
      `<p class="muted small">${icon("lock", "xs")} Written to fga's security journal first, so restoring an old backup cannot bring it back.</p>`, "Remove", () =>
      change(p, "manage-members", "remove members", st => setProjects(st, d.p, a => ({ ...a, projects: a.projects.filter(x => x !== p.id), leads: a.leads.filter(x => x !== p.id) }))));
  };
  acts.makeLead = d => {
    const p = project(d.id);
    change(p, "manage-leads", "choose team leads", st => setProjects(st, d.p, a => ({ ...a, leads: [...new Set([...a.leads, p.id])] })));
    if (!person(d.p).grants.includes("lead-projects")) toast(`${displayName(d.p)} leads ${p.name} now, but lacks the right to run projects: an administrator can give it`);
  };
  acts.unmakeLead = d => {
    const p = project(d.id);
    if (leadsOf(p).length === 1) return toast("A project needs at least one team lead", "bad");
    change(p, "manage-leads", "choose team leads", st => setProjects(st, d.p, a => ({ ...a, leads: a.leads.filter(x => x !== p.id) })));
  };

  acts.renameProject = d => {
    const p = project(d.id);
    openDrawer(`Rename ${p.name}`, `<label class="field"><span>Name</span><input class="input" id="fPName" value="${esc(p.name)}"></label>` +
      `<label class="field"><span>What it is for</span><input class="input" id="fPDesc" value="${esc(p.description || "")}"></label>`,
      `<button class="btn" data-act="closeDrawer">Cancel</button><button class="btn primary" data-act="saveRename" data-id="${esc(p.id)}">Save</button>`);
  };
  acts.saveRename = d => {
    const p = project(d.id), name = val("fPName").trim(), description = val("fPDesc").trim();
    if (!name) return toast("Give the project a name", "bad");
    if (S.projects.some(x => x.id !== p.id && x.name.toLowerCase() === name.toLowerCase())) return toast(`There is a project called ${name} already`, "bad");
    closeDrawer();
    change(p, "rename", "rename it", st => Object.assign(st.projects.find(x => x.id === p.id), { name, description }));
  };

  const spaceForm = (prefix, id) => `<label class="field"><span>Name</span><input class="input" id="${id}" value="${esc(prefix)}" autocomplete="off" data-on-input="spaceTouched"><small>Lowercase letters, digits, dots and dashes.</small></label>` +
    `<div class="field"><span>Encryption</span>${["server", "client"].map(m => `<label class="check big"><input type="radio" name="fSpMode" value="${m}" ${m === "server" ? "checked" : ""}>` +
      `<span><b>${esc(W.encryption(m).name)}</b><small>${esc(W.encryption(m).help)}</small></span></label>`).join("")}</div>`;
  const spaceError = name => !/^[a-z0-9][a-z0-9.-]{1,62}$/.test(name) ? "Use lowercase letters, digits, dots and dashes for the space"
    : bucketOf(name) ? `There is a space called ${name} already` : "";

  acts.newProjectSpace = d => {
    const p = project(d.id);
    openDrawer(`New space in ${p.name}`, spaceForm(`${p.id}-`, "fSpName") + `<p class="muted small">Its files belong to ${esc(p.name)}: the project's members use them, within their rights.</p>`,
      `<button class="btn" data-act="closeDrawer">Cancel</button><button class="btn primary" data-act="saveProjectSpace" data-id="${esc(p.id)}">Create</button>`);
  };
  acts.saveProjectSpace = d => {
    const p = project(d.id), name = val("fSpName").trim(), err = spaceError(name), mode = (checked("#drawer input[name=fSpMode]")[0] || { value: "server" }).value;
    if (err) return toast(err, "bad");
    closeDrawer();
    change(p, "create-space", "create spaces in it", st => st.buckets.push({ name, project: p.id, mode }));
    toast(`Created the space ${name} in ${p.name}`, "ok");
  };

  // A new project must not take the name of one that exists: the name is
  // what rules compare, so taking "finance" would open Finance's files.
  acts.newProject = () => {
    const admin = isAdmin();
    openDrawer("New project",
      `<label class="field"><span>Name</span><input class="input" id="fNewP" placeholder="Orion" autocomplete="off" data-on-input="newPName"><small id="fNewPHint">Names are unique.</small></label>` +
      `<label class="field"><span>What it is for</span><input class="input" id="fNewPDesc" placeholder="The spring product launch"></label>` +
      (admin ? `<label class="field"><span>Team lead</span><input class="input" id="fNewPLead" list="leadPeople" placeholder="Name" autocomplete="off">` +
        `<datalist id="leadPeople">${people().filter(x => x.status === "active").map(x => `<option value="${esc(x.id)}">${esc(displayName(x.id))}</option>`).join("")}</datalist></label>`
        : `<p class="insp-note">You become its team lead, and can then add members and create its spaces.</p>`) +
      `<label class="check"><input type="checkbox" id="fNewPSpace" checked>Create a first space</label>` + `<div class="sub-form">${spaceForm("", "fNewPSpaceName")}</div>`,
      `<button class="btn" data-act="closeDrawer">Cancel</button><button class="btn primary" data-act="saveNewProject">Create project</button>`);
  };
  acts.newPName = (d, el) => {
    const id = slug(el.value), taken = id && S.projects.some(p => p.id === id || p.name.toLowerCase() === el.value.trim().toLowerCase());
    const hint = document.getElementById("fNewPHint"), sp = document.getElementById("fNewPSpaceName");
    hint.className = taken ? "hint-bad" : "";
    hint.textContent = taken ? "A project with this name exists already. Choose another name." : "Names are unique.";
    if (sp && (!sp.dataset.touched)) sp.value = id ? `${id}-files` : "";
  };
  acts.spaceTouched = (d, el) => { el.dataset.touched = "1"; };
  acts.saveNewProject = () => {
    const admin = isAdmin(), name = val("fNewP").trim(), id = slug(name), description = val("fNewPDesc").trim();
    if (!name || !id) return toast("Give the project a name", "bad");
    if (S.projects.some(p => p.id === id || p.name.toLowerCase() === name.toLowerCase())) return toast("A project with this name exists already", "bad");
    const lead = admin ? val("fNewPLead").trim() : A.me.id;
    if (!person(lead) || person(lead).status !== "active") return toast("Choose an active team lead", "bad");
    const withSpace = document.getElementById("fNewPSpace").checked, spaceName = val("fNewPSpaceName").trim();
    const mode = (checked("#drawer input[name=fSpMode]")[0] || { value: "server" }).value;
    if (withSpace && spaceError(spaceName)) return toast(spaceError(spaceName), "bad");
    const res = may("create");
    if (!res.allowed) { record(A.me.id, "create", "directory.project", id, res); return toast(why(res, "create projects"), "bad"); }
    applyBoth(st => {
      st.projects.push({ id, name, description, createdBy: admin ? null : A.me.id });
      setProjects(st, lead, a => ({ ...a, projects: [...new Set([...a.projects, id])], leads: [...new Set([...a.leads, id])] }));
      if (withSpace) st.buckets.push({ name: spaceName, project: id, mode });
    });
    if (admin) recordAdmin("created a project", id); else record(A.me.id, "create", "directory.project", id, res);
    closeDrawer();
    toast(`Created the project ${name}${withSpace ? ` with the space ${spaceName}` : ""}`, "ok");
    go(`${admin ? "/admin/project" : "/project"}?id=${encodeURIComponent(id)}`);
  };

  acts.removeProject = d => {
    const p = project(d.id), spaces = spacesOf(p), files = S.objects.filter(o => spaces.some(b => b.name === o.bucket));
    confirm(`Remove the project ${p.name}?`, `<ul class="consequences"><li><b>${plural(membersOf(p).length, "person loses", "people lose")}</b> their membership.</li>` +
      (spaces.length ? `<li><b>${plural(spaces.length, "space")}</b> with ${plural(files.length, "file")} are removed with it.</li>` : "") + `</ul>` +
      (spaces.length ? gap("fga cannot remove a space yet.") : ""), "Remove project", () => {
      applyBoth(st => {
        st.principals.forEach(x => { if ((x.attributes.projects || []).includes(p.id) || (x.attributes.leads || []).includes(p.id)) setProjects(st, x.id, a => ({ ...a, projects: a.projects.filter(y => y !== p.id), leads: a.leads.filter(y => y !== p.id) })); });
        st.buckets = st.buckets.filter(b => b.project !== p.id);
        st.projects = st.projects.filter(x => x.id !== p.id);
      });
      S.objects = S.objects.filter(o => !spaces.some(b => b.name === o.bucket));
      recordAdmin("removed a project", p.id);
      go("/admin/projects");
    });
  };
})();

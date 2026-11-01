// The access graph page. Three views keep it readable however many people
// there are: Rules (roles, rules and permission sets for one kind of thing;
// people only as counts), One person (that person's roles, permission sets,
// agents and the rules that reach them) and One file (who can do something
// with it, grouped by the rule that decides, at most 30 people as boxes).
"use strict";

(() => {
  const A = window.FGA_APP, G = window.FGA_GRAPH, { S, W, P, acts } = A;
  const { icon, esc, avatar, displayName, day, when, plural, tech, typeName, actChip, roleName, labelChip, projectName, setName, ruleTitle,
    person, bucketOf, findObj, allRoles, rolesText, people, matchPerson, toast, change, shell, objRes, bucketRes, decide, decideFor, whyText,
    plainTrace, whoCan, openAction, objType, fileKindText, baseName, folderOf, go, unique } = A;

  const MAX_PEOPLE = 30;
  const gv = { view: "rules", scope: "storage.object", who: "bob", file: { b: "shared", k: "q4/plan.txt" }, fileAction: "read",
    inspected: null, lastCheck: null, ck: { who: "bob", via: "", action: "read", res: "0" }, pos: {}, roleQ: "" };
  let graph = null;

  const activeUsers = () => S.principals.filter(p => p.status === "active");
  const roleCount = r => (r === "*" ? activeUsers() : activeUsers().filter(p => p.roles.includes(r))).length;
  const posKey = () => gv.view === "rules" ? `rules:${gv.scope}` : gv.view === "person" ? `person:${gv.who}:${gv.scope}` : `file:${gv.file.b}/${gv.file.k}:${gv.fileAction}`;
  const theFile = () => findObj(gv.file.b, gv.file.k);

  // ---------------------------------------------------------------- models

  function newModel() {
    const nodes = new Map(), edges = [];
    return {
      nodes, edges,
      node: (id, kind, props) => { if (!nodes.has(id)) nodes.set(id, { id, kind, ...props }); },
      edge: (from, to, implicit = false) => { if (!edges.some(e => e.id === `${from}->${to}`)) edges.push({ id: `${from}->${to}`, from, to, implicit }); },
      done() { return { nodes, edges: edges.filter(e => nodes.has(e.from) && nodes.has(e.to)) }; },
    };
  }
  const ruleNode = (m, r) => m.node("rule:" + r.id, "rule", { label: W.rule(r).kind, title: ruleTitle(r), effect: r.effect, set: r.set,
    acts: r.actions.map(a => W.action(a, r.type).label), cond: W.rule(r).when ? `when ${W.rule(r).when.text}` : "always", ref: r.id });
  const roleNode = (m, r) => m.node("r:" + r, "role", { label: "Role", title: W.role(r).many, ref: r,
    sub: `${plural(roleCount(r), "person", "people")} · ${plural(S.rules.filter(x => x.type === gv.scope && x.roles.includes(r)).length, "rule")} here` });
  const typeNode = m => m.node("t:" + gv.scope, "type", { label: "About", title: W.type(gv.scope).many, ref: gv.scope,
    acts: S.types[gv.scope].map(a => W.action(a, gv.scope).label) });
  const permNode = (m, id) => m.node("perm:" + id, "perm", { label: "Permission set", title: W.set(id, S.permSets).name, ref: id,
    acts: (S.permSets[id].caps[gv.scope] || []).map(a => W.action(a, gv.scope).label) });
  const personNode = (m, p, extra = {}) => m.node("p:" + p.id, p.kind === "agent" ? "agent" : "user", { label: p.kind === "agent" ? "AI agent" : "Person",
    title: displayName(p.id), ref: p.id, disabled: p.status !== "active", chips: (p.attributes.projects || []).map(projectName), ...extra });

  function rulesModel() {
    const m = newModel(), t = gv.scope, rules = S.rules.filter(r => r.type === t);
    typeNode(m);
    for (const r of new Set([...rules.flatMap(x => x.roles), ...S.extraRoles])) roleNode(m, r);
    for (const id of Object.keys(S.permSets)) {
      if (!S.permSets[id].caps[t]) continue;
      permNode(m, id);
      m.edge("perm:" + id, "t:" + t, true);
    }
    for (const r of rules) {
      ruleNode(m, r);
      r.roles.forEach(x => m.edge("r:" + x, "rule:" + r.id));
      m.edge("rule:" + r.id, "t:" + t, true);
    }
    return m.done();
  }

  function personModel() {
    const m = newModel(), t = gv.scope, p = person(gv.who);
    if (!p) return m.done();
    typeNode(m);
    personNode(m, p);
    const roles = [...p.roles, ...(p.status === "active" ? ["*"] : [])];
    for (const r of roles) { roleNode(m, r); m.edge("p:" + p.id, "r:" + r, r === "*"); }
    for (const g of p.grants) {
      if (!S.permSets[g] || !S.permSets[g].caps[t]) continue;
      permNode(m, g);
      m.edge("p:" + p.id, "perm:" + g);
      m.edge("perm:" + g, "t:" + t, true);
    }
    for (const r of S.rules.filter(x => x.type === t && x.roles.some(y => roles.includes(y)))) {
      ruleNode(m, r);
      r.roles.filter(y => roles.includes(y)).forEach(y => m.edge("r:" + y, "rule:" + r.id));
      m.edge("rule:" + r.id, "t:" + t, true);
    }
    for (const d of S.delegations.filter(x => x.status === "active" && (x.subject === p.id || x.actor === p.id))) {
      const other = person(d.subject === p.id ? d.actor : d.subject);
      if (!other) continue;
      personNode(m, other);
      m.node("d:" + d.id, "dlg", { label: "Acts for", title: `${displayName(d.actor)} for ${displayName(d.subject)}`, ref: d.id,
        sub: `until ${day(d.expires)}`, acts: (d.grants[t] || []).map(a => W.action(a, t).label) });
      m.edge("p:" + d.actor, "d:" + d.id);
      m.edge("d:" + d.id, "p:" + d.subject);
    }
    return m.done();
  }

  // groupTitle names the people a rule lets in, in words.
  function groupTitle(rule) {
    const ids = W.matchCondition(rule.when).ids, o = theFile();
    if (rule.roles.includes("*")) return ids.includes("owner") ? "The owner" : ids.includes("shared") ? "People it is shared with" : "Everyone";
    const who = rule.roles.map(r => W.role(r).many).join(", ");
    return ids.includes("project") && o ? `${who} in ${projectName(bucketOf(o.bucket).project)}` : who;
  }

  function fileModel() {
    const m = newModel(), o = theFile();
    if (!o) return m.done();
    m.node("f:file", "file", { label: fileKindText(o), title: baseName(o.key), sub: `${o.bucket}/${folderOf(o.key)}`,
      chips: [W.label(o.label).name, `owner ${displayName(o.owner)}`] });
    const who = whoCan(objRes(o), gv.fileAction);
    let budget = MAX_PEOPLE;
    for (const [list, label] of [[who.allowed, "Can"], [who.forbidden, "Never"]]) {
      for (const g of list) {
        ruleNode(m, g.rule);
        m.edge("rule:" + g.rule.id, "f:file");
        if (g.people.length <= 3 && g.people.length <= budget) {
          budget -= g.people.length;
          for (const id of g.people) { personNode(m, person(id), { wirable: true }); m.edge("p:" + id, "rule:" + g.rule.id); }
        } else {
          m.node("g:" + g.rule.id, "group", { label: label, title: groupTitle(g.rule), sub: plural(g.people.length, "person", "people"), people: g.people, ref: g.rule.id });
          m.edge("g:" + g.rule.id, "rule:" + g.rule.id);
        }
      }
    }
    gv.fileSummary = who;
    return m.done();
  }

  const buildModel = () => {
    const m = gv.view === "rules" ? rulesModel() : gv.view === "person" ? personModel() : fileModel();
    if (gv.view === "file") for (const n of m.nodes.values()) n.wirable = false;
    return m;
  };

  // ---------------------------------------------------------------- page

  const PALETTE = { rules: [["role", "Role", "who rules apply to"], ["rule", "Rule", "allows or forbids"], ["perm", "Permission set", "the most anyone may do"]],
    person: [["rule", "Rule", "allows or forbids"]], file: [] };

  function renderGraph(params) {
    if (["rules", "person", "file"].includes(params.get("view"))) gv.view = params.get("view");
    if (params.get("type") && S.types[params.get("type")]) gv.scope = params.get("type");
    if (params.get("id") && person(params.get("id"))) gv.who = params.get("id");
    if (params.get("b") && findObj(params.get("b"), params.get("k"))) gv.file = { b: params.get("b"), k: params.get("k") };
    if (!theFile()) gv.file = { b: S.objects[0].bucket, k: S.objects[0].key };
    if (!S.types[objType(theFile())].includes(gv.fileAction)) gv.fileAction = openAction(theFile());
    if (!person(gv.who)) gv.who = "bob";
    gv.inspected = null;
    gv.lastCheck = null;
    const types = Object.keys(S.types).sort((a, b) => W.type(a).many.localeCompare(W.type(b).many));
    const typeSelect = `<label class="ctl">About<select data-on-change="gScope" aria-label="Kind of thing">${types.map(t => `<option value="${esc(t)}" ${t === gv.scope ? "selected" : ""}>${esc(W.type(t).many)}</option>`).join("")}</select></label>`;
    const o = theFile();
    const controls = gv.view === "rules" ? typeSelect
      : gv.view === "person" ? `<label class="ctl">Person<input id="gWho" list="gPeople" value="${esc(gv.who)}" data-on-change="gWho" aria-label="Person" autocomplete="off"></label>` +
        `<datalist id="gPeople">${S.principals.map(p => `<option value="${esc(p.id)}">${esc(displayName(p.id))}</option>`).join("")}</datalist>${typeSelect}`
      : `<label class="ctl">Space<select data-on-change="gSpace" aria-label="Space">${S.buckets.map(b => `<option ${b.name === o.bucket ? "selected" : ""}>${esc(b.name)}</option>`).join("")}</select></label>` +
        `<label class="ctl">File<select data-on-change="gFile" aria-label="File">${S.objects.filter(x => x.bucket === o.bucket).sort((a, b) => a.key.localeCompare(b.key))
          .map(x => `<option value="${esc(x.key)}" ${x.key === o.key ? "selected" : ""}>${esc(x.key)}</option>`).join("")}</select></label>` +
        `<label class="ctl">Who can<select data-on-change="gFileAction" aria-label="Action">${S.types[objType(o)].map(a => `<option value="${esc(a)}" ${a === gv.fileAction ? "selected" : ""}>${esc(W.action(a, objType(o)).label)}</option>`).join("")}</select></label>`;
    const pal = PALETTE[gv.view];
    const body = `<div class="graph-wrap"><aside class="palette">` +
      (pal.length ? `<h4>Add</h4>` + pal.map(([k, name, sub]) => `<button class="pal-item k-${k === "rule" ? "allow" : k}" draggable="true" data-kind="${k}" data-act="gAdd">` +
        `<span class="sw"></span><span><b>${esc(name)}</b><small>${esc(sub)}</small></span></button>`).join("") : "") +
      `<div class="legend"><h4>How it reads</h4>` + {
        rules: `<p><b>Rules</b> allow (green) or forbid (red) actions to <b>roles</b>. <b>Permission sets</b> are the most anyone holding them may do.</p>` +
          `<p>Something is allowed when a permission set includes it, a rule allows it, and no rule forbids it. Anything else is not allowed.</p>` +
          `<p>People are counted, not drawn. Open <b>One person</b> to see someone's path, or <b>One file</b> to see who can reach a file.</p>`,
        person: `<p>Everything that reaches this person for one kind of thing: their roles, permission sets, AI agents and the rules that apply.</p>` +
          `<p>Drag from the person's right-hand dot onto a role or a permission set to give it.</p>`,
        file: `<p>Who can do one thing with one file, grouped by the rule that decides. Groups of more than three are one box; click it for the list.</p>` +
          `<p>Read only: change rules in the Rules view.</p>`,
      }[gv.view] + `<p class="muted">Select a box or a line and press Delete to remove it.</p></div></aside>` +
      `<section class="canvas-area"><div class="viewport" id="viewport"></div>` +
      `<div class="canvas-bar"><div class="glass seg views">${[["rules", "Rules"], ["person", "One person"], ["file", "One file"]].map(([v, l]) =>
        `<button class="${gv.view === v ? "on" : ""}" data-act="gView" data-v="${v}">${l}</button>`).join("")}</div>` +
      `<div class="glass scope">${controls}</div>` +
      `<div class="glass toolgroup"><button class="btn icon" data-act="gZoomOut" aria-label="Zoom out">${icon("minus")}</button><span class="zoom" id="zoomLabel">100%</span>` +
      `<button class="btn icon" data-act="gZoomIn" aria-label="Zoom in">${icon("plus")}</button><button class="btn icon" data-act="gFit" title="Fit to screen" aria-label="Fit to screen">${icon("fit")}</button>` +
      `<button class="btn icon" data-act="gTidy" title="Tidy the layout" aria-label="Tidy the layout">${icon("layout")}</button></div></div>` +
      (gv.view === "file" ? "" : `<div class="glass checker" id="checker"></div>`) + `</section><aside class="inspector" id="inspector"></aside></div>`;
    shell("Access graph", "", body, { flush: true, compact: true });
    graph = A.graph = G.mount(document.getElementById("viewport"), {
      model: buildModel, positions: () => (gv.pos[posKey()] = gv.pos[posKey()] || {}),
      select: sel => { gv.inspected = sel; renderInspector(); },
      canConnect, connect, add: addNode,
      zoomed: k => { const z = document.getElementById("zoomLabel"); if (z) z.textContent = `${Math.round(k * 100)}%`; },
      reserved: () => (document.getElementById("checker") ? document.getElementById("checker").offsetHeight + 28 : 24),
    });
    renderChecker();
    graph.render({ fit: gv.view === "rules" ? 0.55 : 0.4 });
    renderInspector();
    for (const el of document.querySelectorAll(".pal-item")) {
      el.addEventListener("dragstart", e => { e.dataTransfer.setData("application/x-fga-kind", el.dataset.kind); e.dataTransfer.effectAllowed = "copy"; });
    }
  }
  A.routes["/admin/graph"] = renderGraph;

  const graphLink = () => gv.view === "rules" ? `/admin/graph?view=rules&type=${encodeURIComponent(gv.scope)}`
    : gv.view === "person" ? `/admin/graph?view=person&id=${encodeURIComponent(gv.who)}&type=${encodeURIComponent(gv.scope)}`
    : `/admin/graph?view=file&b=${encodeURIComponent(gv.file.b)}&k=${encodeURIComponent(gv.file.k)}`;
  acts.gView = d => { gv.view = d.v; go(graphLink()); };
  acts.gScope = (d, el) => { gv.scope = el.value; go(graphLink()); };
  acts.gWho = (d, el) => {
    if (!person(el.value.trim())) { el.value = gv.who; return toast("No one by that name", "bad"); }
    gv.who = el.value.trim();
    gv.ck.who = gv.who;
    go(graphLink());
  };
  acts.gSpace = (d, el) => {
    const first = S.objects.filter(x => x.bucket === el.value).sort((a, b) => a.key.localeCompare(b.key))[0];
    if (!first) return toast("That space is empty", "bad");
    gv.file = { b: el.value, k: first.key };
    gv.fileAction = openAction(first);
    go(graphLink());
  };
  acts.gFile = (d, el) => { gv.file = { b: gv.file.b, k: el.value }; go(graphLink()); };
  acts.gFileAction = (d, el) => { gv.fileAction = el.value; go(graphLink()); };
  acts.gZoomIn = () => graph.zoom(1.2);
  acts.gZoomOut = () => graph.zoom(1 / 1.2);
  acts.gFit = () => graph.fit();
  acts.gTidy = () => graph.relayout();

  // refresh redraws after a change; a running access check is decided
  // again, so its path shows the effect at once.
  function refresh() {
    graph.render();
    renderInspector();
    if (gv.lastCheck) runCheck(true);
  }

  // ---------------------------------------------------------------- editing

  const PAIRS = { "user>role": 1, "agent>role": 1, "user>perm": 1, "agent>perm": 1, "role>rule": 1 };
  const canConnect = (a, b) => gv.view !== "file" && !!PAIRS[`${a.kind}>${b.kind}`];

  function connect(a, b) {
    if (!canConnect(a, b)) return toast("Connect a person to a role or a permission set, or a role to a rule.", "bad");
    if (b.kind === "role" && b.ref === "*") return toast("Everyone already includes every active person.", "bad");
    if (a.kind === "role") {
      const r = S.rules.find(x => x.id === b.ref);
      if (r.roles.includes(a.ref)) return toast("The rule already applies to that role.", "bad");
      r.roles.push(a.ref);
      change("policy", `Rule “${ruleTitle(r)}” also applies to ${W.role(a.ref).many}`);
    } else {
      const p = person(a.ref);
      if (b.kind === "role") {
        if (p.roles.includes(b.ref)) return toast(`${displayName(p.id)} already has that role`, "bad");
        p.roles.push(b.ref);
        change("directory", `${displayName(p.id)} gets the role ${W.role(b.ref).one}`);
      } else {
        if (p.grants.includes(b.ref)) return toast(`${displayName(p.id)} already holds it`, "bad");
        p.grants.push(b.ref);
        change("directory", `${displayName(p.id)} gets ${W.set(b.ref, S.permSets).name}`);
      }
    }
    refresh();
  }

  function removeEdge(e) {
    if (!e) return;
    if (e.implicit || gv.view === "file") return toast("This line follows from the others and cannot be removed by itself.", "bad");
    const a = graph.node(e.from), b = graph.node(e.to);
    if (b.kind === "role") {
      const p = person(a.ref);
      p.roles = p.roles.filter(x => x !== b.ref);
      change("directory", `${displayName(p.id)} loses the role ${W.role(b.ref).one}`);
    } else if (b.kind === "perm") {
      const p = person(a.ref);
      p.grants = p.grants.filter(x => x !== b.ref);
      change("directory", `${displayName(p.id)} loses ${W.set(b.ref, S.permSets).name}`);
    } else if (b.kind === "rule") {
      const r = S.rules.find(x => x.id === b.ref);
      r.roles = r.roles.filter(x => x !== a.ref);
      change("policy", `Rule “${ruleTitle(r)}” no longer applies to ${W.role(a.ref).many}`);
      if (!r.roles.length) toast("That rule now applies to nobody");
    } else if (a.kind === "dlg" || b.kind === "dlg") {
      return acts.revokeDlg({ id: (a.kind === "dlg" ? a : b).ref });
    }
    refresh();
  }

  function removeNode(n) {
    switch (n.kind) {
      case "user": return acts.disablePerson({ id: n.ref });
      case "agent": return acts.disableAgent({ id: n.ref });
      case "role": return n.ref === "*" ? toast("Everyone is built in", "bad") : acts.removeRole({ id: n.ref });
      case "rule": return acts.removeRule({ id: n.ref });
      case "perm": return S.permSets[n.ref].builtin ? toast("Built-in permission sets cannot be removed", "bad") : acts.removeSet({ id: n.ref });
      case "dlg": return acts.revokeDlg({ id: n.ref });
      default: return toast("This box shows what fga knows; it cannot be removed here.", "bad");
    }
  }

  function addNode(kind, at) {
    if (gv.view === "file") return;
    const point = at || (c => ({ x: Math.round(c.x - 116), y: Math.round(c.y - 40) }))(graph.centre());
    let id;
    if (kind === "role") {
      const r = unique("new-role", x => allRoles().includes(x));
      S.roleInfo[r] = { name: "New role", help: "" };
      S.extraRoles.push(r);
      change("policy", "New role");
      id = "r:" + r;
    } else if (kind === "rule") {
      const rid = unique("new-rule", x => S.rules.some(r => r.id === x));
      S.rules.push({ set: "business", type: gv.scope, id: rid, name: "New rule", effect: "allow", actions: [], roles: [], when: "" });
      change("policy", `New rule about ${W.type(gv.scope).many.toLowerCase()}`);
      id = "rule:" + rid;
    } else if (kind === "perm") {
      const sid = unique("new-set", x => S.permSets[x]);
      S.permSets[sid] = { name: "New permission set", caps: { [gv.scope]: [] } };
      change("directory", "New permission set");
      id = "perm:" + sid;
    } else return;
    gv.pos[posKey()][id] = point;
    graph.render();
    graph.select({ type: "node", id });
  }
  acts.gAdd = d => addNode(d.kind);

  // ---------------------------------------------------------------- inspector

  const inspectedNode = () => gv.inspected && gv.inspected.type === "node" ? graph.node(gv.inspected.id) : null;
  const head = (cls, kind, title) => `<div class="insp-title ${cls}"><span class="sw"></span><div><small>${esc(kind)}</small><h3>${esc(title)}</h3></div></div>`;
  const dirNote = `<p class="insp-note">People and permission changes wait under Unsaved changes until you apply them.</p>`;
  const polNote = `<p class="insp-note policy">Rule changes go into the draft, which is signed on a separate computer.</p>`;

  function peopleList(ids, q) {
    const list = ids.filter(id => matchPerson(person(id), q));
    return list.slice(0, 20).map(id => `<div class="mini-row">${avatar(id, "sm")}<span class="grow">${esc(displayName(id))}</span>` +
      `<a class="small" href="#/admin/graph?view=person&id=${encodeURIComponent(id)}&type=${encodeURIComponent(gv.scope)}">Path</a></div>`).join("") +
      (list.length > 20 ? `<div class="muted small pad">and ${list.length - 20} more: search to narrow</div>` : "") +
      (list.length ? "" : `<div class="muted small pad">Nobody${q ? " matches" : ""}.</div>`);
  }

  function renderInspector() {
    const el = document.getElementById("inspector");
    if (!el) return;
    const sel = gv.inspected;
    if (!sel) { el.innerHTML = defaultInspector(); return; }
    if (sel.type === "edge") return edgeInspector(el, graph.edge(sel.id));
    const n = graph.node(sel.id);
    if (!n) { el.innerHTML = ""; return; }
    el.innerHTML = nodeInspector(n);
  }

  function defaultInspector() {
    if (gv.view === "file") {
      const o = theFile(), w = gv.fileSummary || { allowed: [], forbidden: [], others: 0 };
      const can = w.allowed.reduce((s, g) => s + g.people.length, 0), never = w.forbidden.reduce((s, g) => s + g.people.length, 0);
      return head("k-file", fileKindText(o), baseName(o.key)) +
        `<dl class="kv"><dt>Space</dt><dd>${esc(o.bucket)}</dd><dt>Owner</dt><dd>${esc(displayName(o.owner))}</dd><dt>Sensitivity</dt><dd>${labelChip(o.label)}</dd></dl>` +
        `<div class="big-stat"><b>${can}</b><span>${can === 1 ? "person" : "people"} can ${esc(W.action(gv.fileAction, objType(o)).label.toLowerCase())} it</span></div>` +
        w.allowed.map(g => `<div class="mini-row"><span class="badge allow">${g.people.length}</span><span class="grow">${esc(groupTitle(g.rule))}<div class="muted small">${esc(ruleTitle(g.rule))}</div></span></div>`).join("") +
        (never ? `<div class="big-stat small-stat"><b>${never}</b><span>never may, because a rule forbids it</span></div>` +
          w.forbidden.map(g => `<div class="mini-row"><span class="badge deny">${g.people.length}</span><span class="grow">${esc(groupTitle(g.rule))}<div class="muted small">${esc(ruleTitle(g.rule))}</div></span></div>`).join("") : "") +
        `<p class="muted small">${w.others} others cannot: no rule lets them.</p>`;
    }
    if (gv.view === "person") {
      const p = person(gv.who);
      return head("k-" + (p.kind === "agent" ? "agent" : "user"), p.kind === "agent" ? "AI agent" : "Person", displayName(p.id)) +
        `<p class="muted small">${esc(rolesText(p.id))}</p><div class="insp-help"><p>Select a box to see and change it. Use <b>Check access</b> below to see a request decided: its path lights up.</p></div>`;
    }
    return `<h4>Details</h4><div class="insp-help"><p>Select a box or a line to see and change it.</p><ol>` +
      `<li>Pick what the rules are <b>about</b> at the top.</li><li>Wire a <b>role</b> to a <b>rule</b> to make the rule apply to it.</li>` +
      `<li>Use <b>Check access</b> below: the path of the decision lights up.</li>` +
      `<li><b>Unsaved changes</b> at the top collects your edits.</li></ol></div>`;
  }

  function nodeInspector(n) {
    switch (n.kind) {
      case "type": {
        const rs = S.rules.filter(r => r.type === gv.scope);
        return head("k-type", "About", W.type(gv.scope).many) + `<p class="muted small">${esc(W.type(gv.scope).help)}</p>` +
          `<dl class="kv"><dt>Rules</dt><dd>${rs.filter(r => r.effect === "allow").length} allow, ${rs.filter(r => r.effect === "deny").length} forbid</dd></dl>` +
          `<div class="field"><span>What can be done</span><div class="chips">${S.types[gv.scope].map(a => actChip(a, gv.scope)).join("")}</div></div>` +
          `<p class="insp-note">Kinds of things and their actions come from fga itself.</p>`;
      }
      case "role": {
        const r = n.ref, ids = (r === "*" ? activeUsers() : activeUsers().filter(p => p.roles.includes(r))).map(p => p.id);
        return head("k-role", "Role", W.role(r).one) + `<p class="muted small">${esc(W.role(r).help)}</p>` +
          `<div class="field"><span>${plural(ids.length, "person", "people")}</span><input class="input" placeholder="Search" value="${esc(gv.roleQ)}" data-on-input="gRoleQ" data-r="${esc(r)}" aria-label="Search people">` +
          `<div id="gRolePeople" class="mini-list">${peopleList(ids, gv.roleQ)}</div></div>` +
          (r === "*" ? "" : `<div class="field"><span>Give the role to</span><div class="inline"><input class="input" id="gGiveRole" list="gPeople2" placeholder="Name" autocomplete="off">` +
            `<datalist id="gPeople2">${people().filter(p => p.status === "active" && !p.roles.includes(r)).map(p => `<option value="${esc(p.id)}">${esc(displayName(p.id))}</option>`).join("")}</datalist>` +
            `<button class="btn" data-act="gGiveRole" data-r="${esc(r)}">Give</button></div></div>`) +
          `<div class="field"><span>Rules for it</span>${S.rules.filter(x => x.roles.includes(r)).map(x => `<div class="mini-row"><span class="badge ${x.effect}">${esc(W.rule(x).kind)}</span>` +
            `<span class="grow">${esc(ruleTitle(x))}<div class="muted small">${esc(W.type(x.type).many)}</div></span></div>`).join("") || '<span class="muted small">None: the role gives nothing.</span>'}</div>` +
          (r === "*" ? "" : `<div class="btn-row"><button class="btn" data-act="editRole" data-id="${esc(r)}">Edit role</button><button class="btn danger" data-act="removeRole" data-id="${esc(r)}">${icon("trash", "sm")}Remove</button></div>`);
      }
      case "rule": {
        const r = S.rules.find(x => x.id === n.ref), m = W.matchCondition(r.when);
        return head(r.effect === "deny" ? "k-deny" : "k-allow", `${W.rule(r).kind} · ${W.type(r.type).many}`, ruleTitle(r)) + polNote +
          `<label class="field"><span>Name</span><input class="input" value="${esc(r.name || "")}" placeholder="${esc(W.ruleTitle(r))}" data-on-change="gRuleName"></label>` +
          `<div class="field"><span>Effect</span><div class="seg">${[["allow", "Allow"], ["deny", "Never allow"], ["ceiling", "Hard limit"]].map(([v, l]) => {
            const on = v === "ceiling" ? r.set === "ceiling" : r.set !== "ceiling" && r.effect === v;
            return `<button class="${on ? `on ${v === "allow" ? "allow" : "deny"}` : ""}" data-act="gRuleEffect" data-v="${v}">${l}</button>`;
          }).join("")}</div></div>` +
          `<div class="field"><span>Who</span><div class="chips">${r.roles.map(x => `<span class="chip on">${roleName(x, true)}<button class="x" data-act="gRuleRole" data-r="${esc(x)}" aria-label="Remove">×</button></span>`).join("") || '<span class="muted small">Nobody yet</span>'}</div>` +
          `<select class="input" data-on-change="gRuleRoleAdd" aria-label="Add a role"><option value="">Add a role…</option>${["*", ...allRoles()].filter(x => !r.roles.includes(x)).map(x => `<option value="${esc(x)}">${roleName(x, true)}</option>`).join("")}</select></div>` +
          `<div class="field"><span>May</span><div class="chips">${S.types[r.type].map(a => `<button class="chip ${r.actions.includes(a) ? (r.effect === "deny" ? "deny" : "on") : ""}" data-act="gRuleAction" data-a="${esc(a)}" title="${esc(W.action(a, r.type).help)}">${esc(W.action(a, r.type).label)}</button>`).join("")}</div></div>` +
          `<div class="field"><span>Only when</span>${W.conditionsFor(r.type).map(c => `<label class="check"><input type="checkbox" data-on-change="gRuleCond" data-c="${esc(c.id)}" ${m.ids.includes(c.id) ? "checked" : ""}>${esc(c.text)}</label>`).join("")}` +
          (m.custom ? `<div class="mini-row"><span class="grow muted small">and a custom condition</span></div>${A.tech ? `<code class="tech block">${esc(m.custom)}</code>` : ""}` : "") + `</div>` +
          `<div class="btn-row"><button class="btn" data-act="editRule" data-id="${esc(r.id)}">Open in a form</button><button class="btn danger" data-act="removeRule" data-id="${esc(r.id)}">${icon("trash", "sm")}Remove</button></div>`;
      }
      case "perm": {
        const s = S.permSets[n.ref], n2 = S.principals.filter(p => p.grants.includes(n.ref)).length, on = s.caps[gv.scope] || [];
        return head("k-perm", "Permission set", W.set(n.ref, S.permSets).name) + dirNote +
          `<div class="field"><span>Includes, for ${esc(W.type(gv.scope).many.toLowerCase())}</span><div class="chips">${S.types[gv.scope].map(a => s.builtin
            ? (on.includes(a) ? actChip(a, gv.scope, "on") : "")
            : `<button class="chip ${on.includes(a) ? "on" : ""}" data-act="gPermAction" data-a="${esc(a)}">${esc(W.action(a, gv.scope).label)}</button>`).join("")}</div>` +
          `${s.builtin ? `<small>Built into fga: fixed.</small>` : ""}</div><p class="muted small">${plural(n2, "person holds", "people hold")} it.</p>` +
          (s.builtin ? "" : `<div class="btn-row"><button class="btn" data-act="editSet" data-id="${esc(n.ref)}">Open in a form</button><button class="btn danger" data-act="removeSet" data-id="${esc(n.ref)}">${icon("trash", "sm")}Remove</button></div>`);
      }
      case "user": case "agent": {
        const p = person(n.ref);
        return head("k-" + n.kind, n.kind === "agent" ? "AI agent" : "Person", displayName(p.id)) + dirNote +
          `<dl class="kv"><dt>Sign-in name</dt><dd>${esc(p.id)}</dd><dt>Status</dt><dd>${p.status === "active" ? "Active" : "Disabled"}</dd></dl>` +
          `<div class="field"><span>Roles</span><div class="chips">${p.roles.map(r => `<span class="chip on">${roleName(r)}<button class="x" data-act="gPRole" data-r="${esc(r)}" aria-label="Remove">×</button></span>`).join("") || '<span class="muted small">none</span>'}</div>` +
          `<select class="input" data-on-change="gPRoleAdd" aria-label="Add a role"><option value="">Add a role…</option>${allRoles().filter(r => !p.roles.includes(r)).map(r => `<option value="${esc(r)}">${roleName(r)}</option>`).join("")}</select></div>` +
          (p.kind === "user" ? `<div class="field"><span>Projects</span><div class="check-grid">${S.projects.map(x => `<label class="check"><input type="checkbox" data-on-change="gPProject" data-p="${esc(x.id)}" ${(p.attributes.projects || []).includes(x.id) ? "checked" : ""}>${esc(x.name)}</label>`).join("")}</div></div>` : "") +
          `<div class="field"><span>Permission sets</span>${Object.keys(S.permSets).map(id => `<label class="check"><input type="checkbox" data-on-change="gPSet" data-s="${esc(id)}" ${p.grants.includes(id) ? "checked" : ""}>${setName(id)}</label>`).join("")}</div>` +
          `<div class="btn-row">${gv.view === "person" && gv.who === p.id ? "" : `<a class="btn" href="#/admin/graph?view=person&id=${encodeURIComponent(p.id)}&type=${encodeURIComponent(gv.scope)}">Show their path</a>`}` +
          `${p.status === "active" ? `<button class="btn danger" data-act="${n.kind === "agent" ? "disableAgent" : "disablePerson"}" data-id="${esc(p.id)}">${n.kind === "agent" ? "Remove" : "Disable"}</button>` : ""}</div>`;
      }
      case "dlg": {
        const d = S.delegations.find(x => x.id === n.ref);
        return head("k-dlg", "Acts for", `${displayName(d.actor)} for ${displayName(d.subject)}`) +
          `<dl class="kv"><dt>Until</dt><dd>${when(d.expires)}</dd></dl>` +
          `<div class="field"><span>May, for ${esc(W.type(gv.scope).many.toLowerCase())}</span><div class="chips">${(d.grants[gv.scope] || []).map(a => actChip(a, gv.scope, "on")).join("") || '<span class="muted small">nothing</span>'}</div>` +
          `<small>Never more than ${esc(displayName(d.subject))} may do: the rules decide for them.</small></div>` +
          `<button class="btn danger" data-act="revokeDlg" data-id="${esc(d.id)}">Revoke</button>`;
      }
      case "group": {
        const r = S.rules.find(x => x.id === n.ref);
        return head("k-role", n.label === "Can" ? "Can" : "Never", n.title) + `<p class="muted small">Because of “${esc(ruleTitle(r))}”.</p>` +
          `<div class="field"><span>${plural(n.people.length, "person", "people")}</span><input class="input" placeholder="Search" value="${esc(gv.roleQ)}" data-on-input="gGroupQ" aria-label="Search people">` +
          `<div id="gRolePeople" class="mini-list">${peopleList(n.people, gv.roleQ)}</div></div>`;
      }
      case "file": return defaultInspector();
    }
    return "";
  }

  const RELATION = { "user>role": "has the role", "agent>role": "has the role", "user>perm": "holds", "agent>perm": "holds", "role>rule": "is covered by",
    "rule>type": "is about", "perm>type": "limits", "agent>dlg": "acts as", "dlg>user": "for", "rule>file": "decides for", "group>rule": "are let in by", "user>rule": "is let in by" };
  function edgeInspector(el, e) {
    if (!e) { el.innerHTML = ""; return; }
    const a = graph.node(e.from), b = graph.node(e.to);
    el.innerHTML = `<div class="insp-title"><div><small class="muted">Line</small><h3>${esc(a.title)} <span class="arrow">→</span> ${esc(b.title)}</h3></div></div>` +
      `<p>${esc(a.title)} <b>${esc(RELATION[`${a.kind}>${b.kind}`] || "links to")}</b> ${esc(b.title)}.</p>` +
      (e.implicit || gv.view === "file" ? `<p class="insp-note">This line follows from the others and cannot be removed by itself.</p>`
        : `<p class="insp-note ${a.kind === "role" ? "policy" : ""}">${a.kind === "role" ? "Removing it changes the rules." : "Removing it changes what this person holds."}</p>` +
          `<button class="btn danger" data-act="gDelSelected">${icon("trash", "sm")}Remove line</button>`);
  }

  acts.gDelSelected = () => {
    if (!gv.inspected) return;
    if (gv.inspected.type === "edge") removeEdge(graph.edge(gv.inspected.id));
    else removeNode(graph.node(gv.inspected.id));
  };
  A.onKey = e => {
    if (!A.graph || A.graph !== graph || !gv.inspected || document.getElementById("drawer")) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) return;
    if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); acts.gDelSelected(); }
  };

  acts.gRoleQ = (d, el) => {
    gv.roleQ = el.value;
    const ids = (d.r === "*" ? activeUsers() : activeUsers().filter(p => p.roles.includes(d.r))).map(p => p.id);
    document.getElementById("gRolePeople").innerHTML = peopleList(ids, gv.roleQ);
  };
  acts.gGroupQ = (d, el) => { gv.roleQ = el.value; document.getElementById("gRolePeople").innerHTML = peopleList(inspectedNode().people, gv.roleQ); };
  acts.gGiveRole = d => {
    const id = document.getElementById("gGiveRole").value.trim(), p = person(id);
    if (!p || p.status !== "active") return toast("Choose an active person", "bad");
    if (p.roles.includes(d.r)) return toast(`${displayName(id)} already has that role`, "bad");
    p.roles.push(d.r);
    change("directory", `${displayName(id)} gets the role ${W.role(d.r).one}`);
    refresh();
  };

  const inspectedRule = () => { const n = inspectedNode(); return n && S.rules.find(r => r.id === n.ref); };
  acts.gRuleName = (d, el) => { const r = inspectedRule(); r.name = el.value.trim(); change("policy", `Rule renamed “${ruleTitle(r)}”`); refresh(); };
  acts.gRuleEffect = d => {
    const r = inspectedRule();
    r.set = d.v === "ceiling" ? "ceiling" : "business";
    r.effect = d.v === "allow" ? "allow" : "deny";
    change("policy", `Rule “${ruleTitle(r)}”: ${{ allow: "allows", deny: "forbids", ceiling: "is a hard limit" }[d.v]}`);
    refresh();
  };
  acts.gRuleRole = d => { const r = inspectedRule(); r.roles = r.roles.filter(x => x !== d.r); change("policy", `Rule “${ruleTitle(r)}” no longer applies to ${W.role(d.r).many}`); refresh(); };
  acts.gRuleRoleAdd = (d, el) => { if (!el.value) return; const r = inspectedRule(); r.roles.push(el.value); change("policy", `Rule “${ruleTitle(r)}” also applies to ${W.role(el.value).many}`); refresh(); };
  acts.gRuleAction = d => {
    const r = inspectedRule(), on = r.actions.includes(d.a);
    r.actions = on ? r.actions.filter(a => a !== d.a) : [...r.actions, d.a];
    change("policy", `Rule “${ruleTitle(r)}”: ${on ? "no longer" : "now"} ${W.action(d.a, r.type).label.toLowerCase()}`);
    refresh();
  };
  acts.gRuleCond = (d, el) => {
    const r = inspectedRule(), m = W.matchCondition(r.when), ids = new Set(m.ids);
    if (el.checked) ids.add(d.c); else ids.delete(d.c);
    if (ids.has("shared") && r.actions.length !== 1) { el.checked = !el.checked; return toast("A rule about shared access names exactly one action", "bad"); }
    const action = m.grantAction && r.actions.length !== 1 ? [m.grantAction] : r.actions;
    r.when = W.conditionExpr([...ids], m.custom, action);
    change("policy", `Rule “${ruleTitle(r)}”: ${el.checked ? "only" : "no longer only"} when ${W.condition(d.c).text}`);
    refresh();
  };
  acts.gPermAction = d => {
    const s = S.permSets[inspectedNode().ref], cur = s.caps[gv.scope] || [], on = cur.includes(d.a);
    s.caps[gv.scope] = on ? cur.filter(a => a !== d.a) : [...cur, d.a];
    change("directory", `${s.name}: ${on ? "no longer includes" : "includes"} ${W.action(d.a, gv.scope).label.toLowerCase()}`);
    refresh();
  };
  const inspectedPerson = () => person(inspectedNode().ref);
  acts.gPRole = d => { const p = inspectedPerson(); p.roles = p.roles.filter(r => r !== d.r); change("directory", `${displayName(p.id)} loses the role ${W.role(d.r).one}`); refresh(); };
  acts.gPRoleAdd = (d, el) => { if (!el.value) return; const p = inspectedPerson(); p.roles.push(el.value); change("directory", `${displayName(p.id)} gets the role ${W.role(el.value).one}`); refresh(); };
  acts.gPProject = (d, el) => {
    const p = inspectedPerson(), cur = p.attributes.projects || [];
    p.attributes = { ...p.attributes, projects: el.checked ? [...cur, d.p] : cur.filter(x => x !== d.p) };
    change("directory", `${displayName(p.id)} ${el.checked ? "joins" : "leaves"} ${projectName(d.p)}`);
    refresh();
  };
  acts.gPSet = (d, el) => {
    const p = inspectedPerson();
    p.grants = el.checked ? [...p.grants, d.s] : p.grants.filter(g => g !== d.s);
    change("directory", `${displayName(p.id)} ${el.checked ? "gets" : "loses"} ${W.set(d.s, S.permSets).name}`);
    refresh();
  };

  // ---------------------------------------------------------------- access check

  const MCP_NAMES = { "resources.list": "List files", "resources.read": "Read a file", "documents.search": "Search documents",
    "documents.read": "Read a document", "text.read": "Read text entries", "documents.export": "Export a document" };
  function resourcesFor(type) {
    const ex = (label, attributes, group) => ({ label, group, res: { type, id: label, attributes } });
    const files = kind => S.objects.filter(o => o.kind === kind).map(o => ({ label: o.key, group: o.bucket, res: objRes(o) }));
    switch (type) {
      case "storage.object": return files("object");
      case "document.version": return files("document");
      case "document.derived": return files("derived");
      case "storage.bucket": return S.buckets.map(b => ({ label: `${b.name} (${projectName(b.project)})`, res: bucketRes(b) }));
      case "network.destination": return S.destinations.map(d => ex(`${d.id}${d.approved ? "" : " (not approved)"}`, { approved: d.approved }));
      case "agent.tool": return S.tools.map(t => ex(t.name, { kind: "executor" }, "Registered tools"))
        .concat(S.mcp.tools.map(t => ex(MCP_NAMES[t] || t, { kind: "mcp" }, "AI assistant tools")));
      case "crypto.recipient": return [ex("Bob's personal key", { principal: "bob", status: "ACTIVE" }), ex("A revoked key of Bob's", { principal: "bob", status: "REVOKED" })];
      case "crypto.signing-key": return [ex("Alice's signing key", { principal: "alice" })];
      case "crypto.envelope": return [ex("Key share of reports/q3/report.pdf for Bob", { owner: "alice", recipient_principal: "bob" })];
      case "text.entry": return [ex("Apollo chat log, entry 1", { project: "apollo", owner: "alice" })];
      case "document.text_unit": return [ex("q4/notes.md, section 1 (Internal)", { project: "apollo", owner: "alice", label_rank: 1 }),
        ex("q4/notes.md, section 2 (Restricted)", { project: "apollo", owner: "alice", label_rank: 3 })];
      default: return [ex("Example", {})];
    }
  }

  function renderChecker() {
    const el = document.getElementById("checker");
    if (!el) return;
    const ck = gv.ck, actions = S.types[gv.scope], resources = resourcesFor(gv.scope);
    if (!actions.includes(ck.action)) ck.action = actions[0];
    if (Number(ck.res) >= resources.length) ck.res = "0";
    if (gv.view === "person") ck.who = gv.who;
    const dl = S.delegations.filter(d => d.status === "active" && d.subject === ck.who);
    if (ck.via && !dl.some(d => d.id === ck.via)) ck.via = "";
    const groups = [...new Set(resources.map(r => r.group || ""))];
    const opt = (r, i) => `<option value="${i}" ${String(i) === ck.res ? "selected" : ""}>${esc(r.label)}</option>`;
    el.innerHTML = `<div class="checker-row"><span class="title">${icon("play", "sm")}Check access</span>` +
      (gv.view === "person" ? `<b>${esc(displayName(ck.who))}</b>` : `<input id="ckWho" list="ckPeople" value="${esc(ck.who)}" data-on-change="ckWho" aria-label="Who" autocomplete="off">` +
        `<datalist id="ckPeople">${S.principals.map(p => `<option value="${esc(p.id)}">${esc(displayName(p.id))}</option>`).join("")}</datalist>`) +
      (dl.length ? `<select data-on-change="ckSet" data-k="via" aria-label="Directly or through an agent"><option value="">directly</option>${dl.map(d => `<option value="${esc(d.id)}" ${ck.via === d.id ? "selected" : ""}>through ${esc(displayName(d.actor))}</option>`).join("")}</select>` : "") +
      `<span class="muted">may</span><select data-on-change="ckSet" data-k="action" aria-label="Action">${actions.map(a => `<option value="${esc(a)}" ${a === ck.action ? "selected" : ""}>${esc(W.action(a, gv.scope).label)}</option>`).join("")}</select>` +
      `<select class="wide" data-on-change="ckSet" data-k="res" aria-label="On what">${groups.length > 1 || groups[0]
        ? groups.map(g => `<optgroup label="${esc(g)}">${resources.map((r, i) => (r.group || "") === g ? opt(r, i) : "").join("")}</optgroup>`).join("")
        : resources.map(opt).join("")}</select>` +
      `<button class="btn primary sm" data-act="ckRun">Check</button>${gv.lastCheck ? `<button class="btn ghost sm" data-act="ckClear">Clear</button>` : ""}<span class="grow"></span></div>` +
      `<div id="verdict">${gv.lastCheck ? verdictHTML(gv.lastCheck) : `<div class="verdict muted small">Pick who, what and on what. The path of the decision lights up in the graph.</div>`}</div>`;
  }
  acts.ckWho = (d, el) => {
    if (!person(el.value.trim())) { el.value = gv.ck.who; return toast("No one by that name", "bad"); }
    gv.ck.who = el.value.trim();
    gv.ck.via = "";
    if (gv.lastCheck) runCheck(true); else renderChecker();
  };
  acts.ckSet = (d, el) => { gv.ck[d.k] = el.value; if (gv.lastCheck) runCheck(true); };

  function verdictHTML(c) {
    return `<div class="verdict"><span class="big ${c.res.allowed ? "allow" : "deny"}">${c.res.allowed ? "ALLOWED" : "NOT ALLOWED"}</span><ul class="trace">` +
      c.trace.map(t => `<li class="${t.ok ? "ok" : "no"}">${icon(t.ok ? "check" : "x")}<span>${esc(t.text)}</span></li>`).join("") + `</ul></div>`;
  }

  function runCheck(quiet) {
    const ck = gv.ck, r = resourcesFor(gv.scope)[Number(ck.res)];
    let res, path, trace;
    if (ck.via) {
      const d = S.delegations.find(x => x.id === ck.via);
      res = decideFor(d.id, ck.action, r.res);
      trace = [{ ok: true, text: `${displayName(d.actor)} acts for ${displayName(d.subject)}: the rules look at ${displayName(d.subject)}, and the agent may do only what its permission to act allows` }]
        .concat(plainTrace(res, d.subject, ck.action, gv.scope));
      path = pathFor(res, d.subject, { agent: d.actor, dlg: d.id });
    } else {
      res = decide(ck.who, ck.action, r.res);
      trace = plainTrace(res, ck.who, ck.action, gv.scope);
      path = pathFor(res, ck.who);
    }
    gv.lastCheck = { res, trace };
    graph.highlight(path);
    renderChecker();
    if (!quiet) graph.fit(0.4, path.nodes);
  }
  acts.ckRun = () => runCheck(false);
  acts.ckClear = () => { gv.lastCheck = null; graph.highlight(null); renderChecker(); };

  // pathFor lists the boxes and lines a decision went through; boxes the
  // current view does not show are skipped.
  function pathFor(res, pid, via) {
    const nodes = new Set(), edges = new Set(), t = "t:" + gv.scope, p = "p:" + pid;
    const link = (a, b) => { nodes.add(a); nodes.add(b); edges.add(`${a}->${b}`); };
    nodes.add(p);
    nodes.add(t);
    const holder = via ? via.agent : pid;
    if (via) { link("p:" + via.agent, "d:" + via.dlg); link("d:" + via.dlg, p); }
    for (const g of person(holder).grants) {
      if (((S.permSets[g] || { caps: {} }).caps[gv.scope] || []).includes(gv.ck.action)) { link("p:" + holder, "perm:" + g); link("perm:" + g, t); }
    }
    if (res.rule) {
      const sp = person(pid), roles = res.rule.roles.includes("*") ? ["*"] : res.rule.roles.filter(x => sp.roles.includes(x));
      roles.forEach(x => { link(p, "r:" + x); link("r:" + x, "rule:" + res.rule.id); });
      link("rule:" + res.rule.id, t);
    } else if (res.stage === "default") person(pid).roles.forEach(x => link(p, "r:" + x));
    return { nodes, edges, tone: res.allowed ? "allow" : "deny" };
  }
})();

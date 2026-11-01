// The access graph: a node editor over the console's state. Nodes are the
// identities, roles, rules, permission sets and delegations that bear on
// one resource type; wires are the relations the decision role evaluates.
// Plain DOM and SVG, no libraries. The editor only draws and reports
// gestures; app.js decides what a new wire or a removal means.
"use strict";

window.FGA_GRAPH = (() => {
  const COL = { agent: 0, dlg: 1, user: 2, role: 3, perm: 3, rule: 4, type: 5 };
  const COL_X = 290, PORT_Y = 26, GAP = 12;
  const KIND = { user: "User", agent: "Agent", role: "Role", perm: "Permission set", dlg: "Delegation", type: "Resource type" };
  const HAS_IN = new Set(["user", "role", "perm", "rule", "type", "dlg"]);
  const HAS_OUT = new Set(["user", "agent", "role", "perm", "rule", "dlg"]);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const day = iso => new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  // model lists the nodes and edges of the graph for one resource type.
  function model(S, type) {
    const nodes = new Map(), edges = [];
    const node = (id, kind, props) => nodes.set(id, { id, kind, ...props });
    const edge = (from, to, implicit = false) => edges.push({ id: `${from}->${to}`, from, to, implicit });
    const rules = S.rules.filter(r => r.type === type);
    const people = S.principals;

    node("t:" + type, "type", { title: type, chips: S.types[type] || [], ref: type });

    const roles = new Set(S.extraRoles);
    people.forEach(p => p.roles.forEach(r => roles.add(r)));
    rules.forEach(r => r.roles.forEach(x => roles.add(x)));
    for (const r of [...roles].sort()) {
      const members = r === "*" ? people.filter(p => p.status === "active").length : people.filter(p => p.roles.includes(r)).length;
      const used = rules.filter(x => x.roles.includes(r)).length;
      node("r:" + r, "role", { title: r === "*" ? "anyone" : r, ref: r,
        sub: `${members} ${members === 1 ? "identity" : "identities"} · ${used} ${used === 1 ? "rule" : "rules"} here` });
    }

    for (const [id, set] of Object.entries(S.permSets)) {
      if (!set.caps[type]) continue;
      node("perm:" + id, "perm", { title: set.name, chips: set.caps[type], ref: id });
      edge("perm:" + id, "t:" + type, true);
    }

    for (const p of people) {
      node("p:" + p.id, p.kind === "agent" ? "agent" : "user", { title: p.id, ref: p.id, disabled: p.status !== "active",
        chips: p.attributes.projects || [] });
      p.roles.forEach(r => edge("p:" + p.id, "r:" + r));
      if (roles.has("*") && p.status === "active") edge("p:" + p.id, "r:*", true);
      p.grants.filter(g => S.permSets[g] && S.permSets[g].caps[type]).forEach(g => edge("p:" + p.id, "perm:" + g));
    }

    for (const r of rules) {
      node("rule:" + r.id, "rule", { title: r.id, effect: r.effect, set: r.set, chips: r.actions, cond: r.when, ref: r.id });
      r.roles.forEach(x => edge("r:" + x, "rule:" + r.id));
      edge("rule:" + r.id, "t:" + type, true);
    }

    for (const d of S.delegations) {
      if (d.status !== "active" || !d.grants[type]) continue;
      node("d:" + d.id, "dlg", { title: d.id, chips: d.grants[type], ref: d.id,
        sub: `${d.subject ? "acts for " + d.subject : "no user yet"} · until ${day(d.expires)}` });
      if (d.actor && nodes.has("p:" + d.actor)) edge("p:" + d.actor, "d:" + d.id);
      if (d.subject && nodes.has("p:" + d.subject)) edge("d:" + d.id, "p:" + d.subject);
    }
    return { nodes, edges: edges.filter(e => nodes.has(e.from) && nodes.has(e.to)) };
  }

  // Nodes stay compact so a whole type fits on screen; the inspector shows
  // everything about the selected node.
  function actions(list, empty) {
    if (!list.length) return `<div class="node-empty">${esc(empty)}</div>`;
    return `<div class="node-acts" title="${esc(list.join(", "))}">${list.map(esc).join(" · ")}</div>`;
  }

  function nodeHTML(n) {
    let kind = KIND[n.kind], cls = "k-" + n.kind, body = "";
    switch (n.kind) {
      case "rule":
        cls = n.effect === "deny" ? "k-deny" : "k-allow";
        kind = `${n.set === "ceiling" ? "Ceiling · " : ""}${n.effect === "deny" ? "Deny" : "Allow"}`;
        body = actions(n.chips, "no actions yet") + `<code class="cond" title="${esc(n.cond || "always")}">${n.cond ? esc(n.cond) : "always"}</code>`;
        break;
      case "user": case "agent":
        body = n.disabled ? `<span class="badge muted">disabled</span>`
          : n.chips.length ? `<div class="chips">${n.chips.map(p => `<span class="chip">project ${esc(p)}</span>`).join("")}</div>` : "";
        break;
      case "role": body = `<div class="node-sub">${esc(n.sub)}</div>`; break;
      case "perm": body = actions(n.chips, "no actions yet"); break;
      case "dlg": body = `<div class="node-sub">${esc(n.sub)}</div>` + actions(n.chips, "no grants yet"); break;
      case "type": body = actions(n.chips, "no actions"); break;
    }
    return `<div class="node ${cls}${n.disabled ? " disabled" : ""}" data-node="${esc(n.id)}">` +
      (HAS_IN.has(n.kind) ? `<span class="port in"></span>` : "") +
      (HAS_OUT.has(n.kind) ? `<span class="port out" title="Drag onto another node to connect"></span>` : "") +
      `<div class="node-kind">${esc(kind)}</div><div class="node-title">${esc(n.title)}</div>` +
      (body ? `<div class="node-body">${body}</div>` : "") + `</div>`;
  }

  function curve(a, b) {
    const dx = Math.max(60, Math.abs(b.x - a.x) * 0.5);
    return `M${a.x},${a.y} C${a.x + dx},${a.y} ${b.x - dx},${b.y} ${b.x},${b.y}`;
  }

  // mount draws the graph into viewport. api supplies the state, the scope
  // (resource type) and its stored positions, and receives the gestures:
  // select(sel), connect(fromNode, toNode), add(kind, point).
  function mount(viewport, api) {
    viewport.innerHTML = `<div class="world">` +
      `<svg class="wires" width="20000" height="20000" viewBox="-10000 -10000 20000 20000" aria-hidden="true">` +
      `<g class="edges"></g><path class="wire temp" d=""/></svg><div class="nodes"></div></div>`;
    const world = viewport.querySelector(".world"), layer = viewport.querySelector(".nodes");
    const gEdges = viewport.querySelector(".edges"), temp = viewport.querySelector(".temp");
    let view = { x: 0, y: 0, k: 1 }, m = { nodes: new Map(), edges: [] }, els = new Map(), pos = {};
    let sel = null, hl = null, gesture = null;

    const apply = () => {
      world.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.k})`;
      viewport.style.backgroundPosition = `${view.x}px ${view.y}px`;
      viewport.style.backgroundSize = `${22 * view.k}px ${22 * view.k}px`;
      api.zoomed && api.zoomed(view.k);
    };
    const toWorld = e => {
      const r = viewport.getBoundingClientRect();
      return { x: (e.clientX - r.left - view.x) / view.k, y: (e.clientY - r.top - view.y) / view.k };
    };
    const anchor = (id, side) => {
      const p = pos[id], el = els.get(id);
      return side === "out" ? { x: p.x + el.offsetWidth, y: p.y + PORT_Y } : { x: p.x, y: p.y + PORT_Y };
    };
    const wireKind = e => {
      const from = m.nodes.get(e.from);
      return from.kind === "rule" ? (from.effect === "deny" ? "deny" : "allow") : from.kind;
    };

    function drawEdges() {
      gEdges.innerHTML = m.edges.map(e => {
        const d = curve(anchor(e.from, "out"), anchor(e.to, "in"));
        return `<path class="hit" data-edge="${esc(e.id)}" d="${d}"/>` +
          `<path class="wire w-${wireKind(e)}${e.implicit ? " implicit" : ""}" data-wire="${esc(e.id)}" d="${d}"/>`;
      }).join("");
    }

    function paint() {
      const on = id => !hl || hl.nodes.has(id);
      for (const [id, el] of els) {
        el.classList.toggle("selected", !!sel && sel.type === "node" && sel.id === id);
        el.classList.toggle("dim", !on(id));
        el.classList.toggle("hl", !!hl && hl.nodes.has(id));
        el.classList.toggle("tone-deny", !!hl && hl.tone === "deny" && hl.nodes.has(id));
      }
      for (const w of gEdges.querySelectorAll(".wire")) {
        const id = w.dataset.wire, lit = !!hl && hl.edges.has(id);
        w.classList.toggle("sel", !!sel && sel.type === "edge" && sel.id === id);
        w.classList.toggle("dim", !!hl && !lit);
        w.classList.toggle("hl", lit);
        w.classList.toggle("tone-deny", lit && hl.tone === "deny");
      }
    }

    // layout stacks the nodes in columns, ordering each column by where
    // the nodes wired into it sit, so that wires cross as little as they can.
    function layout() {
      const preds = new Map();
      m.edges.forEach(e => { if (!preds.has(e.to)) preds.set(e.to, []); preds.get(e.to).push(e.from); });
      const centre = {};
      for (let c = 0; c <= 5; c++) {
        const col = [...m.nodes.values()].filter(n => COL[n.kind] === c);
        const key = n => {
          const ps = (preds.get(n.id) || []).filter(p => centre[p] !== undefined);
          return ps.length ? ps.reduce((s, p) => s + centre[p], 0) / ps.length : 1e9;
        };
        col.sort((a, b) => (a.kind === "perm") - (b.kind === "perm") || (key(a) - key(b)) || a.title.localeCompare(b.title));
        let y = 0;
        col.forEach((n, i) => {
          if (i > 0 && n.kind === "perm" && col[i - 1].kind !== "perm") y += 28;
          pos[n.id] = { x: c * COL_X, y };
          y += els.get(n.id).offsetHeight + GAP;
        });
        const shift = -Math.round((y - GAP) / 2);
        col.forEach(n => { pos[n.id].y += shift; centre[n.id] = pos[n.id].y + els.get(n.id).offsetHeight / 2; });
      }
    }

    // place puts nodes without a position below the others of their column.
    function place(ids) {
      for (const id of ids) {
        const c = COL[m.nodes.get(id).kind];
        const below = [...m.nodes.values()].filter(n => COL[n.kind] === c && pos[n.id])
          .map(n => pos[n.id].y + els.get(n.id).offsetHeight);
        pos[id] = { x: c * COL_X, y: below.length ? Math.max(...below) + GAP : 0 };
      }
    }

    function render(opts = {}) {
      m = model(api.state(), api.scope());
      pos = api.positions();
      layer.innerHTML = [...m.nodes.values()].map(nodeHTML).join("");
      els = new Map([...layer.children].map(el => [el.dataset.node, el]));
      const missing = [...m.nodes.keys()].filter(id => !pos[id]);
      if (opts.relayout || missing.length === m.nodes.size) layout();
      else place(missing);
      for (const [id, el] of els) { el.style.left = pos[id].x + "px"; el.style.top = pos[id].y + "px"; }
      if (sel && !(sel.type === "node" ? m.nodes.has(sel.id) : m.edges.some(e => e.id === sel.id))) select(null);
      drawEdges();
      paint();
      if (opts.fit) fit(0.55);
    }

    // fit shows the whole graph, but never below minK: below it the graph
    // is centred instead, and the rest is a pan away.
    function fit(minK = 0.25, only) {
      const shown = [...els].filter(([id]) => !only || only.has(id));
      if (!shown.length) return;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [id, el] of shown) {
        x0 = Math.min(x0, pos[id].x); y0 = Math.min(y0, pos[id].y);
        x1 = Math.max(x1, pos[id].x + el.offsetWidth); y1 = Math.max(y1, pos[id].y + el.offsetHeight);
      }
      const r = viewport.getBoundingClientRect(), top = 64, bottom = api.reserved ? api.reserved() : 24, side = 32;
      const k = Math.min(1, Math.max(minK, Math.min((r.width - 2 * side) / (x1 - x0), (r.height - top - bottom) / (y1 - y0))));
      view = { k, x: (r.width - (x1 - x0) * k) / 2 - x0 * k, y: top + (r.height - top - bottom - (y1 - y0) * k) / 2 - y0 * k };
      apply();
    }

    function zoomAt(f, cx, cy) {
      const k = Math.min(2, Math.max(0.25, view.k * f));
      view.x = cx - (cx - view.x) * (k / view.k);
      view.y = cy - (cy - view.y) * (k / view.k);
      view.k = k;
      apply();
    }

    function select(s) {
      sel = s;
      paint();
      api.select(s);
    }

    viewport.addEventListener("pointerdown", e => {
      if (e.button !== 0) return;
      const port = e.target.closest(".port.out"), nodeEl = e.target.closest(".node"), hit = e.target.closest(".hit");
      if (port) gesture = { type: "connect", from: nodeEl.dataset.node };
      else if (nodeEl) gesture = { type: "drag", id: nodeEl.dataset.node, start: toWorld(e), orig: { ...pos[nodeEl.dataset.node] }, moved: false };
      else if (hit) { select({ type: "edge", id: hit.dataset.edge }); return; }
      else { gesture = { type: "pan", sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y, moved: false }; viewport.classList.add("panning"); }
      viewport.setPointerCapture(e.pointerId);
      e.preventDefault();
    });

    let dropEl = null;
    const setDrop = (el, ok) => {
      if (dropEl && dropEl !== el) dropEl.classList.remove("drop-ok", "drop-bad");
      dropEl = el;
      if (el) { el.classList.toggle("drop-ok", ok); el.classList.toggle("drop-bad", !ok); }
    };

    viewport.addEventListener("pointermove", e => {
      if (!gesture) return;
      if (gesture.type === "pan") {
        const dx = e.clientX - gesture.sx, dy = e.clientY - gesture.sy;
        if (Math.abs(dx) + Math.abs(dy) > 3) gesture.moved = true;
        view.x = gesture.ox + dx; view.y = gesture.oy + dy;
        apply();
      } else if (gesture.type === "drag") {
        const pt = toWorld(e), dx = pt.x - gesture.start.x, dy = pt.y - gesture.start.y;
        if (Math.abs(dx) + Math.abs(dy) > 2) gesture.moved = true;
        if (!gesture.moved) return;
        pos[gesture.id] = { x: Math.round(gesture.orig.x + dx), y: Math.round(gesture.orig.y + dy) };
        const el = els.get(gesture.id);
        el.style.left = pos[gesture.id].x + "px"; el.style.top = pos[gesture.id].y + "px";
        drawEdges();
        paint();
      } else {
        temp.setAttribute("d", curve(anchor(gesture.from, "out"), toWorld(e)));
        const over = document.elementFromPoint(e.clientX, e.clientY);
        const target = over && over.closest(".node");
        if (target && target.dataset.node !== gesture.from) {
          setDrop(target, api.canConnect(m.nodes.get(gesture.from), m.nodes.get(target.dataset.node)));
        } else setDrop(null);
      }
    });

    const end = e => {
      const g = gesture;
      gesture = null;
      viewport.classList.remove("panning");
      if (!g) return;
      if (g.type === "pan" && !g.moved) select(null);
      if (g.type === "drag" && !g.moved) select({ type: "node", id: g.id });
      if (g.type === "connect") {
        temp.setAttribute("d", "");
        const target = dropEl;
        setDrop(null);
        if (target && e.type === "pointerup") api.connect(m.nodes.get(g.from), m.nodes.get(target.dataset.node));
      }
    };
    viewport.addEventListener("pointerup", end);
    viewport.addEventListener("pointercancel", end);

    viewport.addEventListener("wheel", e => {
      e.preventDefault();
      const r = viewport.getBoundingClientRect();
      const mouseWheel = !e.ctrlKey && e.deltaX === 0 && Number.isInteger(e.deltaY) && Math.abs(e.deltaY) >= 50;
      if (e.ctrlKey || mouseWheel) zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX - r.left, e.clientY - r.top);
      else { view.x -= e.deltaX; view.y -= e.deltaY; apply(); }
    }, { passive: false });

    viewport.addEventListener("dragover", e => {
      if (e.dataTransfer.types.includes("application/x-fga-kind")) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }
    });
    viewport.addEventListener("drop", e => {
      const kind = e.dataTransfer.getData("application/x-fga-kind");
      if (!kind) return;
      e.preventDefault();
      const p = toWorld(e);
      api.add(kind, { x: Math.round(p.x - 110), y: Math.round(p.y - 20) });
    });

    apply();
    return {
      render, fit, select,
      relayout: () => { render({ relayout: true }); fit(0.55); },
      zoom: f => { const r = viewport.getBoundingClientRect(); zoomAt(f, r.width / 2, r.height / 2); },
      centre: () => { const r = viewport.getBoundingClientRect(); return toWorld({ clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }); },
      highlight: h => { hl = h; paint(); },
      node: id => m.nodes.get(id),
      edge: id => m.edges.find(e => e.id === id),
      selection: () => sel,
    };
  }

  return { mount, kindLabel: k => KIND[k] || "Rule" };
})();

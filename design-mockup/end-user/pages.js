// End-user prototype pages. Made-up data only; see app.js.
(function () {
  "use strict";
  const P = window.PROTO, D = P.D, { icon, esc, avatar, day } = P;
  const S = () => P.S();
  const go = h => { location.hash = h; };
  const rerender = () => { P.save(); P.render(); };
  const TEAM = id => D.TEAMS[P.teamOf(id)];

  // ---- sign-in -------------------------------------------------------------
  P.pages.signin = () => {
    const main = ["alice", "bob", "lena", "rita", "carl", "root"].map(P.person);
    return `<div class="signin"><h1>Sign in</h1><p class="lead">Prototype sign-in: pick who you are. In the real console you sign in with your organisation's login.</p>` +
      `<div class="grid3">${main.map(p => `<div class="row" data-me="${p.id}">${avatar(p.id)}<span class="grow">${esc(p.name)}<small>${esc(p.admin ? "Administrator" : D.TEAMS[p.team].name)}</small></span></div>`).join("")}</div>` +
      `<p class="muted" style="margin-top:16px">There are ${D.PEOPLE.length - 1} people in this made-up organisation. Root sees the administrator's pages; everyone else sees their own.</p></div>`;
  };
  P.pages.signinWire = root => root.querySelectorAll("[data-me]").forEach(r => r.addEventListener("click", () => {
    P.setMe(r.dataset.me); go(P.isAdmin(r.dataset.me) ? "#/people" : "#/home"); P.render();
  }));

  // ---- home ----------------------------------------------------------------------
  P.pages.home = () => {
    const me = S().me, h = new Date().getHours();
    const greet = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
    const asked = S().requests.filter(r => r.owner === me && r.status === "waiting");
    const appr = S().approvals.filter(a => a.lead === me && a.status === "waiting");
    const mine = S().requests.filter(r => r.from === me);
    const recent = (D.RECENT[me] || []).map(P.file).filter(f => P.fileAccess(me, f).visible);
    const places = D.PLACES.filter(p => p.team === P.teamOf(me));
    const waiting = asked.map(r => `<div class="row boxed hl">${icon("inbox")}<span class="grow">${esc(P.nameOf(r.from))} asks to view ${esc(r.item)}<small>“${esc(r.why)}” · for ${esc(r.len)}</small></span><a class="btn small" href="#/requests">Answer</a></div>`).join("") +
      appr.map(a => `<div class="row boxed hl">${icon("shield")}<span class="grow">${esc(P.nameOf(a.from))} asks to ${esc(a.text)}<small>${esc(a.at)}</small></span><a class="btn small" href="#/requests">Review</a></div>`).join("");
    return {
      html: `<h1>${greet}, ${esc(P.nameOf(me))}</h1><p class="lead">${esc(TEAM(me).name)}</p>` +
        `<div class="toolbar"><input type="search" id="find" placeholder="Find a file" style="flex:1;max-width:420px"></div><div id="found"></div>` +
        `<h2>Waiting for you</h2>${waiting || `<p class="muted">Nothing is waiting for you.</p>`}` +
        (mine.length ? `<h2>Your requests</h2><div class="card list" style="padding:4px 6px">${mine.map(r => `<div class="row">${icon("inbox")}<span class="grow">${esc(r.item)}</span>${status(r)}</div>`).join("")}</div>` : "") +
        `<h2>Recent</h2><div class="card list" style="padding:4px 6px">${recent.map(f => `<a class="row click" href="#/files/${f.place}/${f.id}" style="color:inherit;text-decoration:none">${P.fileIcon(f)}<span class="grow">${esc(f.name)}<small>${esc(P.place(f.place).name)} · changed ${esc(f.changed)}</small></span>${P.labelTag(f)}</a>`).join("") || `<p class="muted">No recent files.</p>`}</div>` +
        `<h2>Your team</h2><div class="grid2"><a class="card" href="#/files" style="color:inherit;text-decoration:none"><b>${esc(TEAM(me).name)}</b><div class="sub">${places.filter(p => p.kind === "space").length} spaces · ${places.filter(p => p.kind === "source").length} live sources · led by ${esc(P.nameOf(TEAM(me).lead))}</div></a>` +
        `<a class="card" href="#/me" style="color:inherit;text-decoration:none"><b>My access</b><div class="sub">Your rights and what you can reach</div></a></div>`,
      wire: root => root.querySelector("#find").addEventListener("input", e => {
        const q = e.target.value.trim().toLowerCase(), out = root.querySelector("#found");
        if (!q) { out.innerHTML = ""; return; }
        const hits = D.FILES.filter(f => P.fileAccess(me, f).visible && f.name.toLowerCase().includes(q)).slice(0, 8);
        out.innerHTML = `<div class="card list" style="padding:4px 6px;margin-bottom:8px">${hits.map(f => `<a class="row click" href="#/files/${f.place}/${f.id}" style="color:inherit;text-decoration:none">${P.fileIcon(f)}<span class="grow">${esc(f.name)}<small>${esc(P.place(f.place).name)}</small></span>${P.labelTag(f)}</a>`).join("") || `<p class="muted" style="padding:8px">No file matches.</p>`}</div>`;
      }),
    };
  };
  function status(r) {
    if (r.status === "waiting") return `<span class="tag">waiting for the owner</span>`;
    if (r.status === "allowed") return `<span class="tag ok">allowed until ${esc(day(r.until))}</span>`;
    return `<span class="tag bad">declined</span>`;
  }

  // ---- files -------------------------------------------------------------------------
  P.pages.files = ([pid, fid]) => {
    const me = S().me;
    const places = D.PLACES.filter(p => p.team === P.teamOf(me));
    const fromOthers = P.liveShares().filter(s => s.to === me && P.place(P.file(s.file).place).team !== P.teamOf(me));
    // Only the person's own team's places, and their shares from others; any
    // other place is not shown at all, not even as closed.
    const known = places.some(p => p.id === pid) || (pid === "shared" && fromOthers.length);
    const cur = known ? pid : (places[0] && places[0].id);
    if (!known) fid = undefined;
    const side = `<nav class="card places" style="padding:8px">${places.map(p => `<a href="#/files/${p.id}" class="${cur === p.id ? "on" : ""}">${icon(p.kind === "source" ? "live" : p.locked ? "lock" : "folder")}<span>${esc(p.name)}</span></a>`).join("")}` +
      (fromOthers.length ? `<a href="#/files/shared" class="${cur === "shared" ? "on" : ""}">${icon("share")}<span>Shared with you</span><span class="muted" style="margin-left:auto">${fromOthers.length}</span></a>` : "") + `</nav>`;
    let body = "", panel = "", wire = () => {};
    const pl = P.place(cur);
    if (cur === "shared") {
      const list = fromOthers.map(s => P.file(s.file));
      body = `<h1>Shared with you</h1><p class="lead">Files from other teams, shared with you one by one.</p>` + fileList(me, list, fid, "shared");
    } else if (pl && pl.kind === "source") {
      body = sourceView(me, pl);
      wire = root => root.querySelectorAll("[data-ask-part]").forEach(b => b.addEventListener("click", () =>
        askDialog(`${b.dataset.askPart} in ${pl.name}`, pl.owner)));
    } else if (pl) {
      const list = D.FILES.filter(f => f.place === pl.id && P.fileAccess(me, f).visible);
      const canUpload = P.has(me, "upload") && (!pl.locked || pl.keys.includes(me));
      body = `<div class="toolbar"><h1 class="grow" style="margin:0">${esc(pl.name)}</h1>${canUpload ? `<button class="btn" id="up">${icon("upload", "sm")} Upload</button>` : ""}</div>` +
        `<p class="lead">${pl.locked ? `A locked folder of the ${esc(D.TEAMS[pl.team].name)}. Opening files needs a key.` : `A space of the ${esc(D.TEAMS[pl.team].name)}.`}</p>` + fileList(me, list, fid, pl.id);
    }
    const f = fid && P.file(fid);
    if (f && P.fileAccess(me, f).visible) panel = filePanel(me, f);
    return {
      html: `<div class="files ${panel ? "" : "nopanel"}">${side}<div>${body}</div>${panel ? `<div class="panel">${panel}</div>` : ""}</div>`,
      wire: root => {
        wire(root);
        const up = root.querySelector("#up"); if (up) up.addEventListener("click", () => P.toast("Upload would open here (prototype)."));
        if (f) wirePanel(root, me, f);
      },
    };
  };
  function fileList(me, list, sel, base) {
    if (!list.length) return `<p class="muted">Nothing here yet.</p>`;
    return `<div class="card list" style="padding:4px 6px">${list.map(f => {
      const a = P.fileAccess(me, f);
      return `<a class="row click" href="#/files/${base}/${f.id}" style="color:inherit;text-decoration:none;${sel === f.id ? "background:var(--surface-2)" : ""}">${P.fileIcon(f)}` +
        `<span class="grow">${esc(f.name)}<small>${a.open ? `${esc(P.nameOf(f.owner))} · changed ${esc(f.changed)}` : "You can't open this"}</small></span>` +
        `${a.open ? "" : icon("lock", "sm")}${P.labelTag(f)}</a>`;
    }).join("")}</div>`;
  }
  function sourceView(me, pl) {
    const parts = pl.parts.map(pt => {
      const ok = P.partVisible(me, pl, pt);
      return `<div class="part"><div class="sub">${esc(pt.name)} ${pt.conf ? `<span class="tag conf">Confidential</span>` : ""}</div>` +
        (ok ? `<div class="val">${esc(pt.value)}</div>` : `<div class="val muted">${icon("lock")}</div><div class="sub" style="margin:4px 0 8px">You can't see this part.</div><button class="btn small" data-ask-part="${esc(pt.name)}">Ask the owner</button>`) + `</div>`;
    }).join("");
    return `<h1>${esc(pl.name)}</h1><p class="lead">Live readings from a sensor in the ${esc(D.TEAMS[pl.team].name)}. Latest reading today at 19:40.</p><div class="reading">${parts}</div>`;
  }
  function filePanel(me, f) {
    const a = P.fileAccess(me, f);
    if (!a.open) {
      const why = a.needsKey ? "It's in a locked folder, and you don't hold a key yet." : "It's confidential.";
      return `<div class="card"><div style="font-weight:600;margin-bottom:2px">${esc(f.name)}</div><div style="margin:6px 0 12px">${P.labelTag(f)}</div>` +
        `<div class="note" style="display:flex;gap:8px">${icon("lock")}<span>You can't open this file. ${why}</span></div>` +
        `<button class="btn" id="ask" style="width:100%;margin-top:12px">${a.needsKey ? "Ask for a key" : "Ask the owner"}</button></div>`;
    }
    const shares = P.liveShares().filter(s => s.file === f.id);
    const rows = a.owner
      ? shares.map(s => `<div class="row" style="padding:6px 0">${avatar(s.to)}<span class="grow">${esc(P.nameOf(s.to))}<small>can ${esc(s.can)} · until ${esc(day(s.until))}</small></span><button class="btn small" data-take="${s.id}">Take back</button></div>`).join("")
      : (a.sh ? `<div class="row" style="padding:6px 0">${avatar(me)}<span class="grow">You<small>can ${esc(a.sh.can)} · until ${esc(day(a.sh.until))}</small></span></div>` : "");
    return `<div class="card"><div style="font-weight:600;margin-bottom:2px">${esc(f.name)}</div><div style="margin:6px 0 12px">${P.labelTag(f)} <span class="muted" style="font-size:12px">changed ${esc(f.changed)}</span></div>` +
      `<div class="sub" style="margin-bottom:4px">Who has access</div>` +
      `<div class="row" style="padding:6px 0">${avatar(f.owner)}<span class="grow">${esc(a.owner ? "You" : P.nameOf(f.owner))}<small>owner</small></span></div>${rows}` +
      (a.owner && !shares.length ? `<p class="muted" style="font-size:12px;margin:4px 0">Not shared with anyone.</p>` : "") +
      (!a.owner && !a.sh ? `<p class="muted" style="font-size:12px;margin:4px 0">You can reach it through your team.</p>` : "") +
      `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:14px"><button class="btn" id="open">${icon("doc", "sm")} Open</button>` +
      (a.copies ? `<button class="btn" id="dl">${icon("download", "sm")} Download a copy</button>` : "") +
      (a.share ? `<button class="btn primary" id="share">${icon("share", "sm")} Share</button>` : "") + `</div></div>`;
  }
  function wirePanel(root, me, f) {
    const on = (id, fn) => { const b = root.querySelector("#" + id); if (b) b.addEventListener("click", fn); };
    on("open", () => { P.log(`${P.nameOf(me)} opened ${f.name}`); P.save(); P.toast(`${f.name} would open here (prototype).`); });
    on("dl", () => P.toast(`A copy of ${f.name} would download (prototype).`));
    on("share", () => shareDialog(me, f));
    on("ask", () => { const a = P.fileAccess(me, f); if (a.needsKey) P.toast("A key request would go to the folder's owner (prototype)."); else askDialog(f.name, f.owner, f.id); });
    root.querySelectorAll("[data-take]").forEach(b => b.addEventListener("click", () => {
      const s = S().shares.find(x => x.id === b.dataset.take);
      if (!confirm(`Take back ${f.name} from ${P.nameOf(s.to)}?`)) return;
      S().shares = S().shares.filter(x => x.id !== s.id);
      P.log(`${P.nameOf(me)} took back ${f.name} from ${P.nameOf(s.to)}`); P.toast(`Taken back from ${P.nameOf(s.to)}.`); rerender();
    }));
  }

  // ---- share dialog ---------------------------------------------------------------------
  function shareDialog(me, f) {
    const a = P.fileAccess(me, f);
    const everyone = [...D.PEOPLE.filter(p => !p.admin), ...D.AGENTS];
    P.modal(`<div class="hd"><b>Share ${esc(f.name)}</b><button class="btn ghost small" data-close aria-label="Close">${icon("x", "sm")}</button></div>` +
      `<div class="sub">${P.labelTag(f)} in ${esc(P.place(f.place).name)}</div>` +
      `<label class="fld" for="q">Who</label><input type="text" id="q" placeholder="Type a name" style="width:100%" autocomplete="off"><div class="sugg" id="sg"></div>` +
      `<div id="pick" style="margin-top:8px"></div>` +
      `<div class="grid2"><div><label class="fld" for="can">May</label><select id="can" style="width:100%"><option value="view">View</option>${a.edit ? `<option value="edit">Edit</option>` : ""}</select></div>` +
      `<div><label class="fld" for="len">Until</label><select id="len" style="width:100%"><option>1 week</option><option>1 month</option><option>End of year</option></select></div></div>` +
      `<div class="err" id="er"></div><div class="ft"><button class="btn" data-close>Cancel</button><button class="btn primary" id="go">Share</button></div>`,
      (dlg, close) => {
        let chosen = null, verdict = null;
        const q = dlg.querySelector("#q"), sg = dlg.querySelector("#sg"), pick = dlg.querySelector("#pick"), er = dlg.querySelector("#er");
        const team = P.teamOf(me);
        const list = () => {
          const t = q.value.trim().toLowerCase();
          const hits = everyone.filter(p => p.id !== me && (!t || p.name.toLowerCase().includes(t)))
            .sort((x, y) => (P.teamOf(y.id) === team) - (P.teamOf(x.id) === team)).slice(0, 6);
          sg.innerHTML = hits.map(p => `<div class="row click" data-p="${p.id}">${avatar(p.id)}<span class="grow">${esc(p.name)}<small>${esc(p.for ? "assistant for " + P.nameOf(p.for) : D.TEAMS[P.teamOf(p.id)].name)}</small></span></div>`).join("");
          sg.querySelectorAll("[data-p]").forEach(r => r.addEventListener("click", () => {
            chosen = r.dataset.p; verdict = P.shareCheck(me, f, chosen); er.textContent = ""; sg.innerHTML = ""; q.value = P.nameOf(chosen);
            pick.innerHTML = verdict.ok
              ? `<div class="note ok">fga would allow it. ${esc(P.nameOf(chosen))} gets access until the date you pick.</div>`
              : `<div class="note bad">fga wouldn't allow sharing this with ${esc(P.nameOf(chosen))}.<br><span style="font-size:12px">Facts: ${esc(verdict.facts)}</span></div>`;
          }));
        };
        q.addEventListener("input", () => { chosen = null; verdict = null; pick.innerHTML = ""; er.textContent = ""; list(); });
        list(); q.focus();
        dlg.querySelector("#go").addEventListener("click", () => {
          if (!chosen) { er.textContent = "Pick someone first."; return; }
          if (!verdict.ok) { er.textContent = "Pick someone fga would allow."; return; }
          const can = dlg.querySelector("#can").value, len = dlg.querySelector("#len").value, until = P.untilDate(len);
          S().shares = S().shares.filter(s => !(s.file === f.id && s.to === chosen));
          S().shares.push({ id: P.nextId("s"), file: f.id, from: me, to: chosen, can, until });
          P.log(`${P.nameOf(me)} shared ${f.name} with ${P.nameOf(chosen)} until ${day(until)}`);
          close(); P.toast(`Shared with ${P.nameOf(chosen)} until ${day(until)}.`); rerender();
        });
      });
  }

  // ---- ask for access ---------------------------------------------------------------------
  function askDialog(item, owner, fileId) {
    const me = S().me;
    P.modal(`<div class="hd"><b>Ask the owner for access</b><button class="btn ghost small" data-close aria-label="Close">${icon("x", "sm")}</button></div>` +
      `<div class="sub">${esc(item)}</div><label class="fld" for="why">Why do you need it?</label><textarea id="why" rows="3" placeholder="Checking the delivery terms for October"></textarea>` +
      `<label class="fld" for="len">For how long?</label><select id="len" style="width:100%"><option>1 week</option><option>1 month</option></select>` +
      `<div class="err" id="er"></div><div class="ft"><button class="btn" data-close>Cancel</button><button class="btn primary" id="go">Send request</button></div>`,
      (dlg, close) => {
        const why = dlg.querySelector("#why"), er = dlg.querySelector("#er");
        why.addEventListener("input", () => { er.textContent = ""; });
        dlg.querySelector("#go").addEventListener("click", () => {
          if (!why.value.trim()) { er.textContent = "Say why you need it first."; return; }
          S().requests.unshift({ id: P.nextId("r"), file: fileId || null, item, from: me, owner, why: why.value.trim(), len: dlg.querySelector("#len").value, status: "waiting", at: "just now" });
          P.log(`${P.nameOf(me)} asked the owner of ${item} for access`);
          close(); P.toast("Sent to the owner. You'll see the answer under Requests."); rerender();
        });
      });
  }

  // ---- my access -------------------------------------------------------------------------
  function ownBoxes(me) {
    const tm = D.TEAMS[P.teamOf(me)], open = P.has(me, "open");
    const boxes = D.PLACES.filter(p => p.team === tm.id).map(pl => {
      if (!open) return { title: pl.name, short: "nothing", facts: `You don't have the right to open files.` };
      if (pl.kind === "source") {
        const seen = pl.parts.filter(pt => P.partVisible(me, pl, pt));
        const conf = pl.parts.filter(pt => pt.conf).map(pt => pt.name.toLowerCase());
        return { title: pl.name, short: pl.owner === me ? "all parts · you own it" : seen.length === pl.parts.length ? "all parts" : seen.length ? seen.map(s => s.name.toLowerCase()).join(", ") + " only" : "nothing",
          facts: `${pl.name} has ${pl.parts.length} parts.${conf.length ? ` ${conf.join(" and ")} ${conf.length > 1 ? "are" : "is"} marked confidential.` : ""}${pl.owner === me ? " You own the readings." : ""}` };
      }
      if (pl.locked) {
        const key = pl.keys.includes(me);
        return { title: pl.name, short: key ? (P.has(me, "upload") ? "can edit" : "can view") : "needs a key", facts: `${pl.name} is a locked folder. ${key ? "You hold a key for it." : "You don't hold a key for it yet."}` };
      }
      return { title: pl.name, short: P.has(me, "upload") ? "can edit" : "can view", facts: `${pl.name} is a space of the ${tm.name}. You're in that team.` };
    });
    const others = P.liveShares().filter(s => s.to === me && P.place(P.file(s.file).place).team !== tm.id);
    if (others.length) boxes.push({ title: `${others.length} file${others.length > 1 ? "s" : ""} shared with you`, short: "from other teams", dashed: true, facts: `Shared with you one by one: ${others.map(s => P.file(s.file).name).join(", ")}.` });
    return boxes;
  }
  function rightsChips(id) {
    return D.RIGHTS.map(([k, w]) => `<span class="chip ${P.has(id, k) ? "yes" : "no"}">${icon(P.has(id, k) ? "check" : "x", "sm")}${esc(w)}</span>`).join("");
  }
  P.pages.me = () => {
    const me = S().me, boxes = ownBoxes(me);
    const mine = P.liveShares().filter(s => s.from === me);
    return {
      html: `<div style="display:flex;align-items:center;gap:14px;margin-bottom:8px">${avatar(me, "lg")}<div><h1>${esc(P.nameOf(me))}</h1><div class="sub">${esc(TEAM(me).name)} · active</div></div></div>` +
        `<h2>Your rights</h2><div>${rightsChips(me)}</div>` +
        `<h2>What you can reach</h2><div class="card">${P.picture(P.nameOf(me), boxes)}<div class="note" id="facts" style="margin-top:10px">Click a place for the facts about it.</div></div>` +
        `<h2>Shared by you</h2>${mine.length ? `<div class="card list" style="padding:4px 6px">${mine.map(s => `<div class="row">${P.fileIcon(P.file(s.file))}<span class="grow">${esc(P.file(s.file).name)} <span class="muted">to</span> ${esc(P.nameOf(s.to))}<small>can ${esc(s.can)} · until ${esc(day(s.until))}</small></span><button class="btn small" data-take="${s.id}">Take back</button></div>`).join("")}</div>` : `<p class="muted">You haven't shared anything.</p>`}`,
      wire: root => {
        P.wirePicture(root, boxes, root.querySelector("#facts"));
        root.querySelectorAll("[data-take]").forEach(b => b.addEventListener("click", () => {
          const s = S().shares.find(x => x.id === b.dataset.take);
          if (!confirm(`Take back ${P.file(s.file).name} from ${P.nameOf(s.to)}?`)) return;
          S().shares = S().shares.filter(x => x.id !== s.id);
          P.log(`${P.nameOf(me)} took back ${P.file(s.file).name} from ${P.nameOf(s.to)}`); P.toast("Taken back."); rerender();
        }));
      },
    };
  };

  // ---- requests ------------------------------------------------------------------------------
  P.pages.requests = () => {
    const me = S().me;
    const asked = S().requests.filter(r => r.owner === me);
    const appr = S().approvals.filter(a => a.lead === me);
    const mine = S().requests.filter(r => r.from === me);
    const askedHtml = asked.map(r => `<div class="row boxed${r.status === "waiting" ? " hl" : ""}">${avatar(r.from)}<span class="grow">${esc(P.nameOf(r.from))} asks to view ${esc(r.item)}<small>“${esc(r.why)}” · for ${esc(r.len)} · ${esc(r.at)}</small>` +
      (r.status === "waiting" ? `<small>If you allow: a share to ${esc(P.nameOf(r.from))}, view only, until ${esc(day(P.untilDate(r.len)))}.</small>` : "") + `</span>` +
      (r.status === "waiting" ? `<button class="btn small primary" data-allow="${r.id}">Allow</button><button class="btn small" data-decline="${r.id}">Decline</button>` : r.status === "allowed" ? `<span class="tag ok">allowed</span>` : `<span class="tag bad">declined</span>`) + `</div>`).join("");
    const apprHtml = appr.map(a => `<div class="row boxed${a.status === "waiting" ? " hl" : ""}">${avatar(a.from)}<span class="grow">${esc(P.nameOf(a.from))} asks to ${esc(a.text)}<small>${esc(a.at)}</small></span>` +
      (a.status === "waiting" ? `<button class="btn small primary" data-ok="${a.id}">Approve</button><button class="btn small" data-no="${a.id}">Decline</button>` : `<span class="tag ${a.status === "approved" ? "ok" : "bad"}">${esc(a.status)}</span>`) + `</div>`).join("");
    const mineHtml = mine.map(r => `<div class="row boxed">${icon("inbox")}<span class="grow">${esc(r.item)}<small>${esc(r.at)}</small></span>${status(r)}</div>`).join("");
    return {
      html: `<h1>Requests</h1><p class="lead">Things people ask of you, and what you asked for.</p>` +
        (asked.length ? `<h2>Asked of you</h2>${askedHtml}` : "") + (appr.length ? `<h2>Approvals for your team</h2>${apprHtml}` : "") +
        `<h2>Your requests</h2>${mineHtml || `<p class="muted">You haven't asked for anything. When you can't open something, use "Ask the owner".</p>`}`,
      wire: root => {
        const by = (sel, fn) => root.querySelectorAll(sel).forEach(b => b.addEventListener("click", () => fn(b)));
        by("[data-allow]", b => {
          const r = S().requests.find(x => x.id === b.dataset.allow), until = P.untilDate(r.len);
          r.status = "allowed"; r.until = until;
          if (r.file) S().shares.push({ id: P.nextId("s"), file: r.file, from: me, to: r.from, can: "view", until });
          else { S().extra[r.from] = S().extra[r.from] || []; const pl = D.PLACES.find(p => r.item.endsWith(p.name)); if (pl) S().extra[r.from].push(pl.id + ":" + r.item.split(" in ")[0]); }
          P.log(`${P.nameOf(me)} allowed ${P.nameOf(r.from)} to view ${r.item} until ${day(until)}`); P.toast(`Shared with ${P.nameOf(r.from)} until ${day(until)}.`); rerender();
        });
        by("[data-decline]", b => { const r = S().requests.find(x => x.id === b.dataset.decline); r.status = "declined"; P.log(`${P.nameOf(me)} declined a request from ${P.nameOf(r.from)}`); P.toast("Declined."); rerender(); });
        by("[data-ok]", b => { const a = S().approvals.find(x => x.id === b.dataset.ok); a.status = "approved"; S().labels[a.file] = "team"; P.log(`${P.nameOf(me)} approved: ${a.text}`); P.toast("Approved."); rerender(); });
        by("[data-no]", b => { const a = S().approvals.find(x => x.id === b.dataset.no); a.status = "declined"; P.log(`${P.nameOf(me)} declined: ${a.text}`); P.toast("Declined."); rerender(); });
      },
    };
  };

  // ---- assistant ---------------------------------------------------------------------------
  P.pages.assistant = () => {
    const me = S().me, ag = D.AGENTS.find(a => a.for === me);
    if (!ag) return { html: `<h1>My assistant</h1><p class="muted">You have no assistant.</p>` };
    const stopped = S().stopped[ag.id];
    const today = S().activity.filter(([, t]) => t.startsWith(ag.name));
    return {
      html: `<div style="display:flex;align-items:center;gap:14px;margin-bottom:8px"><span class="av lg bot">${icon("bot")}</span><div style="flex:1"><h1>Your assistant · ${esc(ag.name)}</h1>` +
        `<div class="sub">${stopped ? "Stopped. It can do nothing for you." : `Works for you until ${esc(day(ag.until))} · never more than you can do yourself`}</div></div>${stopped ? "" : `<button class="btn danger" id="stop">Stop</button>`}</div>` +
        `<div id="cf"></div><h2>It may</h2>${ag.may.map(([t, s]) => `<div class="row boxed" style="${stopped ? "color:var(--text-3)" : ""}">${icon("live")}<span class="grow">${esc(t)}<small>${esc(s)}</small></span></div>`).join("")}` +
        `<h2>It may never</h2><div class="row">${icon("ban")}<span class="grow">${esc(ag.never)}</span></div>` +
        `<h2>What it did today</h2><div class="card list" style="padding:4px 6px">${today.map(([t, x]) => `<div class="row"><span class="muted" style="width:48px">${esc(t)}</span><span class="grow">${esc(x.replace(ag.name + " ", "").replace(" for " + P.nameOf(me), ""))}</span></div>`).join("") || `<p class="muted" style="padding:8px">Nothing yet today.</p>`}</div>`,
      wire: root => {
        const b = root.querySelector("#stop"); if (!b) return;
        let asked = false;
        b.addEventListener("click", () => {
          if (!asked) { asked = true; b.textContent = "Yes, stop it"; root.querySelector("#cf").innerHTML = `<div class="note warn">Stopping is final. Only an administrator can start an assistant for you again.</div>`; return; }
          S().stopped[ag.id] = true; P.log(`${P.nameOf(me)} stopped ${ag.name}`); P.toast(`${ag.name} is stopped.`); rerender();
        });
      },
    };
  };

  // ---- administrator: people ------------------------------------------------------------------
  let pq = "", pteam = "", ppage = 0;
  const people = () => D.PEOPLE.filter(p => !p.admin);
  const rightsLine = id => D.RIGHTS.filter(([k]) => k !== "signin" && P.has(id, k)).map(([, w]) => w.toLowerCase()).join(", ") || "no rights";
  P.pages.people = ([id, sub]) => {
    if (id && sub === "change") return changePage(id);
    if (id) return personAdmin(id);
    const list = people().filter(p => (!pq || p.name.toLowerCase().includes(pq)) && (!pteam || P.teamOf(p.id) === pteam));
    const per = 20, pages = Math.max(1, Math.ceil(list.length / per)); ppage = Math.min(ppage, pages - 1);
    const shown = list.slice(ppage * per, ppage * per + per);
    return {
      html: `<h1>People</h1><p class="lead">Everyone in the organisation. Pick a person to see their rights and where they belong.</p>` +
        `<div class="toolbar"><input type="search" id="pq" placeholder="Find a person" value="${esc(pq)}" style="flex:1;max-width:360px">` +
        `<select id="pt"><option value="">All teams</option>${Object.values(D.TEAMS).map(t => `<option value="${t.id}" ${pteam === t.id ? "selected" : ""}>${esc(t.name)}</option>`).join("")}</select></div>` +
        `<div class="card list" style="padding:4px 6px">${shown.map(p => `<a class="row click" href="#/people/${p.id}" style="color:inherit;text-decoration:none">${avatar(p.id)}<span class="grow">${esc(p.name)}<small>${esc(D.TEAMS[P.teamOf(p.id)].name)}</small></span><span class="muted" style="font-size:12px;max-width:45%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(rightsLine(p.id))}</span>${icon("chevron", "sm")}</a>`).join("") || `<p class="muted" style="padding:8px">Nobody matches.</p>`}` +
        `<div class="pager"><span>${list.length} people</span><span><button class="btn small" id="prev" ${ppage ? "" : "disabled"}>Previous</button> Page ${ppage + 1} of ${pages} <button class="btn small" id="next" ${ppage < pages - 1 ? "" : "disabled"}>Next</button></span></div></div>`,
      wire: root => {
        const q = root.querySelector("#pq");
        q.addEventListener("input", () => { pq = q.value.trim().toLowerCase(); ppage = 0; P.render(); const n = document.querySelector("#pq"); n.focus(); n.setSelectionRange(n.value.length, n.value.length); });
        root.querySelector("#pt").addEventListener("change", e => { pteam = e.target.value; ppage = 0; P.render(); });
        root.querySelector("#prev").addEventListener("click", () => { ppage--; P.render(); });
        root.querySelector("#next").addEventListener("click", () => { ppage++; P.render(); });
      },
    };
  };
  function factBoxes(id) {
    const tm = D.TEAMS[P.teamOf(id)], nm = P.nameOf(id);
    const boxes = D.PLACES.filter(p => p.team === tm.id).map(pl => {
      if (pl.kind === "source") return { title: pl.name, short: `team source · ${pl.parts.length} parts${pl.owner === id ? " · owner" : ""}`, facts: `A data source of the ${tm.name}, in ${pl.parts.length} parts: ${pl.parts.map(pt => `${pt.name.toLowerCase()} (${pt.conf ? "confidential" : "team"})`).join(" and ")}.${pl.owner === id ? ` ${nm} owns it.` : ""}` };
      if (pl.locked) return { title: pl.name, short: `team space · locked${pl.keys.includes(id) ? " · holds a key" : ""}`, facts: `A locked space of the ${tm.name}. ${P.nameOf(pl.keyFrom)} hands out keys. ${nm} ${pl.keys.includes(id) ? "holds" : "doesn't hold"} one.` };
      return { title: pl.name, short: "team space", facts: `A space of the ${tm.name}. ${nm} is in that team.` };
    });
    const others = P.liveShares().filter(s => s.to === id && P.place(P.file(s.file).place).team !== tm.id);
    if (others.length) {
      const spaces = new Set(others.map(s => P.file(s.file).place));
      boxes.push({ title: `${others.length} share${others.length > 1 ? "s" : ""} from others`, short: `in ${spaces.size} space${spaces.size > 1 ? "s" : ""}`, dashed: true, facts: `${others.length} shares to ${nm} in spaces of other teams.` });
    }
    return boxes;
  }
  function personAdmin(id) {
    const p = P.person(id); if (!p) return { html: `<p>Nobody with that name.</p>` };
    const boxes = factBoxes(id);
    const given = P.liveShares().filter(s => s.from === id), got = P.liveShares().filter(s => s.to === id);
    const shareRow = (s, other) => `<div class="row">${P.fileIcon(P.file(s.file))}<span class="grow">${esc(P.file(s.file).name)} <span class="muted">${other === "to" ? "to" : "from"}</span> ${esc(P.nameOf(other === "to" ? s.to : s.from))}<small>can ${esc(s.can)} · until ${esc(day(s.until))}</small></span></div>`;
    return {
      html: `<a href="#/people" class="sub">${icon("back", "sm")} People</a>` +
        `<div style="display:flex;align-items:center;gap:14px;margin:12px 0 8px">${avatar(id, "lg")}<div style="flex:1"><h1>${esc(p.name)}</h1><div class="sub">${esc(D.TEAMS[P.teamOf(id)].name)} · active</div></div><a class="btn primary" href="#/people/${id}/change">Change access</a></div>` +
        `<h2>Rights</h2><div>${rightsChips(id)}</div>` +
        `<h2>Where ${esc(p.name)} belongs</h2><div class="card">${P.picture(p.name, boxes)}<div class="note" id="facts" style="margin-top:10px">Built from ${esc(p.name)}'s team, rights and shares. Only ${esc(p.name)}'s own page shows what fga allows.</div></div>` +
        `<h2>Shares</h2><div class="grid2"><div class="card list" style="padding:4px 6px"><div class="sub" style="padding:8px 12px">Given by ${esc(p.name)}</div>${given.map(s => shareRow(s, "to")).join("") || `<p class="muted" style="padding:0 12px">None.</p>`}</div>` +
        `<div class="card list" style="padding:4px 6px"><div class="sub" style="padding:8px 12px">Given to ${esc(p.name)}</div>${got.map(s => shareRow(s, "from")).join("") || `<p class="muted" style="padding:0 12px">None.</p>`}</div></div>`,
      wire: root => P.wirePicture(root, boxes, root.querySelector("#facts")),
    };
  }
  function changePage(id) {
    const p = P.person(id), tm = P.teamOf(id);
    const parts = D.PLACES.filter(pl => pl.kind === "source" && pl.team === tm && pl.owner !== id)
      .flatMap(pl => pl.parts.filter(pt => pt.conf).map(pt => ({ key: pl.id + ":" + pt.name, text: `${pt.name} in ${pl.name}` })));
    const extra = S().extra[id] || [];
    const pending = S().changes.filter(c => c.status !== "live" && c.apply && c.apply.pid === id).map(c => c.apply.key);
    const mates = people().filter(x => x.id !== id && P.teamOf(x.id) === tm).slice(0, 30);
    return {
      html: `<a href="#/people/${id}" class="sub">${icon("back", "sm")} ${esc(p.name)}</a><h1 style="margin-top:12px">Change ${esc(p.name)}'s access</h1>` +
        `<p class="lead">Rights and team apply right away. Extra access to confidential parts changes a rule, so it goes to the security officer.</p>` +
        `<div class="toolbar"><span class="sub">Start from</span><select id="like"><option value="">Choose a colleague</option>${mates.map(m => `<option value="${m.id}">Same as ${esc(m.name)}</option>`).join("")}</select></div>` +
        `<div class="section"><h3>${icon("key", "sm")} Rights</h3><div class="ckgrid">${D.RIGHTS.map(([k, w]) => `<label><input type="checkbox" data-r="${k}" ${P.has(id, k) ? "checked" : ""}> ${esc(w)}</label>`).join("")}</div></div>` +
        `<div class="section"><h3>${icon("users", "sm")} Team</h3><select id="team">${Object.values(D.TEAMS).map(t => `<option value="${t.id}" ${tm === t.id ? "selected" : ""}>${esc(t.name)}</option>`).join("")}</select></div>` +
        (parts.length ? `<div class="section"><h3>${icon("lock", "sm")} Confidential parts</h3><div class="ckgrid">${parts.map(x => `<label><input type="checkbox" data-x="${esc(x.key)}" ${extra.includes(x.key) || pending.includes(x.key) ? "checked" : ""} ${pending.includes(x.key) ? "disabled" : ""}> ${esc(x.text)}${pending.includes(x.key) ? ` <span class="tag conf">waiting</span>` : ""}</label>`).join("")}</div></div>` : "") +
        `<div class="note" id="sum">Nothing changed yet.</div><div style="display:flex;gap:8px;margin-top:12px"><button class="btn primary" id="save">Save</button><a class="btn" href="#/people/${id}">Cancel</a></div>`,
      wire: root => {
        const rs = [...root.querySelectorAll("[data-r]")], xs = [...root.querySelectorAll("[data-x]:not([disabled])")], teamSel = root.querySelector("#team");
        const start = { r: rs.map(b => b.checked), x: xs.map(b => b.checked), t: teamSel.value };
        const diff = () => {
          const now = rs.filter((b, i) => b.checked !== start.r[i]).length + (teamSel.value !== start.t ? 1 : 0);
          const sec = xs.filter((b, i) => b.checked !== start.x[i]).length;
          const out = [];
          if (now) out.push(`${now} change${now > 1 ? "s apply" : " applies"} right away`);
          if (sec) out.push(`${sec} change${sec > 1 ? "s go" : " goes"} to the security officer`);
          root.querySelector("#sum").textContent = out.length ? out.join(". ") + "." : "Nothing changed yet.";
          return { now, sec };
        };
        root.querySelectorAll("input,select#team").forEach(el => el.addEventListener("change", diff));
        root.querySelector("#like").addEventListener("change", e => {
          const m = e.target.value; if (!m) return;
          rs.forEach(b => { b.checked = P.has(m, b.dataset.r); }); diff();
        });
        root.querySelector("#save").addEventListener("click", () => {
          const d = diff(); if (!d.now && !d.sec) { P.toast("Nothing to save."); return; }
          S().rights[id] = rs.filter(b => b.checked).map(b => b.dataset.r);
          S().team[id] = teamSel.value;
          xs.forEach((b, i) => {
            if (b.checked === start.x[i]) return;
            const key = b.dataset.x, [plid, part] = key.split(":"), pl = P.place(plid);
            if (b.checked) S().changes.unshift({ id: P.nextId("c"), text: `Let ${p.name} see ${part} in ${pl.name}`, by: S().me, status: "waiting", at: "just now", apply: { pid: id, key, add: true } });
            else S().changes.unshift({ id: P.nextId("c"), text: `Stop ${p.name} seeing ${part} in ${pl.name}`, by: S().me, status: "waiting", at: "just now", apply: { pid: id, key, add: false } });
          });
          P.log(`Root changed ${p.name}'s access`);
          P.toast(d.sec ? "Saved. Rule changes wait for the security officer." : "Saved."); P.save(); go(`#/people/${id}`);
        });
      },
    };
  }

  // ---- administrator: teams -------------------------------------------------------------------
  let tq = "";
  P.pages.teams = ([id]) => {
    if (!id) return {
      html: `<h1>Teams</h1><p class="lead">Each team has its own spaces and live sources.</p><div class="grid3">${Object.values(D.TEAMS).map(t => {
        const n = people().filter(p => P.teamOf(p.id) === t.id).length, pl = D.PLACES.filter(p => p.team === t.id);
        return `<a class="card" href="#/teams/${t.id}" style="color:inherit;text-decoration:none"><b>${esc(t.name)}</b><div class="sub">${n} people · led by ${esc(P.nameOf(t.lead))}</div><div class="sub">${pl.filter(p => p.kind === "space").length} spaces · ${pl.filter(p => p.kind === "source").length} live sources</div></a>`;
      }).join("")}</div>`,
    };
    const t = D.TEAMS[id], pl = D.PLACES.filter(p => p.team === id);
    const members = people().filter(p => P.teamOf(p.id) === id && (!tq || p.name.toLowerCase().includes(tq)));
    return {
      html: `<a href="#/teams" class="sub">${icon("back", "sm")} Teams</a><h1 style="margin-top:12px">${esc(t.name)}</h1><p class="lead">Led by ${esc(P.nameOf(t.lead))}.</p>` +
        `<h2>Spaces and sources</h2><div class="grid3">${pl.map(x => `<div class="card"><div style="display:flex;gap:8px;align-items:center">${icon(x.kind === "source" ? "live" : x.locked ? "lock" : "folder")}<b>${esc(x.name)}</b></div><div class="sub">${x.kind === "source" ? `${x.parts.length} parts · owner ${esc(P.nameOf(x.owner))}` : x.locked ? `locked · keys from ${esc(P.nameOf(x.keyFrom))}` : `${D.FILES.filter(f => f.place === x.id).length} files`}</div></div>`).join("")}</div>` +
        `<h2>Members</h2><div class="toolbar"><input type="search" id="tq" placeholder="Find a member" value="${esc(tq)}" style="flex:1;max-width:360px"><span class="muted">${members.length} people</span></div>` +
        `<div class="card list" style="padding:4px 6px">${members.slice(0, 30).map(p => `<a class="row click" href="#/people/${p.id}" style="color:inherit;text-decoration:none">${avatar(p.id)}<span class="grow">${esc(p.name)}${t.lead === p.id ? "<small>team lead</small>" : ""}</span>${icon("chevron", "sm")}</a>`).join("")}${members.length > 30 ? `<p class="muted" style="padding:8px">Showing 30. Use the search to find others.</p>` : ""}</div>`,
      wire: root => { const q = root.querySelector("#tq"); q.addEventListener("input", () => { tq = q.value.trim().toLowerCase(); P.render(); const n = document.querySelector("#tq"); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }); },
    };
  };

  // ---- administrator: rule changes --------------------------------------------------------------
  P.pages.changes = () => {
    const steps = c => ["waiting", "exported", "live"].map((s, i, all) => {
      const at = all.indexOf(c.status);
      const w = ["Waiting", "Exported for signing", "Signed and live"][i];
      return `<span class="${i < at || c.status === "live" ? "done" : i === at ? "on" : ""}">${i + 1} ${w}</span>`;
    }).join("");
    return {
      html: `<h1>Rule changes</h1><p class="lead">Changes that alter a rule. They are signed outside the console by the security officer, then go live.</p>` +
        (S().changes.map(c => `<div class="section"><div style="display:flex;align-items:center;gap:8px"><b style="flex:1">${esc(c.text)}</b><span class="muted" style="font-size:12px">by ${esc(P.nameOf(c.by))}, ${esc(c.at)}</span></div>` +
          `<div class="steps">${steps(c)}</div>` +
          (c.status === "waiting" ? `<button class="btn small primary" data-exp="${c.id}">Export for signing</button> <button class="btn small" data-drop="${c.id}">Discard</button>` :
            c.status === "exported" ? `<button class="btn small" data-live="${c.id}">Mark as signed and live</button>` : "") + `</div>`).join("") || `<p class="muted">No rule changes.</p>`),
      wire: root => {
        const by = (sel, fn) => root.querySelectorAll(sel).forEach(b => b.addEventListener("click", () => fn(S().changes.find(c => c.id === b.dataset[Object.keys(b.dataset)[0]]))));
        by("[data-exp]", c => { c.status = "exported"; P.toast("Exported for signing (prototype)."); rerender(); });
        by("[data-drop]", c => { S().changes = S().changes.filter(x => x !== c); P.toast("Discarded."); rerender(); });
        by("[data-live]", c => {
          c.status = "live";
          if (c.apply) { const l = S().extra[c.apply.pid] = S().extra[c.apply.pid] || []; if (c.apply.add) { if (!l.includes(c.apply.key)) l.push(c.apply.key); } else S().extra[c.apply.pid] = l.filter(k => k !== c.apply.key); }
          P.log(`Rule change live: ${c.text}`); P.toast("Live (prototype)."); rerender();
        });
      },
    };
  };

  // ---- administrator: activity -------------------------------------------------------------------
  let aq = "";
  P.pages.activity = () => {
    const rows = S().activity.filter(([, t]) => !aq || t.toLowerCase().includes(aq));
    return {
      html: `<h1>Activity</h1><p class="lead">What happened today, in plain words.</p><div class="toolbar"><input type="search" id="aq" placeholder="Filter by name or file" value="${esc(aq)}" style="flex:1;max-width:360px"></div>` +
        `<div class="card list" style="padding:4px 6px">${rows.map(([t, x]) => `<div class="row"><span class="muted" style="width:48px">${esc(t)}</span><span class="grow">${esc(x)}</span>${/refused/.test(x) ? `<span class="tag bad">refused</span>` : ""}</div>`).join("") || `<p class="muted" style="padding:8px">Nothing matches.</p>`}</div>`,
      wire: root => { const q = root.querySelector("#aq"); q.addEventListener("input", () => { aq = q.value.trim().toLowerCase(); P.render(); const n = document.querySelector("#aq"); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }); },
    };
  };
})();

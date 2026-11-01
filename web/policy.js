// The mockup's stand-in for the decision role: parses rule conditions
// (the subset of CEL the example bundle uses) and decides one request the
// way fga does: the permission bound first, then ceiling denies, then
// business rules, where a deny wins and nothing allowed means denied.
"use strict";

window.FGA_POLICY = (() => {
  function tokenize(src) {
    const toks = [];
    let i = 0;
    while (i < src.length) {
      const c = src[i];
      if (/\s/.test(c)) { i++; continue; }
      if (c === '"') {
        let j = i + 1, s = "";
        while (j < src.length && src[j] !== '"') { if (src[j] === "\\") j++; s += src[j++]; }
        if (j >= src.length) throw new Error("a string is not closed");
        toks.push({ t: "str", v: s });
        i = j + 1;
        continue;
      }
      const two = src.slice(i, i + 2);
      if (["&&", "||", "==", "!=", "<=", ">="].includes(two)) { toks.push({ t: "op", v: two }); i += 2; continue; }
      if ("<>!().,[]".includes(c)) { toks.push({ t: "op", v: c }); i++; continue; }
      const num = /^[0-9]+(\.[0-9]+)?/.exec(src.slice(i));
      if (num) { toks.push({ t: "num", v: Number(num[0]) }); i += num[0].length; continue; }
      const id = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i));
      if (id) { toks.push({ t: "id", v: id[0] }); i += id[0].length; continue; }
      throw new Error(`unexpected "${c}" at position ${i + 1}`);
    }
    return toks;
  }

  function parse(src) {
    const toks = tokenize(src);
    let i = 0;
    const peek = v => toks[i] && toks[i].t !== "str" && toks[i].v === v;
    const take = v => { if (!peek(v)) throw new Error(`expected "${v}"`); i++; };
    const path = () => {
      const first = toks[i];
      if (!first || first.t !== "id" || !["principal", "resource"].includes(first.v)) {
        throw new Error(`names start with principal or resource${first ? `, not "${first.v}"` : ""}`);
      }
      const p = [first.v];
      i++;
      while (peek(".")) {
        i++;
        if (!toks[i] || toks[i].t !== "id") throw new Error('expected a name after "."');
        p.push(toks[i++].v);
      }
      return p;
    };
    const primary = () => {
      const tk = toks[i];
      if (!tk) throw new Error("the condition ends too early");
      if (tk.t === "str" || tk.t === "num") { i++; return { k: "lit", v: tk.v }; }
      if (tk.t === "id" && (tk.v === "true" || tk.v === "false")) { i++; return { k: "lit", v: tk.v === "true" }; }
      if (tk.t === "id" && tk.v === "has") { i++; take("("); const p = path(); take(")"); return { k: "has", p }; }
      if (peek("(")) { i++; const e = or(); take(")"); return e; }
      if (peek("[")) {
        i++;
        const items = [];
        while (!peek("]")) { items.push(or()); if (!peek("]")) take(","); }
        i++;
        return { k: "list", items };
      }
      return { k: "path", p: path() };
    };
    const unary = () => (peek("!") ? (i++, { k: "not", a: unary() }) : primary());
    const cmp = () => {
      const a = unary();
      const tk = toks[i];
      if (tk && ((tk.t === "op" && ["==", "!=", "<", "<=", ">", ">="].includes(tk.v)) || (tk.t === "id" && tk.v === "in"))) {
        i++;
        return { k: "cmp", op: tk.v, a, b: unary() };
      }
      return a;
    };
    const and = () => { let a = cmp(); while (peek("&&")) { i++; a = { k: "and", a, b: cmp() }; } return a; };
    const or = () => { let a = and(); while (peek("||")) { i++; a = { k: "or", a, b: and() }; } return a; };
    if (!toks.length) return { k: "lit", v: true };
    const ast = or();
    if (i < toks.length) throw new Error(`unexpected "${toks[i].v}"`);
    return ast;
  }

  const get = (env, p) => p.reduce((o, k) => (o != null && typeof o === "object" ? o[k] : undefined), env);
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  function evaluate(n, env) {
    switch (n.k) {
      case "lit": return n.v;
      case "path": return get(env, n.p);
      case "has": return get(env, n.p) !== undefined;
      case "list": return n.items.map(x => evaluate(x, env));
      case "not": return evaluate(n.a, env) !== true;
      case "and": return evaluate(n.a, env) === true && evaluate(n.b, env) === true;
      case "or": return evaluate(n.a, env) === true || evaluate(n.b, env) === true;
      case "cmp": {
        const a = evaluate(n.a, env), b = evaluate(n.b, env);
        // A missing attribute makes the comparison fail, so the rule does
        // not match: never allow on missing data.
        if (a === undefined || b === undefined) return false;
        switch (n.op) {
          case "==": return eq(a, b);
          case "!=": return !eq(a, b);
          case "<": return a < b;
          case "<=": return a <= b;
          case ">": return a > b;
          case ">=": return a >= b;
          case "in": return Array.isArray(b) ? b.some(x => eq(x, a)) : false;
        }
      }
    }
    return false;
  }

  function check(src) {
    try { parse(src); return null; } catch (e) { return e.message; }
  }

  function matches(rule, principal, action, resource) {
    if (!rule.actions.includes(action)) return false;
    if (!rule.roles.includes("*") && !rule.roles.some(r => principal.roles.includes(r))) return false;
    try {
      return evaluate(parse(rule.when), { principal, resource }) === true;
    } catch {
      return false;
    }
  }

  // decide answers one request. caps is the actor's permission bound for
  // the resource type; rules are all rules of the bundle.
  function decide({ principal, caps, action, resource, rules }) {
    const trace = [];
    if (principal.status && principal.status !== "active") {
      trace.push({ ok: false, text: `${principal.id} is disabled` });
      return { allowed: false, stage: "disabled", trace };
    }
    if (!(caps || []).includes(action)) {
      trace.push({ ok: false, text: `No permission set lets ${principal.id} "${action}" on ${resource.type}` });
      return { allowed: false, stage: "bound", trace };
    }
    trace.push({ ok: true, text: `Permissions include "${action}" on ${resource.type}` });
    const ofType = rules.filter(r => r.type === resource.type);
    const ceiling = ofType.find(r => r.set === "ceiling" && r.effect === "deny" && matches(r, principal, action, resource));
    if (ceiling) {
      trace.push({ ok: false, text: `Ceiling rule ${ceiling.id} denies` });
      return { allowed: false, stage: "ceiling", rule: ceiling, trace };
    }
    const business = ofType.filter(r => r.set !== "ceiling" && matches(r, principal, action, resource));
    const deny = business.find(r => r.effect === "deny");
    if (deny) {
      trace.push({ ok: false, text: `Rule ${deny.id} denies, and a deny always wins` });
      return { allowed: false, stage: "deny", rule: deny, trace };
    }
    const allow = business.find(r => r.effect === "allow");
    if (allow) {
      trace.push({ ok: true, text: `Rule ${allow.id} allows${allow.when ? ` (${allow.when})` : ""}` });
      trace.push({ ok: true, text: "No rule denies" });
      return { allowed: true, stage: "allow", rule: allow, trace };
    }
    trace.push({ ok: false, text: `No rule allows "${action}" for roles ${principal.roles.join(", ") || "(none)"}: denied by default` });
    return { allowed: false, stage: "default", trace };
  }

  return { parse, check, evaluate, decide, matches };
})();

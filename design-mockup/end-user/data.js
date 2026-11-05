// Made-up organisation for the end-user prototype. Nothing here comes
// from fga; the prototype never talks to fga.
(function () {
  "use strict";
  const TODAY = "2026-11-04";

  const TEAMS = {
    gt: { id: "gt", name: "Greenhouse team", lead: "rita" },
    ft: { id: "ft", name: "Field team", lead: "carl" },
    of: { id: "of", name: "Office", lead: "maya" },
  };

  // Rights, in the words the console shows.
  const RIGHTS = [
    ["signin", "Sign in"], ["open", "Open files"], ["upload", "Upload and edit"], ["share", "Share"],
    ["copies", "Take copies out"], ["delete", "Delete"], ["approve", "Approve requests"], ["ai", "Use AI tools"],
  ];
  const MEMBER = ["signin", "open", "upload", "share"];

  const PEOPLE = [
    { id: "alice", name: "Alice", team: "gt", rights: [...MEMBER, "copies"] },
    { id: "bob", name: "Bob", team: "gt", rights: [...MEMBER, "copies"] },
    { id: "lena", name: "Lena", team: "gt", rights: ["signin", "open"] },
    { id: "rita", name: "Rita", team: "gt", rights: [...MEMBER, "copies", "approve"] },
    { id: "carl", name: "Carl", team: "ft", rights: [...MEMBER, "approve"] },
    { id: "maya", name: "Maya", team: "of", rights: [...MEMBER, "approve"] },
    { id: "root", name: "Root", team: null, admin: true, rights: ["signin"] },
  ];
  const FIRST = ["Aino", "Ben", "Chloe", "Dario", "Elif", "Farid", "Greta", "Hugo", "Ines", "Jonas", "Kira", "Liam", "Mira", "Noah", "Olga", "Pavel",
    "Queenie", "Ravi", "Sara", "Tomas", "Ula", "Viktor", "Wen", "Ximena", "Yusuf", "Zoe"];
  const LAST = ["Berg", "Costa", "Dahl", "Ek", "Fischer", "Garcia", "Holm", "Ivanova", "Jensen", "Kim", "Lund", "Moreau"];
  let n = 0;
  for (const l of LAST) for (const f of FIRST) {
    n++;
    const team = n <= 20 ? "gt" : n <= 31 ? "ft" : "of";
    PEOPLE.push({ id: "p" + n, name: f + " " + l, team, rights: n % 9 === 0 ? ["signin", "open"] : [...MEMBER] });
  }

  const AGENTS = [
    { id: "agent-7", name: "agent-7", for: "lena", until: "2026-11-30",
      may: [["Read the latest greenhouse climate", "temperature only"], ["Look back at climate history", "last 24 hours"]],
      never: "Open your files, share anything, or send data outside" },
  ];

  // Places: spaces hold files, sources hold live readings split into parts.
  const PLACES = [
    { id: "tf", name: "Team files", kind: "space", team: "gt" },
    { id: "rep", name: "Reports", kind: "space", team: "gt", locked: true, keyFrom: "rita", keys: ["rita", "alice"] },
    { id: "cl", name: "Greenhouse climate", kind: "source", team: "gt", owner: "lena",
      parts: [{ name: "Temperature", conf: false, value: "21.4 °C" }, { name: "Humidity", conf: true, value: "68 %" }] },
    { id: "so", name: "Soil data", kind: "source", team: "gt", owner: "lena",
      parts: [{ name: "Soil moisture", conf: false, value: "31 %" }, { name: "Chemistry", conf: true, value: "pH 6.4" }] },
    { id: "ff", name: "Field files", kind: "space", team: "ft" },
    { id: "off", name: "Office files", kind: "space", team: "of" },
  ];

  const FILES = [
    { id: "f1", place: "tf", name: "q3-budget.xlsx", type: "sheet", label: "conf", owner: "rita", changed: "today" },
    { id: "f2", place: "tf", name: "planting-plan.pdf", type: "pdf", label: "team", owner: "rita", changed: "yesterday" },
    { id: "f3", place: "tf", name: "supplier-list.pdf", type: "pdf", label: "team", owner: "lena", changed: "2 Nov" },
    { id: "f4", place: "tf", name: "contract-draft.pdf", type: "pdf", label: "conf", owner: "lena", changed: "1 Nov" },
    { id: "f5", place: "tf", name: "greenhouse-photos.zip", type: "archive", label: "team", owner: "bob", changed: "30 Oct" },
    { id: "f6", place: "tf", name: "watering-schedule.docx", type: "doc", label: "team", owner: "alice", changed: "28 Oct" },
    { id: "f7", place: "rep", name: "october-report.pdf", type: "pdf", label: "team", owner: "rita", changed: "3 Nov" },
    { id: "f8", place: "rep", name: "september-report.pdf", type: "pdf", label: "team", owner: "rita", changed: "2 Oct" },
    { id: "f9", place: "ff", name: "route-plan.pdf", type: "pdf", label: "team", owner: "carl", changed: "today" },
    { id: "f10", place: "ff", name: "field-notes.docx", type: "doc", label: "team", owner: "carl", changed: "1 Nov" },
    { id: "f11", place: "off", name: "staff-handbook.pdf", type: "pdf", label: "team", owner: "maya", changed: "12 Oct" },
    { id: "f12", place: "off", name: "price-list.xlsx", type: "sheet", label: "team", owner: "maya", changed: "29 Oct" },
    { id: "f13", place: "off", name: "salaries-2026.xlsx", type: "sheet", label: "conf", owner: "maya", changed: "20 Oct" },
  ];

  const SHARES = [
    { id: "s1", file: "f1", from: "rita", to: "alice", can: "edit", until: "2026-12-12" },
    { id: "s2", file: "f1", from: "rita", to: "bob", can: "view", until: "2026-11-30" },
    { id: "s3", file: "f3", from: "lena", to: "rita", can: "view", until: "2026-12-01" },
    { id: "s4", file: "f10", from: "carl", to: "alice", can: "view", until: "2026-11-15" },
    { id: "s5", file: "f11", from: "maya", to: "alice", can: "view", until: "2026-12-31" },
    { id: "s6", file: "f12", from: "maya", to: "alice", can: "view", until: "2026-12-31" },
    { id: "s7", file: "f6", from: "alice", to: "carl", can: "view", until: "2026-11-20" },
  ];

  const REQUESTS = [
    { id: "r1", kind: "access", file: "f4", item: "contract-draft.pdf", from: "bob", owner: "lena", why: "Checking the delivery terms for October", len: "1 week", status: "waiting", at: "today 18:10" },
  ];
  const APPROVALS = [
    { id: "a1", file: "f4", from: "lena", lead: "rita", text: "lower contract-draft.pdf from Confidential to Team", status: "waiting", at: "today 17:02" },
  ];
  const CHANGES = [
    { id: "c1", text: "Let Rita see Chemistry in Soil data", by: "root", status: "waiting", at: "yesterday" },
  ];
  const ACTIVITY = [
    ["19:41", "agent-7 read the latest climate for Lena"],
    ["19:39", "Bob opened q3-budget.xlsx"],
    ["19:20", "agent-7 asked for humidity for Lena · refused"],
    ["18:10", "Bob asked the owner of contract-draft.pdf for access"],
    ["17:02", "Lena asked to lower contract-draft.pdf to Team"],
    ["16:45", "Alice uploaded watering-schedule.docx"],
    ["15:30", "Carl shared field-notes.docx with Alice until 15 Nov"],
    ["08:02", "agent-7 read the latest climate for Lena"],
  ];
  const RECENT = { alice: ["f6", "f1", "f7"], bob: ["f1", "f5", "f3"], lena: ["f3", "f4"], rita: ["f7", "f1", "f2"], carl: ["f9", "f10"], maya: ["f11", "f12"] };

  window.PROTO_DATA = { TODAY, TEAMS, RIGHTS, PEOPLE, AGENTS, PLACES, FILES, SHARES, REQUESTS, APPROVALS, CHANGES, ACTIVITY, RECENT };
})();

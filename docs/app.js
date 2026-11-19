// RASPRG presentations catalog. Filter state lives in the URL query string,
// so every view (topic, meeting, presenter, search) is a shareable link,
// e.g. ?topic=ai-llm&meeting=127
(function () {
  const $ = (id) => document.getElementById(id);
  const state = { q: "", meeting: "", presenter: "", topics: new Set(), chairs: false };
  let DATA, meetingsById, topicsById;

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const isTalk = (p) => p.kind === "talk" || p.kind === "panel";
  const realPresenters = (p) => p.presenters.filter((n) => n !== "RG Chairs" && n !== "Various" && n !== "TBD");

  function readUrl() {
    const u = new URLSearchParams(location.search);
    state.q = u.get("q") || "";
    state.meeting = u.get("meeting") || "";
    state.presenter = u.get("presenter") || "";
    state.topics = new Set((u.get("topic") || "").split(",").filter(Boolean));
    state.chairs = u.get("chairs") === "1";
  }
  function writeUrl() {
    const u = new URLSearchParams();
    if (state.q) u.set("q", state.q);
    if (state.meeting) u.set("meeting", state.meeting);
    if (state.presenter) u.set("presenter", state.presenter);
    if (state.topics.size) u.set("topic", [...state.topics].join(","));
    if (state.chairs) u.set("chairs", "1");
    const qs = u.toString();
    history.replaceState(null, "", qs ? "?" + qs : location.pathname);
  }

  function matches(p, ignore) {
    if (!state.chairs && !isTalk(p)) return false;
    if (ignore !== "meeting" && state.meeting && p.meeting !== state.meeting) return false;
    if (ignore !== "presenter" && state.presenter && !p.presenters.includes(state.presenter)) return false;
    if (ignore !== "topic" && state.topics.size && !(p.topics || []).some((t) => state.topics.has(t))) return false;
    if (state.q) {
      const m = meetingsById[p.meeting];
      const hay = [p.title, p.presenters.join(" "), p.affiliation || "", m.label,
        (p.topics || []).map((t) => topicsById[t].label).join(" ")].join(" ").toLowerCase();
      if (!state.q.toLowerCase().split(/\s+/).every((w) => hay.includes(w))) return false;
    }
    return true;
  }

  function buildControls() {
    const ms = $("meeting");
    [...DATA.meetings].reverse().forEach((m) => {
      const n = DATA.presentations.filter((p) => p.meeting === m.id && isTalk(p)).length;
      if (!n) return;
      ms.insertAdjacentHTML("beforeend", `<option value="${esc(m.id)}">${esc(m.label)} (${n})</option>`);
    });
    const names = new Map();
    DATA.presentations.filter(isTalk).forEach((p) => realPresenters(p).forEach((n) => names.set(n, (names.get(n) || 0) + 1)));
    [...names.keys()].sort((a, b) => a.localeCompare(b)).forEach((n) =>
      $("presenter").insertAdjacentHTML("beforeend", `<option value="${esc(n)}">${esc(n)} (${names.get(n)})</option>`));
  }

  function renderChips() {
    const base = DATA.presentations.filter((p) => matches(p, "topic"));
    $("topics").innerHTML = DATA.topics.map((t) => {
      const n = base.filter((p) => (p.topics || []).includes(t.id)).length;
      return `<button type="button" class="chip" data-topic="${esc(t.id)}" aria-pressed="${state.topics.has(t.id)}" title="${esc(t.description)}">${esc(t.label)}<span class="n">${n}</span></button>`;
    }).join("");
  }

  function card(p) {
    const who = p.presenters.map((n) => realPresenters(p).includes(n)
      ? `<button type="button" class="link" data-presenter="${esc(n)}">${esc(n)}</button>` : esc(n)).join(", ");
    const tags = (p.topics || []).map((t) => `<span class="tag">${esc(topicsById[t].label)}</span>`).join("");
    const kind = p.kind !== "talk" ? `<span class="tag kind">${esc(p.kind === "panel" ? "panel statement" : p.kind)}</span>` : "";
    const review = p.needs_review ? `<span class="tag kind">needs review</span>` : "";
    return `<article class="card">
      <h3>${esc(p.title)}</h3>
      <div class="who">${who}${p.affiliation ? " · " + esc(p.affiliation) : ""}</div>
      <div class="meta">${kind}${tags}${review}<a class="slides" href="${esc(p.slides)}" target="_blank" rel="noopener">Slides ↗</a></div>
    </article>`;
  }

  function render() {
    $("q").value = state.q;
    $("meeting").value = state.meeting;
    $("presenter").value = state.presenter;
    $("chairs").checked = state.chairs;
    renderChips();
    const rows = DATA.presentations.filter((p) => matches(p));
    $("count").textContent = `${rows.length} presentation${rows.length === 1 ? "" : "s"}`;
    if (!rows.length) { $("list").innerHTML = `<p class="empty">No presentations match these filters.</p>`; return; }
    const groups = [...DATA.meetings].reverse()
      .map((m) => ({ m, items: rows.filter((p) => p.meeting === m.id) }))
      .filter((g) => g.items.length);
    $("list").innerHTML = groups.map(({ m, items }) => `<section class="meeting">
      <h2>${esc(m.label)} <small>${esc(m.date)}${m.location ? " · " + esc(m.location) : ""}
        <a href="${esc(m.materials)}" target="_blank" rel="noopener">Materials</a>
        ${m.recording ? `<a href="${esc(m.recording)}" target="_blank" rel="noopener">Recording</a>` : ""}</small></h2>
      ${items.map(card).join("")}</section>`).join("");
  }

  function update() { writeUrl(); render(); }

  function bind() {
    $("q").addEventListener("input", (e) => { state.q = e.target.value.trim(); update(); });
    $("meeting").addEventListener("change", (e) => { state.meeting = e.target.value; update(); });
    $("presenter").addEventListener("change", (e) => { state.presenter = e.target.value; update(); });
    $("chairs").addEventListener("change", (e) => { state.chairs = e.target.checked; update(); });
    $("reset").addEventListener("click", () => { Object.assign(state, { q: "", meeting: "", presenter: "", topics: new Set(), chairs: false }); update(); });
    $("topics").addEventListener("click", (e) => {
      const b = e.target.closest("[data-topic]"); if (!b) return;
      const t = b.dataset.topic; state.topics.has(t) ? state.topics.delete(t) : state.topics.add(t); update();
    });
    $("list").addEventListener("click", (e) => {
      const b = e.target.closest("[data-presenter]"); if (!b) return;
      state.presenter = b.dataset.presenter; update(); window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  fetch("data.json").then((r) => r.json()).then((d) => {
    DATA = d;
    meetingsById = Object.fromEntries(d.meetings.map((m) => [m.id, m]));
    topicsById = Object.fromEntries(d.topics.map((t) => [t.id, t]));
    readUrl(); buildControls(); bind(); render();
  }).catch(() => { $("list").innerHTML = `<p class="empty">Could not load data.json.</p>`; });
})();

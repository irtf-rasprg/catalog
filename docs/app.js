// RASPRG presentations catalog. Filter and view state lives in the URL query
// string, so every view is a shareable link, e.g. ?topic=ai-llm&meeting=127&abs=1
(function () {
  const $ = (id) => document.getElementById(id);
  const blank = () => ({ q: "", meeting: "", presenter: "", rtype: "", topics: new Set(), chairs: false, allAbs: false, allRes: false });
  let state = blank();
  // Per-card overrides of the global "show all" switches: id -> true/false.
  const openAbs = new Map(), openRes = new Map();
  let DATA, meetingsById, topicsById;

  const RTYPES = {
    tool: ["Tool", "bi-tools"], code: ["Code", "bi-code-slash"], paper: ["Paper", "bi-file-earmark-text"],
    draft: ["Draft", "bi-file-earmark-ruled"], report: ["Report", "bi-journal-text"], data: ["Data", "bi-database"],
    artifact: ["Artifact", "bi-patch-check"], slides: ["Slides", "bi-easel"], website: ["Website", "bi-globe"],
    reference: ["Reference", "bi-bookmark"],
  };

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const isTalk = (p) => p.kind === "talk" || p.kind === "panel";
  const realPresenters = (p) => p.presenters.filter((n) => n !== "RG Chairs" && n !== "Various" && n !== "TBD");
  const ext = 'target="_blank" rel="noopener"';

  function readUrl() {
    const u = new URLSearchParams(location.search);
    state.q = u.get("q") || "";
    state.meeting = u.get("meeting") || "";
    state.presenter = u.get("presenter") || "";
    state.rtype = u.get("rtype") || "";
    state.topics = new Set((u.get("topic") || "").split(",").filter(Boolean));
    state.chairs = u.get("chairs") === "1";
    state.allAbs = u.get("abs") === "1";
    state.allRes = u.get("res") === "1";
  }
  function writeUrl() {
    const u = new URLSearchParams();
    if (state.q) u.set("q", state.q);
    if (state.meeting) u.set("meeting", state.meeting);
    if (state.presenter) u.set("presenter", state.presenter);
    if (state.rtype) u.set("rtype", state.rtype);
    if (state.topics.size) u.set("topic", [...state.topics].join(","));
    if (state.chairs) u.set("chairs", "1");
    if (state.allAbs) u.set("abs", "1");
    if (state.allRes) u.set("res", "1");
    const qs = u.toString();
    history.replaceState(null, "", qs ? "?" + qs : location.pathname);
  }

  function matches(p, ignore) {
    if (!state.chairs && !isTalk(p)) return false;
    if (ignore !== "meeting" && state.meeting && p.meeting !== state.meeting) return false;
    if (ignore !== "presenter" && state.presenter && !p.presenters.includes(state.presenter)) return false;
    if (ignore !== "rtype" && state.rtype && !(p.resources || []).some((r) => r.type === state.rtype)) return false;
    if (ignore !== "topic" && state.topics.size && !(p.topics || []).some((t) => state.topics.has(t))) return false;
    if (state.q) {
      const m = meetingsById[p.meeting];
      const hay = [p.title, p.presenters.join(" "), p.affiliation || "", m.label, p.abstract || "",
        (p.resources || []).map((r) => r.title).join(" "),
        (p.topics || []).map((t) => topicsById[t].label).join(" ")].join(" ").toLowerCase();
      if (!state.q.toLowerCase().split(/\s+/).every((w) => hay.includes(w))) return false;
    }
    return true;
  }

  function buildControls() {
    const ms = $("meeting");
    [...DATA.meetings].reverse().forEach((m) => {
      const n = DATA.presentations.filter((p) => p.meeting === m.id && isTalk(p)).length;
      if (n) ms.insertAdjacentHTML("beforeend", `<option value="${esc(m.id)}">${esc(m.label)} (${n})</option>`);
    });
    const names = new Map();
    DATA.presentations.filter(isTalk).forEach((p) => realPresenters(p).forEach((n) => names.set(n, (names.get(n) || 0) + 1)));
    [...names.keys()].sort((a, b) => a.localeCompare(b)).forEach((n) =>
      $("presenter").insertAdjacentHTML("beforeend", `<option value="${esc(n)}">${esc(n)} (${names.get(n)})</option>`));
    Object.entries(RTYPES).forEach(([k, [label]]) => {
      const n = DATA.presentations.filter((p) => isTalk(p) && (p.resources || []).some((r) => r.type === k)).length;
      if (n) $("rtype").insertAdjacentHTML("beforeend", `<option value="${k}">${label} (${n})</option>`);
    });
  }

  function renderChips() {
    const base = DATA.presentations.filter((p) => matches(p, "topic"));
    $("topics").innerHTML = DATA.topics.map((t) => {
      const n = base.filter((p) => (p.topics || []).includes(t.id)).length;
      const on = state.topics.has(t.id);
      return `<button type="button" class="btn btn-sm topic-btn ${on ? "btn-primary" : "btn-outline-primary"}" data-topic="${esc(t.id)}" aria-pressed="${on}" title="${esc(t.description)}">${esc(t.label)} <span class="badge ${on ? "text-bg-light" : "text-bg-secondary"} ms-1">${n}</span></button>`;
    }).join("");
  }

  const isOpen = (map, id, all) => (map.has(id) ? map.get(id) : all);

  function abstractPanel(p) {
    const m = meetingsById[p.meeting];
    if (!p.abstract) {
      return `<div class="panel abstract small fst-italic text-body-secondary">No abstract was published in the
        ${m.agenda ? `<a href="${esc(m.agenda)}" ${ext}>${esc(m.label)} agenda</a>` : `${esc(m.label)} agenda`}.</div>`;
    }
    const paras = p.abstract.split(/\n\s*\n/).map((t) => `<p class="mb-2">${esc(t.replace(/\s*\n\s*/g, " "))}</p>`).join("");
    return `<div class="panel abstract">${paras}
      <div class="src text-body-secondary mt-1">Quoted from the ${m.agenda ? `<a href="${esc(m.agenda)}" ${ext}>${esc(m.label)} session agenda</a>` : esc(m.label + " session agenda")}.</div></div>`;
  }

  function resourcesPanel(p) {
    const items = (p.resources || []).map((r) => {
      const [label, icon] = RTYPES[r.type] || [r.type, "bi-link-45deg"];
      return `<li><span class="badge text-bg-secondary rtype me-2"><i class="bi ${icon} me-1" aria-hidden="true"></i>${esc(label)}</span><a href="${esc(r.url)}" ${ext}>${esc(r.title)}</a> <span class="text-body-tertiary small">from ${esc(r.source)}</span></li>`;
    }).join("");
    return `<div class="panel resources"><ul>${items}</ul></div>`;
  }

  function card(p) {
    const who = p.presenters.map((n) => realPresenters(p).includes(n)
      ? `<button type="button" class="btn btn-link" data-presenter="${esc(n)}">${esc(n)}</button>` : esc(n)).join(", ");
    const tags = (p.topics || []).map((t) => `<span class="badge rounded-pill bg-body-secondary text-body border">${esc(topicsById[t].label)}</span>`).join(" ");
    const kind = p.kind !== "talk" ? `<span class="badge text-bg-info">${esc(p.kind === "panel" ? "panel statement" : p.kind)}</span>` : "";
    const review = p.needs_review ? `<span class="badge text-bg-warning">needs review</span>` : "";
    const nres = (p.resources || []).length;
    const aOpen = isOpen(openAbs, p.id, state.allAbs);
    const rOpen = nres > 0 && isOpen(openRes, p.id, state.allRes);
    const absBtn = isTalk(p) ? `<button type="button" class="btn ${p.abstract ? "btn-outline-primary" : "btn-outline-secondary missing"}${aOpen ? " active" : ""}" data-toggle="abs" data-id="${esc(p.id)}" aria-expanded="${aOpen}"
        title="${p.abstract ? "Show the abstract from the session agenda" : "The session agenda has no abstract for this talk"}"><i class="bi bi-text-paragraph me-1" aria-hidden="true"></i>${p.abstract ? "Abstract" : "No abstract"}</button>` : "";
    const resBtn = nres ? `<button type="button" class="btn btn-outline-success${rOpen ? " active" : ""}" data-toggle="res" data-id="${esc(p.id)}" aria-expanded="${rOpen}"
        title="Tools, papers and other links from the agenda and slides"><i class="bi bi-link-45deg me-1" aria-hidden="true"></i>Resources <span class="badge ${rOpen ? "text-bg-light" : "text-bg-success"} ms-1">${nres}</span></button>`
      : (isTalk(p) ? `<button type="button" class="btn btn-outline-secondary missing" disabled title="No links found in the agenda or slides"><i class="bi bi-link-45deg me-1" aria-hidden="true"></i>No resources</button>` : "");
    return `<li class="list-group-item talk">
      <div class="d-flex flex-wrap gap-2 align-items-start">
        <div class="flex-grow-1" style="min-width: 14rem">
          <div class="talk-title">${esc(p.title)}</div>
          <div class="who small text-body-secondary">${who}${p.affiliation ? " · " + esc(p.affiliation) : ""}</div>
          <div class="mt-1 d-flex flex-wrap gap-1">${kind}${tags}${review}</div>
        </div>
        <div class="actions d-flex flex-wrap gap-1">
          ${absBtn}${resBtn}
          <a class="btn btn-primary" href="${esc(p.slides)}" ${ext}><i class="bi bi-file-earmark-slides me-1" aria-hidden="true"></i>Slides</a>
        </div>
      </div>
      ${aOpen && isTalk(p) ? abstractPanel(p) : ""}
      ${rOpen ? resourcesPanel(p) : ""}
    </li>`;
  }

  function render() {
    $("q").value = state.q;
    $("meeting").value = state.meeting;
    $("presenter").value = state.presenter;
    $("rtype").value = state.rtype;
    $("chairs").checked = state.chairs;
    $("allAbs").checked = state.allAbs;
    $("allRes").checked = state.allRes;
    renderChips();
    const rows = DATA.presentations.filter((p) => matches(p));
    const nAbs = rows.filter((p) => p.abstract).length;
    $("count").textContent = `${rows.length} presentation${rows.length === 1 ? "" : "s"} · ${nAbs} with abstracts`;
    if (!rows.length) { $("list").innerHTML = `<div class="alert alert-info">No presentations match these filters.</div>`; return; }
    const groups = [...DATA.meetings].reverse()
      .map((m) => ({ m, items: rows.filter((p) => p.meeting === m.id) }))
      .filter((g) => g.items.length);
    $("list").innerHTML = groups.map(({ m, items }) => `<section class="card mb-3">
      <div class="card-header d-flex flex-wrap align-items-baseline gap-2">
        <h2 class="meeting-head mb-0 me-2">${esc(m.label)}</h2>
        <small class="text-body-secondary">${esc(m.date)}${m.location ? " · " + esc(m.location) : ""}</small>
        <small class="ms-auto d-flex gap-3">
          ${m.agenda ? `<a href="${esc(m.agenda)}" ${ext}><i class="bi bi-list-ul me-1" aria-hidden="true"></i>Agenda</a>` : ""}
          <a href="${esc(m.materials)}" ${ext}><i class="bi bi-folder2-open me-1" aria-hidden="true"></i>Materials</a>
          ${m.recording ? `<a href="${esc(m.recording)}" ${ext}><i class="bi bi-camera-video me-1" aria-hidden="true"></i>Recording</a>` : ""}
        </small>
      </div>
      <ul class="list-group list-group-flush">${items.map(card).join("")}</ul></section>`).join("");
  }

  function update() { writeUrl(); render(); }

  function bind() {
    $("q").addEventListener("input", (e) => { state.q = e.target.value.trim(); update(); });
    $("meeting").addEventListener("change", (e) => { state.meeting = e.target.value; update(); });
    $("presenter").addEventListener("change", (e) => { state.presenter = e.target.value; update(); });
    $("rtype").addEventListener("change", (e) => { state.rtype = e.target.value; update(); });
    $("chairs").addEventListener("change", (e) => { state.chairs = e.target.checked; update(); });
    $("allAbs").addEventListener("change", (e) => { state.allAbs = e.target.checked; openAbs.clear(); update(); });
    $("allRes").addEventListener("change", (e) => { state.allRes = e.target.checked; openRes.clear(); update(); });
    $("reset").addEventListener("click", () => { state = blank(); openAbs.clear(); openRes.clear(); update(); });
    $("topics").addEventListener("click", (e) => {
      const b = e.target.closest("[data-topic]"); if (!b) return;
      const t = b.dataset.topic; state.topics.has(t) ? state.topics.delete(t) : state.topics.add(t); update();
    });
    $("list").addEventListener("click", (e) => {
      const tg = e.target.closest("[data-toggle]");
      if (tg) {
        const id = tg.dataset.id;
        const [map, all] = tg.dataset.toggle === "abs" ? [openAbs, state.allAbs] : [openRes, state.allRes];
        map.set(id, !isOpen(map, id, all));
        render();
        const again = document.querySelector(`[data-toggle="${tg.dataset.toggle}"][data-id="${CSS.escape(id)}"]`);
        if (again) again.focus();
        return;
      }
      const b = e.target.closest("[data-presenter]"); if (!b) return;
      state.presenter = b.dataset.presenter; update(); window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  fetch("data.json", { cache: "no-cache" }).then((r) => r.json()).then((d) => {
    DATA = d;
    meetingsById = Object.fromEntries(d.meetings.map((m) => [m.id, m]));
    topicsById = Object.fromEntries(d.topics.map((t) => [t.id, t]));
    readUrl(); buildControls(); bind(); render();
  }).catch(() => { $("list").innerHTML = `<div class="alert alert-danger">Could not load data.json.</div>`; });
})();

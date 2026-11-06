/* ---------- constants & helpers ---------- */
const CAT = {
  accident: { label: "Accident", icon: "💥", color: "#c92a2a" },
  congestion: { label: "Congestion", icon: "🚗", color: "#e8590c" },
  waterlogging: { label: "Waterlogging", icon: "🌊", color: "#1971c2" },
  road_damage: { label: "Road damage", icon: "🕳️", color: "#7048e8" },
  public_transport: { label: "Public transport", icon: "🚌", color: "#0b7285" },
  road_closure: { label: "Road closure", icon: "🚧", color: "#e0a800" },
};
const SEV_COLOR = { Low: "#34d399", Medium: "#fbbf24", High: "#fb923c", Critical: "#f87171" };
const STATUS = { unverified: "Unverified", verified: "Verified by official", resolved: "Resolved", rejected: "Rejected" };
const SAMPLES = [
  "Heavy waterlogging near Velachery railway station. Vehicles are moving very slowly.",
  "Accident near Kathipara flyover at 8:30 AM. Two vehicles collided and the road is blocked.",
  "A huge pothole near Anna Nagar is causing problems for two-wheelers.",
  "Bus 29C is delayed by 40 minutes at Adyar. Very frustrated!!",
  "OMR Sholinganallur la romba traffic, vandi nikkudhu. Worst jam ever!",
  "I love travelling by bus.",
];

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const debounce = (fn, ms = 350) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const fmtTime = s => (s ? s.replace("T", " ").slice(0, 16) : "—");
const sevBadge = (label, score) => `<span class="sev" style="background:${SEV_COLOR[label] || "#868e96"}">${esc(label)}${score != null ? " · " + score : ""}</span>`;
const catName = c => (CAT[c] ? `${CAT[c].icon} ${CAT[c].label}` : "—");
if (window.Chart) {
  Chart.defaults.color = "#9aa6c8";
  Chart.defaults.borderColor = "rgba(255,255,255,.07)";
  Chart.defaults.font.family = "'Inter', sans-serif";
  Chart.defaults.elements.arc.borderColor = "#0d1226";
}
let pin = sessionStorage.getItem("cmi_pin") || "";
let map, markerLayer, heatLayer, heatVisible = false, markerRefs = {}, charts = [], currentTab = "dashboard", busy = false;

/* ---------- API ---------- */
async function api(path, opts = {}) {
  const headers = { "Content-Type": "application/json" };
  if (pin) headers["X-Official-Pin"] = pin;
  const res = await fetch("/api" + path, { ...opts, headers: { ...headers, ...(opts.headers || {}) } });
  let data = null;
  try { data = await res.json(); } catch (e) { /* no body */ }
  if (!res.ok) throw new Error((data && data.error) || `Request failed (${res.status})`);
  return data;
}

function toast(msg, type = "") {
  const el = document.createElement("div");
  el.className = "toast " + type;
  el.textContent = msg;
  $("#toasts").appendChild(el);
  setTimeout(() => el.remove(), 3800);
}

/* ---------- modal ---------- */
function openModal(html) { $("#modalBody").innerHTML = html; $("#modal").hidden = false; }
function closeModal() { $("#modal").hidden = true; $("#modalBody").innerHTML = ""; }
$("#modalClose").onclick = closeModal;
$("#modal").addEventListener("click", e => { if (e.target.id === "modal") closeModal(); });
document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });

/* ---------- tabs ---------- */
function showTab(name) {
  currentTab = name;
  $$(".tab").forEach(b => b.classList.toggle("active", b.dataset.tab === name));
  $$(".panel").forEach(p => p.classList.toggle("active", p.id === "tab-" + name));
  $("#filters").hidden = !["dashboard", "incidents"].includes(name);
  if (name === "dashboard" && map) setTimeout(() => map.invalidateSize(), 60);
    window.scrollTo({ top: 0, behavior: "smooth" });
  document.dispatchEvent(new CustomEvent("tabchange", { detail: name }));
}
$$(".tab").forEach(b => (b.onclick = () => showTab(b.dataset.tab)));

/* ---------- official login ---------- */
function updateRole() {
  const on = !!pin && document.body.dataset.verified === "1";
  document.body.classList.toggle("official", on);
  $("#roleBadge").textContent = on ? "Official view" : "Citizen view";
  $("#loginBtn").textContent = on ? "Logout" : "🔐 Official login";
}
async function verifyPin() {
  if (!pin) { document.body.dataset.verified = "0"; return updateRole(); }
  try { await api("/login", { method: "POST", body: JSON.stringify({ pin }) }); document.body.dataset.verified = "1"; }
  catch (e) { pin = ""; sessionStorage.removeItem("cmi_pin"); document.body.dataset.verified = "0"; }
  updateRole();
}
$("#loginBtn").onclick = () => {
  if (document.body.classList.contains("official")) {
    pin = ""; sessionStorage.removeItem("cmi_pin"); document.body.dataset.verified = "0"; updateRole(); toast("Logged out");
    return;
  }
  openModal(`<h2>🔐 Official login</h2><p class="hint">Municipal / traffic-department staff can verify, resolve or reject incidents. Demo PIN: 1234</p>
    <input type="password" id="pinInput" placeholder="Enter PIN" autofocus>
    <button class="btn primary" id="pinGo">Login</button>`);
  const go = async () => {
    const p = $("#pinInput").value.trim();
    try {
      await api("/login", { method: "POST", body: JSON.stringify({ pin: p }) });
      pin = p; sessionStorage.setItem("cmi_pin", p); document.body.dataset.verified = "1";
      updateRole(); closeModal(); toast("Welcome, official user", "success");
    } catch (e) { toast(e.message, "error"); }
  };
  $("#pinGo").onclick = go;
  $("#pinInput").addEventListener("keydown", e => { if (e.key === "Enter") go(); });
};

/* ---------- filters ---------- */
function filterParams() {
  const m = { q: "#fSearch", category: "#fCategory", severity: "#fSeverity", status: "#fStatus", date_from: "#fFrom", date_to: "#fTo" };
  const p = new URLSearchParams();
  for (const [k, sel] of Object.entries(m)) { const v = $(sel).value.trim(); if (v) p.set(k, v); }
  return p.toString();
}
Object.entries(CAT).forEach(([k, v]) => $("#fCategory").insertAdjacentHTML("beforeend", `<option value="${k}">${v.icon} ${v.label}</option>`));
const reload = debounce(() => loadAll());
["#fSearch"].forEach(s => $(s).addEventListener("input", reload));
["#fCategory", "#fSeverity", "#fStatus", "#fFrom", "#fTo"].forEach(s => $(s).addEventListener("change", () => loadAll()));
$("#fReset").onclick = () => { $$("#filters input, #filters select").forEach(el => (el.value = "")); loadAll(); };
$("#fRefresh").onclick = () => loadAll(true);

/* ---------- map ---------- */
function initMap() {
  map = L.map("map").setView([13.0827, 80.2707], 11);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19, attribution: "© OpenStreetMap contributors",
  }).addTo(map);
  markerLayer = L.layerGroup().addTo(map);
  heatLayer = L.layerGroup().addTo(map);
  const heatBtn = $("#heatToggle");
  if (heatBtn) heatBtn.onclick = () => { heatVisible = !heatVisible; if (heatVisible) heatLayer.addTo(map); else map.removeLayer(heatLayer); heatBtn.textContent = heatVisible ? "🔥 Hide density layer" : "🔥 Show density layer"; heatBtn.setAttribute("aria-pressed", String(heatVisible)); };
  map.on("popupopen", e => {
    const btn = e.popup.getElement().querySelector("[data-open]");
    if (btn) btn.onclick = () => openIncident(+btn.dataset.open);
  });
}
function popupHtml(i) {
  return `<div style="min-width:200px"><b>${catName(i.category)}</b><br>${esc(i.location_text || "Unknown location")}<br>
    ${sevBadge(i.severity_label, i.severity_score)} <span class="pill ${i.status}">${STATUS[i.status]}</span><br>
    <small>${i.report_count} report(s) · confidence ${Math.round(i.confidence * 100)}%</small><br>
    <button class="btn small" data-open="${i.id}" style="margin-top:6px">View details</button></div>`;
}
function renderMap(list) {
  markerLayer.clearLayers(); heatLayer.clearLayers(); markerRefs = {};
  const pts = [];
  list.filter(i => i.lat != null && i.lng != null).forEach(i => {
    const faded = i.status === "resolved";
    // Density rings are a visual aggregation of reported incidents, not live sensor data.
    L.circle([i.lat, i.lng], { radius: 180 + Math.min(i.report_count || 1, 12) * 85, color: "#a855f7", weight: 1, opacity: 0.22, fillColor: "#8b5cf6", fillOpacity: 0.10 }).addTo(heatLayer);
    const m = L.circleMarker([i.lat, i.lng], {
      radius: 9 + Math.min(i.report_count, 8) * 1.6, color: "#fff", weight: 2,
      fillColor: faded ? "#868e96" : SEV_COLOR[i.severity_label] || "#555", fillOpacity: faded ? 0.45 : 0.85,
    }).bindPopup(popupHtml(i));
    markerLayer.addLayer(m); markerRefs[i.id] = m; pts.push([i.lat, i.lng]);
  });
  if (pts.length) map.fitBounds(pts, { padding: [40, 40], maxZoom: 13 });
  else map.setView([13.0827, 80.2707], 11);
}
function focusIncident(id) {
  const i = state.incidents.find(x => x.id === id);
  if (i && i.lat != null && markerRefs[id]) {
    map.setView([i.lat, i.lng], 14); markerRefs[id].openPopup();
    $("#map").scrollIntoView({ behavior: "smooth", block: "center" });
  } else openIncident(id);
}

/* ---------- rendering ---------- */
const state = { incidents: [] };

function renderKPIs(s) {
  const set = (sel, v) => { const el = $(sel); if (!el) return; window.FX ? FX.countTo(el, v) : (el.textContent = v); };
  set("#kReports", s.total_reports); set("#kIncidents", s.incidents);
  set("#kHigh", s.high_critical); set("#kVerified", s.verified);
  set("#kReview", s.needs_review); set("#kFiltered", s.filtered_out); set("#kDuplicates", s.duplicate_reports || 0);
  set("#hReports", s.total_reports); set("#hIncidents", s.incidents); set("#hHigh", s.high_critical);
  $("#emptyBanner").hidden = s.total_reports > 0;
}
function incidentItem(i, withMapFocus) {
  return `<div class="item" data-id="${i.id}" data-focus="${withMapFocus ? 1 : 0}">
    <div class="row between" style="margin:0"><b>${catName(i.category)}</b>${sevBadge(i.severity_label, i.severity_score)}</div>
    <div class="t">📍 ${esc(i.location_text || "Unknown location – needs review")}</div>
    <div class="meta"><span class="pill ${i.status}">${STATUS[i.status]}</span><span>${i.report_count} unique report(s)</span><span>Impact ${i.mobility_impact_score ?? "—"}/100</span><span>${fmtTime(i.last_seen)}</span></div></div>`;
}
function renderPriority(list) {
  const top = list.filter(i => !["resolved", "rejected"].includes(i.status)).slice(0, 8);
  $("#priorityList").innerHTML = top.length ? top.map(i => incidentItem(i, true)).join("") : `<p class="hint">No active incidents match the filters.</p>`;
}
function renderRecent(reports) {
  $("#recentList").innerHTML = reports.length ? reports.map(r => `
    <div class="item static"><div class="t">${esc(r.text)}</div>
    <div class="meta">${r.relevant ? `<span>${catName(r.category)}</span>${sevBadge(r.severity_label, null)}` : `<span class="pill">Filtered – not transport</span>`}
    <span>📍 ${esc(r.location_text || "unknown")}</span><span>${esc(r.source)}</span><span>${esc(r.language)}</span><span>${r.sentiment}</span>
    ${r.is_copy ? `<span class="pill unverified">copy of earlier post</span>` : ""}</div></div>`).join("")
    : `<p class="hint">No reports yet.</p>`;
}
function renderIncidentList(list) {
  $("#incCount").textContent = `Incidents (${list.length})`;
  $("#incidentList").innerHTML = list.length ? list.map(i => `
    <div class="inc-card" data-id="${i.id}" data-focus="0" style="border-top-color:${(CAT[i.category] || {}).color || "#1d4ed8"}">
      <div class="row between" style="margin:0"><b>${catName(i.category)}</b>${sevBadge(i.severity_label, i.severity_score)}</div>
      <div class="t">📍 ${esc(i.location_text || "Unknown location – needs review")}</div>
      <div class="t quote">“${esc(i.sample_text || "")}”</div>
      <div class="meta"><span class="pill ${i.status}">${STATUS[i.status]}</span><span>${i.report_count} unique report(s)</span>
      <span>Confidence ${Math.round(i.confidence * 100)}%</span><span>Impact ${i.mobility_impact_score ?? "—"}/100</span><span>${fmtTime(i.last_seen)}</span></div></div>`).join("")
    : `<p class="hint">No incidents match the filters.</p>`;
}
document.addEventListener("click", e => {
  const el = e.target.closest("[data-id]");
  if (!el || !el.closest("#priorityList, #incidentList")) return;
  const id = +el.dataset.id;
  el.dataset.focus === "1" ? focusIncident(id) : openIncident(id);
});

function renderCharts(s) {
  charts.forEach(c => c.destroy()); charts = [];
  const base = { responsive: true, maintainAspectRatio: false };
  charts.push(new Chart($("#chCategory"), {
    type: "doughnut",
    data: { labels: s.by_category.map(c => CAT[c.category].label), datasets: [{ data: s.by_category.map(c => c.incidents), backgroundColor: s.by_category.map(c => CAT[c.category].color) }] },
    options: { ...base, plugins: { legend: { position: "bottom" } } },
  }));
  charts.push(new Chart($("#chTrend"), {
    type: "line",
    data: { labels: s.trend.map(t => t.date.slice(5)), datasets: [{ label: "Reports", data: s.trend.map(t => t.count), borderColor: "#22d3ee", backgroundColor: "rgba(34,211,238,.15)", fill: true, tension: .3 }] },
    options: { ...base, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } },
  }));
  charts.push(new Chart($("#chAreas"), {
    type: "bar",
    data: { labels: s.top_areas.map(a => a.area), datasets: [{ label: "Reports", data: s.top_areas.map(a => a.count), backgroundColor: "#8b5cf6", borderRadius: 6 }] },
    options: { ...base, indexAxis: "y", plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { precision: 0 } } } },
  }));
}

async function loadAll(showToast = false) {
  if (busy) return;
  busy = true;
  try {
    const qs = filterParams();
    const [stats, incidents, reports] = await Promise.all([api("/stats?" + qs), api("/incidents?" + qs), api("/reports?limit=8")]);
    state.incidents = incidents;
    renderKPIs(stats); renderMap(incidents); renderPriority(incidents);
    renderCharts(stats); renderRecent(reports); renderIncidentList(incidents);
    if (showToast) toast("Dashboard refreshed", "success");
    document.dispatchEvent(new CustomEvent("dataloaded"));
  } catch (e) { toast(e.message, "error"); }
  busy = false;
}

/* ---------- incident details modal ---------- */
async function openIncident(id) {
  try {
    const inc = await api("/incidents/" + id);
    const official = document.body.classList.contains("official");
    const top = inc.reports.slice().sort((a, b) => b.severity_score - a.severity_score)[0];
    openModal(`
      <h2>${catName(inc.category)} <small style="font-weight:400">#${inc.id}</small></h2>
      <div class="meta" style="margin-bottom:8px">${sevBadge(inc.severity_label, inc.severity_score)}
        <span class="pill ${inc.status}">${STATUS[inc.status]}</span></div>
      <div class="kv">
        <b>Location</b><span>${inc.location_text ? "📍 " + esc(inc.location_text) : `<span class="warn">Unknown – needs manual review</span>`}</span>
        <b>First / last report</b><span>${fmtTime(inc.first_seen)} → ${fmtTime(inc.last_seen)}</span>
        <b>Unique reports</b><span>${inc.report_count} (exact duplicate copies excluded)</span>
        <b>Mobility impact score</b><span><strong>${inc.mobility_impact_score}/100</strong> <small class="hint">Heuristic triage estimate, not a measured passenger count.</small></span>
        <b>Emergency access screening</b><span>${inc.emergency_access_flag ? `<span class="warn">⚠ Potential access concern — manual review required</span>` : "No high-priority access flag from current rules"}</span>
        <b>Crowd confirmations</b><span id="crowdCount">${inc.crowd_confirmations || 0} citizen confirmation(s)</span>
        <b>Confidence</b><span><span class="bar"><i style="width:${Math.round(inc.confidence * 100)}%"></i></span> ${Math.round(inc.confidence * 100)}%</span>
        <b>Public mood</b><span>${inc.avg_sentiment < -0.2 ? "😠 Negative" : inc.avg_sentiment > 0.2 ? "🙂 Positive" : "😐 Neutral"}</span>
        <b>Why this severity</b><span>${esc(top ? top.severity_reason : "")}<br><small class="hint">Estimate only, not a confirmed emergency assessment.</small></span>
      </div>
      ${inc.lat != null ? `<button class="btn small" id="locBtn">🗺 Show on map</button>` : ""}
      <button class="btn small" id="confirmIncident">👍 I can confirm this issue</button>
      <button class="btn small" id="translateIncident">🌐 Translate reports to English</button>
      <div id="translationOutput"></div>
      <h3 style="margin-top:14px">Incident timeline</h3>
      <div class="reports">${(inc.events || []).map(ev => `<div class="rep"><b>${esc(ev.event_type === "status" ? "Status update" : "Incident created")}</b><div>${esc(ev.details)}</div><small>${fmtTime(ev.created_at)}</small></div>`).join("") || `<p class="hint">Timeline events will appear as officials update this incident.</p>`}</div>
      <h3 style="margin-top:14px">Reports in this group</h3>
      <div class="reports">${inc.reports.map(r => `<div class="rep">${esc(r.text)}
        <div class="meta">${esc(r.source)} · ${esc(r.language)} · ${r.sentiment} · ${fmtTime(r.incident_time)}${r.duration_min ? " · " + r.duration_min + " min" : ""}
        ${r.affected ? " · affects " + esc(r.affected) : ""}${r.is_copy ? ` · <b class="warn">copy of an earlier post</b>` : ""}</div></div>`).join("")}</div>
      ${official ? `
        <h3>Official actions</h3>
        <div class="actions">
          <button class="btn ok" data-st="verified">✔ Verify</button>
          <button class="btn" data-st="resolved">✅ Mark resolved</button>
          <button class="btn danger" data-st="rejected">✖ Reject as false</button>
          <button class="btn" data-st="unverified">↩ Reopen / unverify</button>
        </div>
        <textarea id="noteBox" rows="3" placeholder="Internal note (e.g. inspection team sent, ETA…)">${esc(inc.notes)}</textarea>
        <button class="btn primary small" id="saveNote">Save note</button>`
        : `<div class="notice">${inc.notes ? "<b>Official note:</b> " + esc(inc.notes) : "Awaiting official verification. Officials can log in to verify or resolve this incident."}</div>`}
    `);
    const lb = $("#locBtn");
    if (lb) lb.onclick = () => { closeModal(); showTab("dashboard"); setTimeout(() => focusIncident(inc.id), 150); };
    const confirmBtn = $("#confirmIncident");
    if (confirmBtn) confirmBtn.onclick = async () => {
      let key = localStorage.getItem("madrithm_voter_key");
      if (!key) { key = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}-${Math.random()}`); localStorage.setItem("madrithm_voter_key", key); }
      try { const result = await api(`/incidents/${id}/confirm`, { method: "POST", body: JSON.stringify({ voter_key: key }) });
        $("#crowdCount").textContent = `${result.confirmations} citizen confirmation(s)`;
        toast(result.already_confirmed ? "You have already confirmed this incident." : "Thanks. Your confirmation was recorded.", "success");
      } catch (e) { toast(e.message, "error"); }
    };
    const translateBtn = $("#translateIncident");
    if (translateBtn) translateBtn.onclick = async () => {
      const target = "English";
      const report = inc.reports.find(r => r.language && r.language !== "English") || inc.reports[0];
      if (!report) return;
      translateBtn.disabled = true; translateBtn.textContent = "Translating…";
      try { const result = await api("/translate", { method: "POST", body: JSON.stringify({ text: report.text, target }) });
        $("#translationOutput").innerHTML = `<div class="notice"><b>English translation (Gemini)</b><p>${esc(result.translation)}</p><small>Original report remains unchanged.</small></div>`;
      } catch (e) { $("#translationOutput").innerHTML = `<p class="hint">${esc(e.message)}</p>`; }
      translateBtn.disabled = false; translateBtn.textContent = "🌐 Translate reports to English";
    };
    $$("[data-st]", $("#modalBody")).forEach(b => (b.onclick = async () => {
      try { await api("/incidents/" + id, { method: "PATCH", body: JSON.stringify({ status: b.dataset.st }) }); toast("Status updated: " + STATUS[b.dataset.st], "success"); await loadAll(); openIncident(id); }
      catch (e) { toast(e.message, "error"); }
    }));
    const sn = $("#saveNote");
    if (sn) sn.onclick = async () => {
      try { await api("/incidents/" + id, { method: "PATCH", body: JSON.stringify({ notes: $("#noteBox").value }) }); toast("Note saved", "success"); loadAll(); }
      catch (e) { toast(e.message, "error"); }
    };
  } catch (e) { toast(e.message, "error"); }
}

/* ---------- report form ---------- */
SAMPLES.forEach(s => {
  const c = document.createElement("span");
  c.className = "chip"; c.textContent = s.length > 48 ? s.slice(0, 46) + "…" : s; c.title = s;
  c.onclick = () => { $("#reportText").value = s; $("#reportText").dispatchEvent(new Event("input")); };
  $("#sampleChips").appendChild(c);
});
$("#reportText").addEventListener("input", e => ($("#charCount").textContent = `${e.target.value.length} / 1000`));
$("#clearBtn").onclick = () => { $("#reportText").value = ""; $("#charCount").textContent = "0 / 1000"; $("#resultBox").innerHTML = `<p class="hint">Your report's analysis appears here.</p>`; };

function resultHtml(a, meta) {
  const engineLabel = a.engine === "rules+gemini"
    ? "Gemini contextual assist + NLP rules"
    : "Rule-based NLP fallback";
  if (!a.relevant) {
    return `<div class="result muted-card"><h3>🚫 Not identified as a mobility incident</h3>
      <p>${esc(a.note)}</p><p class="hint">It will not appear on the map or in incident counts.</p>
      ${meta?.tracking_id ? `<div class="notice">🎫 Report tracking ID: <b>${esc(meta.tracking_id)}</b></div>` : ""}
      <div class="meta"><span>Language: ${esc(a.language)}</span><span>Sentiment: ${esc(a.sentiment)}</span><span>Analysis: ${engineLabel}</span></div></div>`;
  }
  const loc = a.lat != null
    ? `📍 ${esc(a.location_text)} <small>(${esc(a.geo_method)}, ${Math.round(a.geo_confidence * 100)}% sure)</small>`
    : `<span class="warn">Unknown – flagged for review${a.location_text ? ` (“${esc(a.location_text)}” could not be located)` : ""}</span>`;
  let extra = "";
  if (meta) {
    extra = meta.is_copy
      ? `<div class="notice copy">⚠ This looks identical to an earlier post, so it was attached to incident #${meta.incident.id} but <b>does not raise confidence</b>.</div>`
      : meta.new_incident
        ? `<div class="notice">🆕 Created new possible incident <b>#${meta.incident.id}</b> (unverified).</div>`
        : `<div class="notice">🔗 Grouped with incident <b>#${meta.incident.id}</b> – now ${meta.incident.report_count} unique reports (exact copies excluded), confidence ${Math.round(meta.incident.confidence * 100)}%.</div>`;
    extra += `<div class="notice">🎫 Your tracking ID: <b>${esc(meta.tracking_id || `MDR-${String(meta.report_id).padStart(6, "0")}`)}</b>. Save this ID to check progress.</div>`;
    extra += `<button class="btn small" onclick="openIncident(${meta.incident.id})">View incident</button>`;
  } else extra = `<p class="hint">This is only a preview. Nothing has been saved yet.</p>`;
  return `<div class="result"><h3>${catName(a.category)} — ${esc(a.sub_issue)}</h3>
    <div class="kv">
      <b>Location</b><span>${loc}</span>
      <b>Incident time</b><span>${fmtTime(a.incident_time)} <small>(${a.time_basis === "stated" ? "stated in report" : "using report time"})</small></span>
      <b>Duration</b><span>${a.duration_min ? a.duration_min + " minutes" : "not mentioned"}</span>
      <b>Affected</b><span>${esc(a.affected || "not mentioned")}</span>
      <b>Severity</b><span>${sevBadge(a.severity_label, a.severity_score)}<br><small>${esc(a.severity_reason)}</small></span>
      <b>Sentiment</b><span>${esc(a.sentiment)} (${a.sentiment_score})</span>
      <b>Language</b><span>${esc(a.language)}</span>
      <b>Analysis engine</b><span>${engineLabel}</span>
    </div>${extra}</div>`;
}

function setBusy(btn, on, label) { btn.disabled = on; if (label) btn.dataset.l = btn.dataset.l || btn.textContent; btn.textContent = on ? label : btn.dataset.l || btn.textContent; }
$("#previewBtn").onclick = async () => {
  const text = $("#reportText").value.trim();
  if (text.length < 8) return toast("Please write a few more words.", "error");
  const b = $("#previewBtn"); setBusy(b, true, "Analysing…");
  try { $("#resultBox").innerHTML = resultHtml(await api("/analyze", { method: "POST", body: JSON.stringify({ text, language: $("#reportLanguage").value }) }), null); }
  catch (e) { toast(e.message, "error"); }
  setBusy(b, false);
};
$("#submitBtn").onclick = async () => {
  const text = $("#reportText").value.trim();
  if (text.length < 8) return toast("Please write a few more words.", "error");
  const b = $("#submitBtn"); setBusy(b, true, "Submitting…");
  try {
    const res = await api("/reports", { method: "POST", body: JSON.stringify({ text, source: $("#reportSource").value, language: $("#reportLanguage").value }) });
    $("#resultBox").innerHTML = resultHtml(res.analysis, res);
    toast(res.analysis.relevant ? "Report submitted. Thank you!" : "Report received, but it isn't about transport.", res.analysis.relevant ? "success" : "");
    $("#reportText").value = ""; $("#charCount").textContent = "0 / 1000";
    loadAll();
  } catch (e) { toast(e.message, "error"); }
  setBusy(b, false);
};

async function trackSubmittedReport() {
  const raw = $("#trackingInput").value.trim().toUpperCase();
  const match = raw.match(/^MDR-(\d{1,10})$/);
  if (!match) { toast("Enter a tracking ID like MDR-000123.", "error"); return; }
  const box = $("#trackingResult"); box.innerHTML = `<p class="hint">Checking your report…</p>`;
  try {
    const data = await api("/track/" + Number(match[1]));
    if (!data.relevant) { box.innerHTML = `<div class="notice">${esc(data.message)}<br>Received: ${fmtTime(data.created_at)}</div>`; return; }
    box.innerHTML = `<div class="notice"><b>${esc(data.tracking_id)}</b><p>${esc(data.incident.category)} · ${esc(data.incident.location_text || "Location pending")}</p><p>Status: <b>${esc(STATUS[data.incident.status] || data.incident.status)}</b></p><p>Unique reports grouped: ${data.incident.report_count}</p><div class="reports">${(data.events || []).map(e => `<div class="rep">${esc(e.details)}<small>${fmtTime(e.created_at)}</small></div>`).join("")}</div></div>`;
  } catch (e) { box.innerHTML = `<p class="hint">${esc(e.message)}</p>`; }
}
$("#trackBtn").onclick = trackSubmittedReport;
$("#trackingInput").addEventListener("keydown", e => { if (e.key === "Enter") trackSubmittedReport(); });

const languagePlaceholders = {
  English: "e.g. Heavy waterlogging near Velachery railway station. Buses cannot move.",
  Tamil: "உதாரணம்: வேளச்சேரி ரயில் நிலையம் அருகே மழைநீர் தேங்கி, பேருந்துகள் செல்ல முடியவில்லை.",
  Hindi: "उदाहरण: वेलाचेरी रेलवे स्टेशन के पास जलभराव है और बसें आगे नहीं बढ़ पा रही हैं।",
  Malayalam: "ഉദാഹരണം: വേളച്ചേരി റെയിൽവേ സ്റ്റേഷന് സമീപം വെള്ളക്കെട്ട് കാരണം ബസുകൾക്ക് നീങ്ങാൻ കഴിയുന്നില്ല.",
  Telugu: "ఉదాహరణ: వేళచ్చేరి రైల్వే స్టేషన్ దగ్గర నీరు నిలిచిపోవడంతో బస్సులు వెళ్లలేకపోతున్నాయి."
};
$("#reportLanguage").addEventListener("change", () => {
  $("#reportText").placeholder = languagePlaceholders[$("#reportLanguage").value] || languagePlaceholders.English;
});

/* ---------- multilingual voice-to-text ---------- */
const speechLang = { English: "en-IN", Tamil: "ta-IN", Hindi: "hi-IN", Malayalam: "ml-IN", Telugu: "te-IN" };
let speechRecognition = null;
const voiceBtn = $("#voiceBtn"), voiceStatus = $("#voiceStatus");
function stopVoiceUI(message) {
  if (voiceBtn) { voiceBtn.textContent = "🎙 Start voice typing"; voiceBtn.classList.remove("recording"); }
  if (voiceStatus && message) voiceStatus.textContent = message;
}
if (voiceBtn) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    voiceBtn.addEventListener("click", () => toast("Voice typing is not supported in this browser. Try the latest Chrome or Edge.", "error"));
    voiceBtn.title = "Speech recognition is not supported by this browser";
  } else {
    speechRecognition = new SpeechRecognition();
    speechRecognition.continuous = true;
    speechRecognition.interimResults = true;
    speechRecognition.maxAlternatives = 1;
    let finalTranscript = "";
    speechRecognition.onstart = () => { voiceBtn.textContent = "⏹ Stop voice typing"; voiceBtn.classList.add("recording"); voiceStatus.textContent = "Listening… speak clearly. Select your language before starting."; };
    speechRecognition.onresult = event => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const phrase = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalTranscript += phrase + " "; else interim += phrase;
      }
      const box = $("#reportText");
      box.value = (finalTranscript + interim).trim().slice(0, 1000);
      $("#charCount").textContent = `${box.value.length} / 1000`;
    };
    speechRecognition.onerror = event => {
      const messages = { "not-allowed": "Microphone permission was blocked. Allow microphone access in your browser settings.", "no-speech": "No speech detected. Tap the microphone and try again.", "network": "Speech service network error. Check your connection and retry." };
      stopVoiceUI(messages[event.error] || `Voice input stopped: ${event.error}.`);
    };
    speechRecognition.onend = () => stopVoiceUI("Voice typing stopped. You can edit the text before submitting.");
    voiceBtn.addEventListener("click", () => {
      if (voiceBtn.classList.contains("recording")) { speechRecognition.stop(); return; }
      finalTranscript = $("#reportText").value.trim();
      if (finalTranscript) finalTranscript += " ";
      speechRecognition.lang = speechLang[$("#reportLanguage").value] || "en-IN";
      try { speechRecognition.start(); } catch (err) { toast("Voice typing is already starting. Please wait a moment.", "error"); }
    });
    $("#reportLanguage").addEventListener("change", () => {
      if (voiceBtn.classList.contains("recording")) speechRecognition.stop();
      voiceStatus.textContent = `Voice language set to ${$("#reportLanguage").selectedOptions[0].textContent}.`;
    });
  }
}

/* ---------- sample data / reset / export ---------- */
async function seed(btn, size = "small") {
  btn.disabled = true; toast("Loading sample reports… (may take a few seconds)");
  try { const r = await api("/seed?size=" + size, { method: "POST" }); toast(`Loaded ${r.loaded} sample reports`, "success"); await loadAll(); showTab("dashboard"); }
  catch (e) { toast(e.message, "error"); }
  btn.disabled = false;
}
$("#seedBtn").onclick = () => seed($("#seedBtn"));
$("#seedBtn2").onclick = () => seed($("#seedBtn2"));
$("#seedBig").onclick = () => seed($("#seedBig"), "large");
$("#seedBig2").onclick = () => seed($("#seedBig2"), "large");

/* ---------- bulk import (officials) ---------- */
function openImport() {
  openModal(`<h2>⬆ Import reports</h2>
    <p class="hint">Upload a CSV with a <code>text</code> column. Optional columns: <code>source</code> and <code>timestamp</code> (like 2026-11-04 08:30). Max 500 rows.</p>
    <div class="drop" id="drop">📄 Drag a CSV file here, or <u>click to choose</u>
      <input type="file" id="impFile" accept=".csv,.txt" hidden></div>
    <p class="hint" style="text-align:center">or paste reports below (one per line, or CSV with a header row)</p>
    <textarea id="impText" rows="6" placeholder="Heavy traffic near Guindy because of an accident…"></textarea>
    <div class="row between wrap">
      <a class="btn small" href="/api/import-template.csv" download>⬇ Download template</a>
      <label class="dl"><input type="checkbox" id="impOnline"> Look up unknown places online (slower)</label>
    </div>
    <div class="actions"><button class="btn primary" id="impGo">Import</button></div>
    <div id="impResult"></div>`);
  const drop = $("#drop"), file = $("#impFile");
  const load = async f => {
    if (!f) return;
    if (f.size > 1000000) return toast("File is too large (max 1 MB).", "error");
    $("#impText").value = await f.text();
    toast("Loaded " + f.name, "success");
  };
  drop.onclick = () => file.click();
  file.onchange = () => load(file.files[0]);
  drop.ondragover = e => { e.preventDefault(); drop.classList.add("over"); };
  drop.ondragleave = () => drop.classList.remove("over");
  drop.ondrop = e => { e.preventDefault(); drop.classList.remove("over"); load(e.dataTransfer.files[0]); };
  $("#impGo").onclick = async () => {
    const csv = $("#impText").value;
    if (!csv.trim()) return toast("Choose a file or paste some reports first.", "error");
    const b = $("#impGo"); b.disabled = true; b.textContent = "Importing…";
    try {
      const r = await api("/import", { method: "POST", body: JSON.stringify({ csv, online: $("#impOnline").checked }) });
      $("#impResult").innerHTML = `<div class="stats">
        <div class="stat"><b>${r.imported}</b><small>Imported</small></div>
        <div class="stat"><b>${r.transport}</b><small>Transport-related</small></div>
        <div class="stat"><b>${r.new_incidents}</b><small>New incidents</small></div>
        <div class="stat"><b>${r.grouped}</b><small>Grouped into existing</small></div>
        <div class="stat"><b>${r.copies}</b><small>Copies</small></div>
        <div class="stat"><b>${r.filtered}</b><small>Filtered out</small></div>
        <div class="stat"><b>${r.skipped}</b><small>Skipped (too short)</small></div></div>
        ${r.truncated ? `<div class="notice copy">Only the first 500 rows were imported.</div>` : ""}`;
      toast(`Imported ${r.imported} reports`, "success");
      loadAll();
    } catch (e) { toast(e.message, "error"); }
    b.disabled = false; b.textContent = "Import";
  };
}
$("#importBtn").onclick = openImport;
$("#resetBtn").onclick = async () => {
  if (!confirm("Delete ALL reports and incidents? This cannot be undone.")) return;
  try { await api("/reset", { method: "POST" }); toast("All data cleared", "success"); loadAll(); } catch (e) { toast(e.message, "error"); }
};
$("#exportBtn").onclick = async () => {
  try {
    const res = await fetch("/api/export.csv?" + filterParams(), { headers: { "X-Official-Pin": pin } });
    if (!res.ok) throw new Error("Export failed");
    const url = URL.createObjectURL(await res.blob());
    const a = Object.assign(document.createElement("a"), { href: url, download: "incidents.csv" });
    a.click(); URL.revokeObjectURL(url); toast("CSV downloaded", "success");
  } catch (e) { toast(e.message, "error"); }
};

/* ---------- start ---------- */
initMap();
verifyPin();
loadAll();
setInterval(() => { if (!$("#modal").hidden || !["dashboard", "incidents"].includes(currentTab)) return; loadAll(); }, 30000);
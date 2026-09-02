(() => {
  "use strict";

  const API = "/api/room";
  const LS_SEAT = "tw_room_seat";
  const el = {
    loginPanel: document.getElementById("login-panel"),
    chatPanel: document.getElementById("chat-panel"),
    loginForm: document.getElementById("login-form"),
    sendForm: document.getElementById("send-form"),
    loginError: document.getElementById("login-error"),
    messages: document.getElementById("messages"),
    seatLabel: document.getElementById("seat-label"),
    status: document.getElementById("status"),
    btnLogout: document.getElementById("btn-more-logout"),
    linkDash: document.getElementById("link-dash"),
    linkMoreDash: document.getElementById("link-more-dash"),
    btnEvents: document.getElementById("btn-events"),
    eventsOverlay: document.getElementById("events-overlay"),
    eventsBody: document.getElementById("events-body"),
    btnEventsClose: document.getElementById("btn-events-close"),
    btnEventsRefresh: document.getElementById("btn-events-refresh"),
    moneyOverlay: document.getElementById("money-overlay"),
    moneyBody: document.getElementById("money-body"),
    btnMoneyClose: document.getElementById("btn-money-close"),
    btnMoneyRefresh: document.getElementById("btn-money-refresh"),
    heroOverlay: document.getElementById("hero-overlay"),
    heroBody: document.getElementById("hero-body"),
    btnHeroClose: document.getElementById("btn-hero-close"),
    btnHeroRefresh: document.getElementById("btn-hero-refresh"),
    ctxSeat: document.getElementById("ctx-seat"),
    ctxPhase: document.getElementById("ctx-phase"),
    chipEvents: document.getElementById("chip-events"),
    chipEventsBadge: document.getElementById("chip-events-badge"),
    chipTreasury: document.getElementById("chip-treasury"),
    chipHero: document.getElementById("chip-hero"),
    chipMore: document.getElementById("chip-more"),
    moreOverlay: document.getElementById("more-overlay"),
    btnMoreClose: document.getElementById("btn-more-close"),
    inpText: document.getElementById("inp-text"),
    inpRun: document.getElementById("inp-run"),
    inpPlayer: document.getElementById("inp-player"),
    inpToken: document.getElementById("inp-token"),
    rail: document.querySelector(".rail"),
    btnRailToggle: document.getElementById("btn-rail-toggle"),
    panelOverlay: document.getElementById("panel-overlay"),
    panelTitle: document.getElementById("panel-title"),
    panelBody: document.getElementById("panel-body"),
    btnPanelClose: document.getElementById("btn-panel-close"),
    btnPanelRefresh: document.getElementById("btn-panel-refresh"),
    btnPanelBack: document.getElementById("btn-panel-back"),
  };

  const PHASE_LABELS = {
    leader: "лидер",
    hearth: "очаг",
    adventure: "приключение",
    adventure_prep: "подготовка",
    adventure_done: "после приключения",
    defense: "оборона",
    attack: "атака",
  };

  let seat = null;
  let es = null;
  let reconnectTimer = null;
  let reconnectDelay = 1500;
  let typingTimer = null;
  let sseConnecting = false;
  const seenIds = new Set();
  const RECONNECT_MAX_MS = 20000;
  const STATUS_POLL_MS = 3 * 60 * 1000;
  const PANEL_RENDERERS = (window.TwRoomPanels && window.TwRoomPanels.renderers) || {};

  let activePanel = null;
  let panelBack = null;
  let statusPollTimer = null;

  function loadLoginPrefs() {
    try {
      const raw = localStorage.getItem(LS_SEAT);
      if (!raw) return;
      const p = JSON.parse(raw);
      if (p.run && el.inpRun) el.inpRun.value = p.run;
      if (p.player && el.inpPlayer) el.inpPlayer.value = p.player;
    } catch {
      /* ignore corrupt prefs */
    }
  }

  function saveLoginPrefs(run, player) {
    try {
      localStorage.setItem(LS_SEAT, JSON.stringify({ run, player }));
    } catch {
      /* private mode / quota */
    }
  }

  function countOpenEvents(data) {
    if (!data || !data.ok) return 0;
    let n = 0;
    for (const sec of data.sections || []) {
      for (const it of sec.items || []) {
        if (!it.done) n += 1;
      }
    }
    return n;
  }

  function updateEventsBadge(count) {
    if (!el.chipEventsBadge || !el.chipEvents) return;
    const n = Number(count) || 0;
    if (n <= 0) {
      el.chipEventsBadge.hidden = true;
      el.chipEventsBadge.setAttribute("aria-hidden", "true");
      el.chipEventsBadge.textContent = "";
      el.chipEvents.removeAttribute("aria-label");
      return;
    }
    el.chipEventsBadge.hidden = false;
    el.chipEventsBadge.setAttribute("aria-hidden", "false");
    el.chipEventsBadge.textContent = String(n);
    el.chipEvents.setAttribute("aria-label", `События, ${n} не закрыто`);
  }

  async function refreshEventsBadge() {
    if (!seat) return;
    try {
      const data = await api("/leader-events");
      updateEventsBadge(countOpenEvents(data));
    } catch {
      /* badge is optional */
    }
  }

  function setStatus(kind, text) {
    el.status.className = `status ${kind}`;
    el.status.textContent = text;
  }

  function showLoginError(msg) {
    if (!msg) {
      el.loginError.hidden = true;
      el.loginError.textContent = "";
      return;
    }
    el.loginError.hidden = false;
    el.loginError.textContent = msg;
  }

  function dashUrl(run, player, hash) {
    const u = new URL("/player.html", window.location.origin);
    if (run) u.searchParams.set("run", run);
    if (player) u.searchParams.set("player", player);
    const base = u.pathname + u.search;
    return hash ? base + hash : base;
  }

  function updateDashLink(run, player) {
    const href = dashUrl(run, player);
    if (el.linkDash) el.linkDash.href = href || "/player.html";
    if (el.linkMoreDash) el.linkMoreDash.href = href || "/player.html";
  }

  function closeMorePanel() {
    if (!el.moreOverlay) return;
    el.moreOverlay.hidden = true;
  }

  function openMorePanel() {
    if (!el.moreOverlay) return;
    el.moreOverlay.hidden = false;
  }

  function renderContextStrip(data) {
    if (!el.ctxSeat) return;
    const run = (data && data.run) || (seat && seat.run) || "";
    const player = (data && data.player) || (seat && seat.player) || "";
    const charName = data && data.char_name;
    el.ctxSeat.textContent = charName
      ? `${charName} · ${run} · ${player}`
      : `${run} · ${player}`;
    if (!el.ctxPhase) return;
    const season = data && data.season;
    const seasonName = data && data.season_name;
    const phase = data && data.active_phase;
    const parts = [];
    if (season) {
      parts.push(seasonName ? `С${season} · ${seasonName}` : `С${season}`);
    } else if (seasonName) {
      parts.push(seasonName);
    }
    if (phase) {
      parts.push(PHASE_LABELS[phase] || phase);
    }
    const scene = data && data.scene;
    if (scene && String(scene).trim()) {
      parts.push(String(scene).trim());
    }
    el.ctxPhase.textContent = parts.length ? parts.join(" · ") : "";
  }

  async function loadPlayerStatus() {
    if (!seat) return;
    renderContextStrip({ run: seat.run, player: seat.player });
    try {
      const data = await api("/player-status");
      renderContextStrip(data || { run: seat.run, player: seat.player });
    } catch {
      /* strip keeps seat-only fallback */
    }
  }

  function esc(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function closePanelOverlay() {
    if (!el.panelOverlay) return;
    el.panelOverlay.hidden = true;
    activePanel = null;
    panelBack = null;
    if (el.btnPanelBack) el.btnPanelBack.hidden = true;
  }

  function closeStatusPanels() {
    closeEventsPanel();
    closeMoneyPanel();
    closeHeroPanel();
    closePanelOverlay();
  }

  function stopStatusPoll() {
    if (statusPollTimer) {
      clearInterval(statusPollTimer);
      statusPollTimer = null;
    }
  }

  function startStatusPoll() {
    stopStatusPoll();
    if (!seat) return;
    statusPollTimer = setInterval(() => {
      if (!seat || document.hidden) return;
      loadPlayerStatus();
      refreshEventsBadge();
    }, STATUS_POLL_MS);
  }

  async function loadGenericPanel(spec, { showLoading = true } = {}) {
    if (!seat || !el.panelBody || !spec) return;
    if (showLoading) el.panelBody.innerHTML = `<p class="muted">Загрузка…</p>`;
    const q = spec.query ? `?${new URLSearchParams(spec.query).toString()}` : "";
    try {
      const data = await api(`${spec.path}${q}`);
      const render = PANEL_RENDERERS[spec.key];
      if (!render) {
        el.panelBody.innerHTML = `<p class="ev-err">Нет рендера для ${esc(spec.key)}</p>`;
        return;
      }
      const ctx = { openSettlement: (name) => openSettlementPanel(name) };
      const out = spec.key === "settlement" ? render(data) : render(data, ctx);
      if (out && typeof out === "object" && out.html != null) {
        el.panelBody.innerHTML = out.html;
        if (typeof out.bind === "function") out.bind(el.panelBody);
      } else {
        el.panelBody.innerHTML = out || `<p class="ev-empty">Пусто.</p>`;
      }
    } catch (err) {
      if (err.status === 401) {
        closePanelOverlay();
        closeSSE();
        seat = null;
        showLogin();
        showLoginError("сессия истекла — войдите снова");
        return;
      }
      el.panelBody.innerHTML = `<p class="ev-err">${esc(err.message || "ошибка загрузки")}</p>`;
    }
  }

  async function openGenericPanel(key, { title, path, query, back } = {}) {
    if (!seat || !el.panelOverlay) return;
    closeEventsPanel();
    closeMoneyPanel();
    closeHeroPanel();
    closeMorePanel();
    const spec = {
      key,
      title: title || key,
      path: path || `/${key}`,
      query: query || null,
    };
    if (back) panelBack = back;
    else if (key !== "settlement") panelBack = null;
    activePanel = spec;
    if (el.panelTitle) el.panelTitle.textContent = spec.title;
    if (el.btnPanelBack) el.btnPanelBack.hidden = !panelBack;
    el.panelOverlay.hidden = false;
    await loadGenericPanel(spec);
  }

  function openSettlementPanel(name) {
    openGenericPanel("settlement", {
      title: name,
      path: "/settlement",
      query: { name },
      back: { key: "settlements", title: "Населённые пункты", path: "/settlements" },
    });
  }

  const EXTRA_PANEL_DEFS = {
    economy: { title: "Экономика", path: "/economy" },
    bag: { title: "Вещи", path: "/bag" },
    loyalty: { title: "Лояльность", path: "/loyalty" },
    religion: { title: "Вера", path: "/religion" },
    growth: { title: "Рост населения", path: "/growth" },
    threat: { title: "Угроза", path: "/threat" },
    territory: { title: "Территория", path: "/territory" },
    stash: { title: "Кладовая", path: "/stash" },
    loot: { title: "Сбыт трофеев", path: "/loot" },
    settlements: { title: "Населённые пункты", path: "/settlements" },
  };

  function closeEventsPanel() {
    if (!el.eventsOverlay) return;
    el.eventsOverlay.hidden = true;
  }

  function closeMoneyPanel() {
    if (!el.moneyOverlay) return;
    el.moneyOverlay.hidden = true;
  }

  function closeHeroPanel() {
    if (!el.heroOverlay) return;
    el.heroOverlay.hidden = true;
  }

  function fmtAmt(n) {
    const v = Number(n) || 0;
    return v.toLocaleString("ru-RU");
  }

  function moneySign(n) {
    const v = Number(n) || 0;
    if (v > 0) return `+${fmtAmt(v)}`;
    return fmtAmt(v);
  }

  function renderMoneyGroups(title, groups, total, sign) {
    let html = `<section class="ev-sec">
      <h3 class="ev-sec-title">${esc(title)}: ${esc(sign + fmtAmt(total))}</h3>`;
    for (const g of groups || []) {
      if (g.name) html += `<div class="ev-roll-title">${esc(g.name)}</div>`;
      for (const it of g.items || []) {
        html += `<div class="ev-row"><span>${esc(it.label)}</span><span class="ev-row-amt">${esc(fmtAmt(it.amount))}</span></div>`;
      }
    }
    html += `</section>`;
    return html;
  }

  function renderMoneyPayload(data) {
    if (!el.moneyBody) return;
    if (!data || !data.ok) {
      el.moneyBody.innerHTML = `<p class="ev-err">Не удалось загрузить казну</p>`;
      return;
    }
    if (!data.has_finance_file) {
      el.moneyBody.innerHTML = `<p class="ev-empty">Нет finance.md для этого seat.</p>`;
      return;
    }
    let html = "";
    html += `<section class="ev-sec">
      <h3 class="ev-sec-title">Казна на начало</h3>
      <div class="ev-row"><span>Начало</span><span class="ev-row-amt">${esc(fmtAmt(data.start))}</span></div>
    </section>`;
    html += renderMoneyGroups("Доходы", data.income_by, data.total_income, "+");
    html += renderMoneyGroups("Расходы", data.expenses_by, data.total_expenses, "−");
    const profit = Number(data.profit) || 0;
    html += `<section class="ev-sec">
      <h3 class="ev-sec-title">Прибыль: ${esc(moneySign(profit))}</h3>
    </section>`;
    if ((data.receipts || []).length) {
      html += `<section class="ev-sec"><h3 class="ev-sec-title">Поступления</h3>`;
      for (const it of data.receipts) {
        html += `<div class="ev-row"><span>${esc(it.label)}</span><span class="ev-row-amt">+${esc(fmtAmt(it.amount))}</span></div>`;
      }
      html += `</section>`;
    }
    if ((data.spendings || []).length) {
      html += `<section class="ev-sec"><h3 class="ev-sec-title">Траты</h3>`;
      for (const it of data.spendings) {
        html += `<div class="ev-row"><span>${esc(it.label)}</span><span class="ev-row-amt">−${esc(fmtAmt(it.amount))}</span></div>`;
      }
      html += `</section>`;
    }
    html += `<section class="ev-sec">
      <h3 class="ev-sec-title">Казна на конец: ~${esc(fmtAmt(data.balance))}</h3>
    </section>`;
    el.moneyBody.innerHTML = html;
  }

  function renderHeroPayload(data) {
    if (!el.heroBody) return;
    if (!data || !data.ok) {
      el.heroBody.innerHTML = `<p class="ev-err">Не удалось загрузить героя</p>`;
      return;
    }
    if (!data.has_hero_file) {
      el.heroBody.innerHTML = `<p class="ev-empty">Нет hero_status.md для этого seat.</p>`;
      return;
    }
    let html = "";
    if (data.name) {
      html += `<p class="ev-rolls-note">${esc(data.name)}</p>`;
    }
    if (data.patronage) {
      html += `<section class="ev-sec">
        <h3 class="ev-sec-title">Покровительство</h3>
        <div class="ev-roll-item">${esc(data.patronage)}</div>
      </section>`;
    }
    const skills = data.skills || [];
    if (skills.length) {
      html += `<section class="ev-sec"><h3 class="ev-sec-title">Навыки</h3>`;
      for (const sk of skills) {
        let meta = [];
        for (const t of sk.techniques || []) {
          const kind = t.kind ? `${t.kind}: ` : "";
          meta.push(`${kind}${t.name}`);
        }
        if (sk.bank != null) meta.push(`банк: ${sk.bank}`);
        if (sk.ups != null) {
          let ap = `апов: ${sk.ups}`;
          if (sk.next_threshold != null) {
            ap += ` | след. порог: ${sk.next_threshold}`;
            if (sk.bank != null && sk.bank >= sk.next_threshold) ap += " ✓";
          }
          meta.push(ap);
        }
        html += `<div class="ev-skill">
          <div>${esc(sk.name)}</div>
          ${meta.length ? `<div class="ev-skill-meta">${esc(meta.join(" · "))}</div>` : ""}
        </div>`;
      }
      html += `</section>`;
    }
    if ((data.features || []).length) {
      html += `<section class="ev-sec"><h3 class="ev-sec-title">Особенность</h3>`;
      for (const f of data.features) {
        html += `<div class="ev-roll-item">${esc(f)}</div>`;
      }
      html += `</section>`;
    }
    const status = data.status || {};
    const statusKeys = Object.keys(status);
    if (statusKeys.length) {
      html += `<section class="ev-sec"><h3 class="ev-sec-title">Статус</h3>`;
      for (const k of statusKeys) {
        html += `<div class="ev-row"><span>${esc(k)}</span><span class="ev-row-amt">${esc(status[k])}</span></div>`;
      }
      html += `</section>`;
    }
    if ((data.gear || []).length) {
      html += `<section class="ev-sec"><h3 class="ev-sec-title">Снаряжение</h3>`;
      for (const g of data.gear) {
        html += `<div class="ev-roll-item">— ${esc(g)}</div>`;
      }
      html += `</section>`;
    }
    if ((data.items || []).length) {
      html += `<section class="ev-sec"><h3 class="ev-sec-title">Предметы</h3>`;
      for (const it of data.items) {
        html += `<div class="ev-roll-item">— ${esc(it)}</div>`;
      }
      html += `</section>`;
    }
    if (!html) {
      html = `<p class="ev-empty">Пустой статус героя.</p>`;
    }
    el.heroBody.innerHTML = html;
  }

  async function loadEventsPanel({ showLoading = true } = {}) {
    if (!seat || !el.eventsOverlay || !el.eventsBody) return;
    if (showLoading) {
      el.eventsBody.innerHTML = `<p class="muted">Загрузка…</p>`;
    }
    try {
      const data = await api("/leader-events");
      renderEventsPayload(data);
    } catch (err) {
      if (err.status === 401) {
        closeEventsPanel();
        closeSSE();
        seat = null;
        showLogin();
        showLoginError("сессия истекла — войдите снова");
        return;
      }
      el.eventsBody.innerHTML = `<p class="ev-err">${esc(err.message || "ошибка загрузки")}</p>`;
    }
  }

  async function openEventsPanel() {
    if (!seat || !el.eventsOverlay || !el.eventsBody) return;
    closeMoneyPanel();
    closeHeroPanel();
    closeMorePanel();
    el.eventsOverlay.hidden = false;
    await loadEventsPanel();
  }

  async function loadMoneyPanel({ showLoading = true } = {}) {
    if (!seat || !el.moneyOverlay || !el.moneyBody) return;
    if (showLoading) {
      el.moneyBody.innerHTML = `<p class="muted">Загрузка…</p>`;
    }
    try {
      const data = await api("/money");
      renderMoneyPayload(data);
    } catch (err) {
      if (err.status === 401) {
        closeMoneyPanel();
        closeSSE();
        seat = null;
        showLogin();
        showLoginError("сессия истекла — войдите снова");
        return;
      }
      el.moneyBody.innerHTML = `<p class="ev-err">${esc(err.message || "ошибка загрузки")}</p>`;
    }
  }

  async function loadHeroPanel({ showLoading = true } = {}) {
    if (!seat || !el.heroOverlay || !el.heroBody) return;
    if (showLoading) {
      el.heroBody.innerHTML = `<p class="muted">Загрузка…</p>`;
    }
    try {
      const data = await api("/hero");
      renderHeroPayload(data);
    } catch (err) {
      if (err.status === 401) {
        closeHeroPanel();
        closeSSE();
        seat = null;
        showLogin();
        showLoginError("сессия истекла — войдите снова");
        return;
      }
      el.heroBody.innerHTML = `<p class="ev-err">${esc(err.message || "ошибка загрузки")}</p>`;
    }
  }

  async function openMoneyPanel() {
    if (!seat || !el.moneyOverlay || !el.moneyBody) return;
    closeHeroPanel();
    closeEventsPanel();
    closeMorePanel();
    el.moneyOverlay.hidden = false;
    await loadMoneyPanel();
  }

  async function openHeroPanel() {
    if (!seat || !el.heroOverlay || !el.heroBody) return;
    closeMoneyPanel();
    closeEventsPanel();
    closeMorePanel();
    el.heroOverlay.hidden = false;
    await loadHeroPanel();
  }

  function pointBlock(who, left, total) {
    return `<div class="ev-point">
      <div class="ev-point-who">${esc(who)}</div>
      <div class="ev-point-num">${esc(left)}</div>
      <div class="ev-point-of">из ${esc(total)}</div>
    </div>`;
  }

  function renderEventsPayload(data) {
    if (!el.eventsBody) return;
    updateEventsBadge(countOpenEvents(data));
    if (!data || !data.ok) {
      el.eventsBody.innerHTML = `<p class="ev-err">Не удалось загрузить события</p>`;
      return;
    }
    const pts = data.points || {};
    let html = "";
    if (pts.player || pts.chancellor || pts.captain || pts.willpower) {
      html += `<div class="ev-points">`;
      if (pts.player) html += pointBlock("Игрок", pts.player.left, pts.player.total);
      if (pts.chancellor) {
        html += pointBlock(pts.chancellor.name || "Канцлер", pts.chancellor.left, pts.chancellor.total);
      }
      if (pts.captain) {
        html += pointBlock(pts.captain.name || "Капитан", pts.captain.left, pts.captain.total);
      }
      if (pts.willpower) {
        html += pointBlock("Воля", pts.willpower.left, pts.willpower.total);
      }
      html += `</div>`;
    }

    const sections = data.sections || [];
    let anyItems = false;
    for (const sec of sections) {
      const items = sec.items || [];
      if (!items.length) continue;
      anyItems = true;
      const open = items.filter((it) => !it.done).length;
      html += `<section class="ev-sec">
        <h3 class="ev-sec-title">${esc(sec.label)} (${open}/${items.length} осталось)</h3>`;
      for (const it of items) {
        const check = it.done ? "☑" : "☐";
        html += `<div class="ev-item">
          <span class="ev-check">${check}</span>
          <div class="ev-text${it.done ? " done" : ""}">${esc(it.text)}</div>
        </div>`;
      }
      html += `</section>`;
    }

    const rolls = data.rolls;
    if (rolls && (rolls.groups || []).length) {
      html += `<section class="ev-sec">
        <h3 class="ev-sec-title">Разбор броска очереди</h3>
        <p class="ev-rolls-note">Из чего сложилась очередь (dF + податное + год…)</p>`;
      for (const g of rolls.groups) {
        html += `<div class="ev-roll-group">
          <div class="ev-roll-title">${esc(g.title || "")}</div>`;
        for (const it of g.items || []) {
          html += `<div class="ev-roll-item">${esc(it)}</div>`;
        }
        html += `</div>`;
      }
      html += `</section>`;
    }

    if (!html) {
      html = data.has_events_file
        ? `<p class="ev-empty">Событий пока нет.</p>`
        : `<p class="ev-empty">Нет events_status.md для этого seat.</p>`;
    }
    el.eventsBody.innerHTML = html;
  }

  function formatTs(ts) {
    if (!ts) return "";
    try {
      const d = new Date(ts);
      if (Number.isNaN(d.getTime())) return String(ts).slice(11, 16) || "";
      return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  }

  function roleClass(role) {
    const r = String(role || "").toLowerCase();
    if (r === "master" || r === "gm" || r === "assistant") return "master";
    if (r === "system" || r === "summary") return "system";
    return "player";
  }

  function roleLabel(role) {
    const r = String(role || "").toLowerCase();
    if (r === "master" || r === "gm" || r === "assistant") return "мастер";
    if (r === "system" || r === "summary") return "система";
    return "вы";
  }

  function appendMessage(msg, { scroll = true } = {}) {
    if (!msg || typeof msg !== "object") return;
    const id = msg.messageId || msg.id || `${msg.ts || ""}:${msg.role || ""}:${msg.text || ""}`;
    if (id && seenIds.has(id)) return;
    if (id) seenIds.add(id);

    const hint = el.messages.querySelector(".empty-hint");
    if (hint) hint.remove();

    const div = document.createElement("div");
    const rc = roleClass(msg.role);
    div.className = `msg ${rc}`;
    div.dataset.id = id || "";

    const meta = document.createElement("div");
    meta.className = "meta";
    const roleSpan = document.createElement("span");
    roleSpan.className = "role";
    roleSpan.textContent = roleLabel(msg.role);
    const timeSpan = document.createElement("span");
    timeSpan.textContent = formatTs(msg.ts);
    meta.append(roleSpan, timeSpan);

    const body = document.createElement("div");
    body.className = "body";
    body.textContent = msg.text || "";

    div.append(meta, body);
    el.messages.appendChild(div);
    if (scroll) {
      el.messages.scrollTop = el.messages.scrollHeight;
    }
  }

  function renderHistory(messages) {
    el.messages.innerHTML = "";
    seenIds.clear();
    if (!messages || !messages.length) {
      const p = document.createElement("p");
      p.className = "empty-hint";
      p.textContent = "Пока тихо. Напишите мастеру первое сообщение.";
      el.messages.appendChild(p);
      return;
    }
    for (const m of messages) appendMessage(m, { scroll: false });
    el.messages.scrollTop = el.messages.scrollHeight;
  }

  async function api(path, opts = {}) {
    const res = await fetch(`${API}${path}`, {
      credentials: "include",
      headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
      ...opts,
    });
    let data = null;
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      try {
        data = await res.json();
      } catch {
        data = null;
      }
    }
    if (!res.ok) {
      const detail = (data && (data.detail || data.error)) || res.statusText;
      const err = new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
      err.status = res.status;
      err.retryAfter = res.headers.get("Retry-After");
      throw err;
    }
    return data;
  }

  function closeSSE() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    sseConnecting = false;
    if (es) {
      es.close();
      es = null;
    }
  }

  function lastSeenId() {
    const ids = [...seenIds].filter((id) => id && !String(id).startsWith("err-"));
    return ids.length ? ids[ids.length - 1] : "";
  }

  async function mergeHistory() {
    if (!seat) return;
    const after = lastSeenId();
    const q = after
      ? `/history?n=200&after=${encodeURIComponent(after)}`
      : "/history?n=100";
    try {
      const hist = await api(q);
      for (const m of hist.messages || []) appendMessage(m, { scroll: true });
    } catch {
      /* ignore; next reconnect retries */
    }
  }

  function flashTyping() {
    setStatus("typing", "мастер печатает…");
    if (typingTimer) clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
      if (es && es.readyState === EventSource.OPEN) setStatus("online", "онлайн");
    }, 2500);
  }

  function connectSSE() {
    if (!seat) return;
    if (es && (es.readyState === EventSource.OPEN || es.readyState === EventSource.CONNECTING)) {
      return;
    }
    if (sseConnecting) return;
    sseConnecting = true;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (es) {
      es.close();
      es = null;
    }
    setStatus("offline", "подключение…");
    es = new EventSource(`${API}/events`, { withCredentials: true });

    es.onopen = () => {
      sseConnecting = false;
      reconnectDelay = 1500;
      setStatus("online", "онлайн");
      mergeHistory();
      loadPlayerStatus();
      refreshEventsBadge();
    };

    es.onerror = () => {
      sseConnecting = false;
      setStatus("offline", "офлайн");
      if (es) {
        es.close();
        es = null;
      }
      if (!seat) return;
      if (reconnectTimer) return;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connectSSE();
      }, reconnectDelay);
      reconnectDelay = Math.min(RECONNECT_MAX_MS, Math.floor(reconnectDelay * 1.8));
    };

    es.onmessage = (ev) => {
      if (!ev.data) return;
      let payload;
      try {
        payload = JSON.parse(ev.data);
      } catch {
        return;
      }
      const type = payload.type || "";
      if (type === "connected") {
        setStatus("online", "онлайн");
        return;
      }
      if (type === "typing") {
        flashTyping();
        return;
      }
      if (type === "message" && payload.message) {
        const m = payload.message;
        if (roleClass(m.role) === "master") flashTyping();
        appendMessage(m);
        return;
      }
      if (payload.text && (payload.role || payload.messageId)) {
        appendMessage(payload);
      }
    };
  }

  function showChat() {
    el.loginPanel.hidden = true;
    el.chatPanel.hidden = false;
    if (el.btnLogout) el.btnLogout.hidden = false;
    // P0: Events live in chip row above chat — keep rail duplicate hidden
    if (el.btnEvents) {
      el.btnEvents.hidden = true;
      el.btnEvents.setAttribute("aria-hidden", "true");
    }
    if (seat) {
      el.seatLabel.textContent = `${seat.run} · ${seat.player}`;
      updateDashLink(seat.run, seat.player);
      renderContextStrip({ run: seat.run, player: seat.player });
      loadPlayerStatus();
      refreshEventsBadge();
      startStatusPoll();
    }
  }

  function showLogin() {
    el.loginPanel.hidden = false;
    el.chatPanel.hidden = true;
    if (el.btnLogout) el.btnLogout.hidden = true;
    if (el.btnEvents) {
      el.btnEvents.hidden = true;
      el.btnEvents.setAttribute("aria-hidden", "true");
    }
    closeStatusPanels();
    closeMorePanel();
    stopStatusPoll();
    if (el.ctxSeat) el.ctxSeat.textContent = "";
    if (el.ctxPhase) el.ctxPhase.textContent = "";
    el.seatLabel.textContent = "войдите, чтобы продолжить";
    setStatus("offline", "офлайн");
    updateDashLink(null, null);
    if (el.linkDash) el.linkDash.href = "/player.html";
  }

  async function enterRoom(run, player) {
    seat = { run, player };
    showChat();
    const hist = await api("/history?n=100");
    renderHistory(hist.messages || []);
    connectSSE();
  }

  async function tryRestore() {
    try {
      const me = await api("/me");
      await enterRoom(me.run, me.player);
    } catch {
      seat = null;
      showLogin();
    }
  }

  el.loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    showLoginError("");
    const run = el.inpRun.value.trim();
    const player = el.inpPlayer.value.trim();
    const token = el.inpToken.value;
    const btn = el.loginForm.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      await api("/login", {
        method: "POST",
        body: JSON.stringify({ run, player, token }),
      });
      el.inpToken.value = "";
      saveLoginPrefs(run, player);
      await enterRoom(run, player);
    } catch (err) {
      showLoginError(err.message || "не удалось войти");
      showLogin();
    } finally {
      btn.disabled = false;
    }
  });

  el.sendForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = el.inpText.value.trim();
    if (!text) return;
    const btn = el.sendForm.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      const res = await api("/send", {
        method: "POST",
        body: JSON.stringify({ text }),
      });
      el.inpText.value = "";
      if (res && res.message) appendMessage(res.message);
    } catch (err) {
      if (err.status === 401) {
        closeSSE();
        seat = null;
        showLogin();
        showLoginError("сессия истекла — войдите снова");
      } else if (err.status === 429) {
        const wait = err.retryAfter ? ` Подождите ${err.retryAfter} с.` : "";
        appendMessage({
          role: "system",
          text: `Слишком часто. Сообщение не отправлено.${wait}`,
          ts: new Date().toISOString(),
          messageId: `err-429-${Date.now()}`,
        });
      } else {
        appendMessage({
          role: "system",
          text: `Ошибка отправки: ${err.message || "unknown"}`,
          ts: new Date().toISOString(),
          messageId: `err-${Date.now()}`,
        });
      }
    } finally {
      btn.disabled = false;
      el.inpText.focus();
    }
  });

  el.inpText.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      el.sendForm.requestSubmit();
    }
  });

  el.btnLogout.addEventListener("click", async () => {
    closeStatusPanels();
    closeMorePanel();
    closeSSE();
    try {
      await api("/logout", { method: "POST", body: "{}" });
    } catch {
      /* ignore */
    }
    seat = null;
    seenIds.clear();
    el.messages.innerHTML = "";
    showLogin();
  });

  if (el.btnEvents) {
    el.btnEvents.addEventListener("click", () => {
      openEventsPanel();
      if (el.rail && el.rail.classList.contains("open")) {
        el.rail.classList.remove("open");
        if (el.btnRailToggle) el.btnRailToggle.setAttribute("aria-expanded", "false");
      }
    });
  }
  if (el.btnEventsClose) {
    el.btnEventsClose.addEventListener("click", closeEventsPanel);
  }
  if (el.btnEventsRefresh) {
    el.btnEventsRefresh.addEventListener("click", () => {
      loadEventsPanel({ showLoading: false });
    });
  }
  if (el.eventsOverlay) {
    el.eventsOverlay.addEventListener("click", (e) => {
      if (e.target === el.eventsOverlay) closeEventsPanel();
    });
  }
  if (el.btnMoneyClose) {
    el.btnMoneyClose.addEventListener("click", closeMoneyPanel);
  }
  if (el.btnMoneyRefresh) {
    el.btnMoneyRefresh.addEventListener("click", () => {
      loadMoneyPanel({ showLoading: false });
    });
  }
  if (el.moneyOverlay) {
    el.moneyOverlay.addEventListener("click", (e) => {
      if (e.target === el.moneyOverlay) closeMoneyPanel();
    });
  }
  if (el.btnHeroClose) {
    el.btnHeroClose.addEventListener("click", closeHeroPanel);
  }
  if (el.btnHeroRefresh) {
    el.btnHeroRefresh.addEventListener("click", () => {
      loadHeroPanel({ showLoading: false });
    });
  }
  if (el.heroOverlay) {
    el.heroOverlay.addEventListener("click", (e) => {
      if (e.target === el.heroOverlay) closeHeroPanel();
    });
  }

  if (el.btnRailToggle && el.rail) {
    el.btnRailToggle.addEventListener("click", () => {
      const open = el.rail.classList.toggle("open");
      el.btnRailToggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }

  if (el.chipEvents) {
    el.chipEvents.addEventListener("click", () => {
      openEventsPanel();
    });
  }
  if (el.chipTreasury) {
    el.chipTreasury.addEventListener("click", () => {
      openMoneyPanel();
    });
  }
  if (el.chipHero) {
    el.chipHero.addEventListener("click", () => {
      openHeroPanel();
    });
  }
  if (el.chipMore) {
    el.chipMore.addEventListener("click", () => {
      closeStatusPanels();
      openMorePanel();
    });
  }
  if (el.btnMoreClose) {
    el.btnMoreClose.addEventListener("click", closeMorePanel);
  }
  if (el.moreOverlay) {
    el.moreOverlay.addEventListener("click", (e) => {
      if (e.target === el.moreOverlay) closeMorePanel();
    });
  }

  document.querySelectorAll(".more-tile[data-panel]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.getAttribute("data-panel");
      const def = EXTRA_PANEL_DEFS[key];
      if (!def) return;
      openGenericPanel(key, def);
    });
  });

  if (el.btnPanelClose) {
    el.btnPanelClose.addEventListener("click", closePanelOverlay);
  }
  if (el.btnPanelRefresh && el.panelBody) {
    el.btnPanelRefresh.addEventListener("click", () => {
      if (activePanel) loadGenericPanel(activePanel, { showLoading: false });
    });
  }
  if (el.btnPanelBack) {
    el.btnPanelBack.addEventListener("click", () => {
      if (!panelBack) return;
      openGenericPanel(panelBack.key, { ...panelBack, back: null });
    });
  }
  if (el.panelOverlay) {
    el.panelOverlay.addEventListener("click", (e) => {
      if (e.target === el.panelOverlay) closePanelOverlay();
    });
  }

  const _escapeHandler = (e) => {
    if (e.key !== "Escape") return;
    if (el.panelOverlay && !el.panelOverlay.hidden) {
      closePanelOverlay();
      return;
    }
    if (el.moreOverlay && !el.moreOverlay.hidden) {
      closeMorePanel();
      return;
    }
    if (el.moneyOverlay && !el.moneyOverlay.hidden) {
      closeMoneyPanel();
      return;
    }
    if (el.heroOverlay && !el.heroOverlay.hidden) {
      closeHeroPanel();
      return;
    }
    if (el.eventsOverlay && !el.eventsOverlay.hidden) {
      closeEventsPanel();
    }
  };
  document.addEventListener("keydown", _escapeHandler);

  loadLoginPrefs();
  tryRestore();
})();

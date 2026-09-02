/* ============================================================
 * Twilights miniapp — SHARED CORE (plain <script>, NOT an ES module)
 * ------------------------------------------------------------
 * Load BEFORE the per-game <script> on every game page:
 *   <script src="https://telegram.org/js/telegram-web-app.js"></script>
 *   <script src="/shared/core.js"></script>
 *   <script> ...game code... </script>
 *
 * Every top-level const/let/function below is a page-global and is
 * directly callable from the game <script> that follows.
 *
 * Extracted verbatim (logic unchanged) from the monolithic index.html.
 * ============================================================ */

/* ---- Telegram WebApp bootstrap ---- */
const tg = window.Telegram.WebApp;
tg.ready(); tg.expand();

// Block browser-level pinch zoom — Telegram WebView ignores user-scalable=no
document.addEventListener('touchstart', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
document.addEventListener('touchmove',  (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });

/* ---- gameData decode (base64 ?data= param) + replay lock ---- */
let gameData = {};
let _gameKey = null;
try {
  const raw = new URLSearchParams(window.location.search).get('data');
  if (raw) {
    const bytes = Uint8Array.from(atob(raw), c => c.charCodeAt(0));
    gameData = JSON.parse(new TextDecoder('utf-8').decode(bytes));
    _gameKey = 'twi_played_' + raw;
  }
} catch (e) {}

// Блокировка повторного прохождения (в т.ч. через обновление страницы)
if (_gameKey && localStorage.getItem(_gameKey)) {
  const _sub = document.getElementById('subtitle');
  if (_sub) _sub.textContent = '';
  const _h1 = document.querySelector('h1');
  if (_h1) _h1.textContent = '⚔️ Twilights';
  document.body.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;padding:20px;text-align:center;font-family:-apple-system,sans-serif;background:var(--tg-theme-bg-color,#1a1a2e);color:var(--tg-theme-text-color,#eee)"><div style="font-size:3rem;margin-bottom:16px">🔒</div><h2 style="margin-bottom:10px">Игра уже сыграна</h2><p style="color:var(--tg-theme-hint-color,#aaa);font-size:0.9rem">Результат уже был отправлен.<br>Повторное прохождение недоступно.</p></div>';
  throw new Error('already_played');
}
// Ставим метку сразу при старте — любое обновление страницы покажет экран блокировки
if (_gameKey) { try { localStorage.setItem(_gameKey, '1'); } catch (e) {} }

/* ---- current game key + subtitle map ---- */
const game = gameData.game || 'blackjack';
const _subtitles = { blackjack: 'Игра в 21', timing: 'Тайминг', compare: 'Сравнение', findall: 'Найди все', memory: 'Пары', oddone: 'Лишний', reaction: 'Реакция', sorting: 'Порядок', estimate: 'Оцени число', card: 'Карточный бой', hex: 'Тактический бой', arkanoid: 'Арканоид', match3fight: 'Бой 3-в-ряд', lockpick: 'Отмычка', balance: 'Баланс', 'trace-path': 'Тропа', rhythm: 'Ритм', whisper: 'Шёпот', 'spot-diff': 'Отличия', stack: 'Башня', pour: 'Налей', knot: 'Узел', cipher: 'Шифр', weights: 'Весы', route: 'Маршрут', bargain: 'Торг', track: 'След', 'herb-sort': 'Травы', 'duel-parry': 'Парирование', volley: 'Залп', clash: 'Столкновение', 'summon-hold': 'Круг', 'shield-wall': 'Щитовая', 'sigil-draw': 'Сигил', 'focus-orb': 'Сфера', 'mirror-cast': 'Зеркало', 'alchemy-boil': 'Варево', isoarena: 'Арена' };
(function () {
  const el = document.getElementById('subtitle');
  if (el) el.textContent = _subtitles[game] || 'Выбор';
})();

/* ---- result delivery: финальный экран исхода + кнопка «Закрыть» ----
 * tg.sendData() САМ закрывает мини-апп, поэтому отправку откладываем до нажатия
 * кнопки: игрок сначала видит финальный экран с исходом (по HP / таймеру / раундам —
 * не важно), затем сам закрывает — и в этот момент результат уходит боту.
 * Раньше sendResultToBot закрывал мгновенно (tg.sendData+close), исход мелькал.
 *
 * Web return (gameData.return === 'web'): POST /api/room/miniapp-result +
 * кнопка «Вернуться в чат» → /room/. TG path unchanged when return !== 'web'. */
let _finalShown = false;
let _webResultPosted = false;

function _isWebReturn() {
  return gameData && gameData.return === 'web';
}

function _miniappResultEndpoints() {
  const paths = ['/api/room/miniapp-result'];
  try {
    if (location.origin && location.origin.indexOf('loreworlds') === -1) {
      paths.push('https://loreworlds.ru:8443/api/room/miniapp-result');
    }
  } catch (e) {}
  return paths;
}

async function _postWebResult(result) {
  if (_webResultPosted) return true;
  const token = gameData.result_token;
  if (!token) throw new Error('missing result_token');
  const body = JSON.stringify({ result_token: token, result: result });
  let lastErr = null;
  for (const url of _miniappResultEndpoints()) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body,
      });
      if (res.ok) {
        _webResultPosted = true;
        return true;
      }
      lastErr = new Error('HTTP ' + res.status);
      // 409 = already consumed — treat as success for UX
      if (res.status === 409) {
        _webResultPosted = true;
        return true;
      }
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('post failed');
}

function _deliverResult(result) {
  if (_isWebReturn()) {
    const btn = document.getElementById('twi-fin-close');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Отправка…';
    }
    _postWebResult(result)
      .then(() => {
        try { location.href = '/room/'; } catch (e) {
          if (btn) { btn.disabled = false; btn.textContent = 'Вернуться в чат'; }
        }
      })
      .catch((e) => {
        console.error('[web-result]', e);
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Повторить / в чат';
          btn.onclick = () => {
            try { location.href = '/room/'; } catch (err) {}
          };
        }
      });
    return;
  }
  // Корреляционный ключ запуска: возвращаем nonce из gameData как есть — так
  // launch-лог (вход) и result-лог (выход) джойнятся 1:1, без угадывания по времени.
  try { tg.sendData(JSON.stringify(result)); } catch (e) {}
  try { tg.close(); } catch (e) {}
}

const _RESULT_LABELS = {
  score: 'Счёт', correct: 'Верно', total: 'Всего', found: 'Найдено',
  wrongTaps: 'Ошибок', hits: 'Попаданий', misses: 'Промахов', falseAlarms: 'Ложных',
  lives: 'Жизней', stage: 'Этап', level: 'Уровень', avgAccuracy: 'Точность',
  timeSpent: 'Время', turns: 'Ходов', rounds: 'Раундов', max_rounds: 'Макс. раундов',
  cards_played: 'Карт сыграно', player_hp_remaining: 'HP героя', player_max_hp: 'Макс. HP',
  enemies_total: 'Врагов', enemies_defeated: 'Повержено', enemies_hp_remaining: 'HP врагов',
  enemies_max_hp: 'Макс. HP врагов', damage_dealt: 'Урон нанесён', damage_taken: 'Урон получен',
  lowest_hp: 'Мин. HP', position: 'Позиция', player_units_alive: 'Юнитов живо',
  player_units_total: 'Юнитов всего', hero_hp: 'HP героя', hero_hp_max: 'Макс. HP',
  abilities_used: 'Способностей', total_damage_dealt: 'Урон нанесён',
  total_damage_taken: 'Урон получен', effectiveFound: 'Найдено (зачёт)', avgAccuracy_: 'Точность',
  rune: 'Руна', difficulty: 'Сложность', shards: 'Осколков', placed: 'Собрано', fraction: 'Доля',
};
const _RESULT_SKIP = new Set(['game', 'nonce', 'chat_id', 'source_chat_id', 'win', 'outcome',
  'scene_end', 'scene_revisit', 'seed', 'reason', 'generated', 'guesses', 'actuals', 'text', 'choice']);

function _resultStatRows(result) {
  const rows = [];
  for (const k in result) {
    if (!Object.prototype.hasOwnProperty.call(result, k)) continue;
    if (_RESULT_SKIP.has(k)) continue;
    const v = result[k];
    if (v === null || v === undefined || v === '') continue;
    if (typeof v === 'object' || typeof v === 'boolean') continue;
    let val = v;
    if (k === 'timeSpent') val = v + ' с';
    else if (k === 'avgAccuracy') val = v + '%';
    else if (k === 'fraction') val = Math.round(v * 100) + '%';
    rows.push([_RESULT_LABELS[k] || k, val]);
  }
  return rows;
}

function _escHtml(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function _showFinalScreen(result) {
  if (_finalShown) return;
  _finalShown = true;

  let icon = '🏁';
  if (result.scene_end) icon = '⏳';
  else if (result.win === true) icon = '✅';
  else if (result.win === false) icon = '❌';

  const title = result.outcome || result.text ||
    (result.win === true ? 'Победа' : result.win === false ? 'Поражение' : 'Игра завершена');

  const rows = _resultStatRows(result);
  const statsHtml = rows.length
    ? '<div class="twi-fin-stats">' + rows.map(([l, v]) =>
        `<div class="twi-fin-row"><span>${_escHtml(l)}</span><span>${_escHtml(v)}</span></div>`).join('') + '</div>'
    : '';
  const subHtml = result.reason ? `<div class="twi-fin-sub">${_escHtml(result.reason)}</div>` : '';

  if (!document.getElementById('twi-final-css')) {
    const st = document.createElement('style');
    st.id = 'twi-final-css';
    st.textContent =
      `.twi-final{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;background:var(--tg-theme-bg-color,#1a1a2e);color:var(--tg-theme-text-color,#eee);font-family:-apple-system,sans-serif}` +
      `.twi-fin-card{width:100%;max-width:360px;text-align:center}` +
      `.twi-fin-icon{font-size:4rem;line-height:1;margin-bottom:12px}` +
      `.twi-fin-title{font-size:1.6rem;font-weight:700;margin-bottom:6px}` +
      `.twi-fin-sub{font-size:.95rem;color:var(--tg-theme-hint-color,#aaa);margin-bottom:6px}` +
      `.twi-fin-stats{background:rgba(255,255,255,.06);border-radius:12px;padding:6px 14px;margin:14px 0}` +
      `.twi-fin-row{display:flex;justify-content:space-between;gap:12px;padding:6px 0;font-size:.95rem;border-bottom:1px solid rgba(255,255,255,.06)}` +
      `.twi-fin-row:last-child{border-bottom:none}` +
      `.twi-fin-row span:first-child{color:var(--tg-theme-hint-color,#aaa)}` +
      `.twi-fin-row span:last-child{font-weight:600}` +
      `.twi-fin-btn{width:100%;margin-top:18px;padding:14px;border:none;border-radius:12px;font-size:1.05rem;font-weight:600;cursor:pointer;background:var(--tg-theme-button-color,#5288c1);color:var(--tg-theme-button-text-color,#fff)}`;
    document.head.appendChild(st);
  }

  const closeLabel = _isWebReturn() ? 'Вернуться в чат' : 'Закрыть';
  const ov = document.createElement('div');
  ov.className = 'twi-final';
  ov.innerHTML =
    `<div class="twi-fin-card">` +
    `<div class="twi-fin-icon">${icon}</div>` +
    `<div class="twi-fin-title">${_escHtml(title)}</div>` +
    subHtml + statsHtml +
    `<button id="twi-fin-close" class="twi-fin-btn">${closeLabel}</button>` +
    `</div>`;
  document.body.appendChild(ov);
  document.getElementById('twi-fin-close').addEventListener('click', () => _deliverResult(result));
}

function sendResultToBot(result) {
  if (gameData.chat_id) result.source_chat_id = gameData.chat_id;
  if (gameData.nonce && result.nonce == null) result.nonce = gameData.nonce;
  try { _showFinalScreen(result); }
  catch (e) { _deliverResult(result); }
}

/* ---- seeded PRNG (mulberry32) + global rng + shuffle ---- */
// Детерминированный shuffle при наличии gameData.seed; иначе Math.random.
function makePRNG(seed) {
  let s = seed >>> 0;
  return () => {
    s = s + 0x9e3779b9 | 0;
    let t = s ^ s >>> 16;
    t = Math.imul(t, 0x21f0aaad);
    t = t ^ t >>> 15;
    t = Math.imul(t, 0x735a2d97);
    return ((t ^ t >>> 15) >>> 0) / 4294967296;
  };
}
const rng = gameData.seed ? makePRNG(gameData.seed) : () => Math.random();

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) { const j = rng() * i | 0; [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return arr;
}

/* ---- shared gem palette (match3 + match3fight) ---- */
const M3_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#a29bfe'];

/* ---- shared countdown timer ---- */
// startGameTimer({seconds, onExpire, warnAt})
//   seconds  – total duration (integer)
//   onExpire – called once when clock hits 0
//   warnAt   – seconds remaining when bar turns warning-color (default 10)
// stopGameTimer() – cancels the timer (call from finish / game-over path)
let _timerRaf = null;
let _timerExpired = false;

function startGameTimer({ seconds, onExpire, warnAt = 10 } = {}) {
  stopGameTimer(); // idempotent: cancel any previous run
  if (_finalShown) return; // replay-lock / final screen already visible — do nothing
  _timerExpired = false;

  const total = seconds * 1000;
  const start = performance.now();

  if (!document.getElementById('twi-timer-hud')) {
    const style = document.createElement('style');
    style.id = 'twi-timer-css';
    style.textContent =
      `#twi-timer-hud{position:fixed;top:0;left:0;right:0;z-index:9000;pointer-events:none;` +
        `padding-top:var(--tg-content-safe-area-inset-top,0px);background:linear-gradient(180deg,rgba(0,0,0,.28),rgba(0,0,0,0))}` +
      `#twi-timer-bar-wrap{height:8px;width:100%;background:rgba(255,255,255,.22)}` +
      `#twi-timer-bar{height:100%;width:100%;background:var(--tg-theme-button-color,#6c5ce7);transition:background .4s}` +
      `#twi-timer-bar.warn{background:#e7963c}` +
      `#twi-timer-bar.critical{background:#e74c3c}` +
      `#twi-timer-num{text-align:right;font-size:.82rem;font-weight:700;padding:3px 10px 0;` +
        `color:var(--tg-theme-text-color,#e8e0ff);letter-spacing:.03em}` +
      `#twi-timer-num.warn{color:#e7963c}#twi-timer-num.critical{color:#e74c3c}`;
    document.head.appendChild(style);

    const hud = document.createElement('div');
    hud.id = 'twi-timer-hud';
    hud.innerHTML =
      `<div id="twi-timer-bar-wrap"><div id="twi-timer-bar"></div></div>` +
      `<div id="twi-timer-num"></div>`;
    document.body.prepend(hud);
  }

  const hudEl = document.getElementById('twi-timer-hud');
  if (hudEl) hudEl.style.opacity = '1';
  const barEl = document.getElementById('twi-timer-bar');
  const numEl = document.getElementById('twi-timer-num');

  function _tick(now) {
    if (_timerExpired) return;
    const elapsed = now - start;
    const remaining = Math.max(0, total - elapsed);
    const secsLeft = Math.ceil(remaining / 1000);
    const pct = (remaining / total) * 100;

    barEl.style.width = pct + '%';
    numEl.textContent = secsLeft + ' с';

    const isCrit = secsLeft <= Math.max(3, warnAt / 2);
    const isWarn = secsLeft <= warnAt;
    barEl.className = isCrit ? 'critical' : isWarn ? 'warn' : '';
    numEl.className = isCrit ? 'critical' : isWarn ? 'warn' : '';

    if (remaining > 0 && !_finalShown) {
      _timerRaf = requestAnimationFrame(_tick);
    } else if (remaining <= 0 && !_timerExpired && !_finalShown) {
      _timerExpired = true;
      barEl.style.width = '0%';
      try { onExpire(); } catch (e) { console.error('[timer] onExpire threw:', e); }
    }
  }

  _timerRaf = requestAnimationFrame(_tick);
}

function stopGameTimer() {
  if (_timerRaf) { cancelAnimationFrame(_timerRaf); _timerRaf = null; }
  _timerExpired = true;
  const hud = document.getElementById('twi-timer-hud');
  if (hud) hud.style.opacity = '0';
}

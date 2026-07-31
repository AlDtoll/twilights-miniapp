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
const _subtitles = { blackjack: 'Игра в 21', timing: 'Тайминг', compare: 'Сравнение', findall: 'Найди все', memory: 'Пары', oddone: 'Лишний', reaction: 'Реакция', sorting: 'Порядок', estimate: 'Оцени число', card: 'Карточный бой', hex: 'Тактический бой', arkanoid: 'Арканоид', match3fight: 'Бой 3-в-ряд', lockpick: 'Отмычка', balance: 'Баланс', 'trace-path': 'Тропа', rhythm: 'Ритм', whisper: 'Шёпот', 'spot-diff': 'Отличия', stack: 'Башня', pour: 'Налей', knot: 'Узел', cipher: 'Шифр', weights: 'Весы', route: 'Маршрут', bargain: 'Торг', track: 'След', 'herb-sort': 'Травы', 'duel-parry': 'Парирование', volley: 'Залп', clash: 'Столкновение', 'summon-hold': 'Круг', 'shield-wall': 'Щитовая', 'sigil-draw': 'Сигил', 'focus-orb': 'Сфера', 'mirror-cast': 'Зеркало', 'alchemy-boil': 'Варево' };
(function () {
  const el = document.getElementById('subtitle');
  if (el) el.textContent = _subtitles[game] || 'Выбор';
})();

/* ---- result delivery: tg.sendData + close ---- */
function sendResultToBot(result) {
  if (gameData.chat_id) result.source_chat_id = gameData.chat_id;
  // Корреляционный ключ запуска: возвращаем nonce из gameData как есть — так
  // launch-лог (вход) и result-лог (выход) джойнятся 1:1, без угадывания по времени.
  if (gameData.nonce && result.nonce == null) result.nonce = gameData.nonce;
  try { tg.sendData(JSON.stringify(result)); tg.close(); }
  catch (e) {
    document.body.innerHTML = `<div style="padding:20px;font-family:sans-serif;background:#1a1a2e;color:#eee;min-height:100vh"><h2>Результат</h2><pre style="background:rgba(255,255,255,0.1);padding:12px;border-radius:8px;overflow-x:auto;font-size:0.8rem">${JSON.stringify(result, null, 2)}</pre></div>`;
  }
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

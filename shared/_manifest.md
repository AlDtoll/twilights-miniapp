# Twilights miniapp — extraction manifest

Source of truth: `/home/claudeuser/twilights-miniapp/index.html` (DO NOT MODIFY — stays as working fallback).
Split target (Option A, per-game pages, plain `<script>` tags, no bundler):

```
/shared/core.js       — page-globals (this layer, DONE)
/shared/styles.css    — shared CSS (this layer, DONE)
/<game>/index.html    — one self-contained page per game
```

Page load order (every game page):
```html
<script src="https://telegram.org/js/telegram-web-app.js"></script>
<link  rel="stylesheet" href="/shared/styles.css">
<script src="/shared/core.js"></script>
<!-- then game-specific CSS in <style> and game JS in <script> -->
```

## SHARED LAYER (already created)

### /shared/core.js — page-globals visible to game `<script>`
- `tg` — `window.Telegram.WebApp`; `tg.ready()`, `tg.expand()` called; pinch-zoom blockers installed.
- `gameData` (object) + `_gameKey` — base64 `?data=` decode; replay-lock screen (`throw 'already_played'`).
- `game` (string, default `'choice'`), `_subtitles` map, auto-sets `#subtitle` text if present.
- `sendResultToBot(result)` — injects `source_chat_id`, `tg.sendData(JSON)` + `tg.close()`, fallback dump.
- `makePRNG(seed)` (mulberry32), `rng` (seeded if `gameData.seed`, else `Math.random`), `shuffle(arr)`.
- `M3_COLORS` — 5-color gem palette (match3 + match3fight base palette).

### /shared/styles.css — shared CSS rules
`* {reset}`, `body`, `h1`, `.subtitle`, `.btn`/`.btn-primary`/`.btn-secondary`, `.confirm-btn`(+`:disabled`),
`.result-banner`/`.result-good`/`.result-mid`/`.result-bad`, `.combat-log` (reused by combat + match3fight).

### Shared HTML shell each page must include
```html
<h1>⚔️ Twilights</h1>
<p class="subtitle" id="subtitle">Загрузка...</p>
```
(core.js reads `#subtitle` and `h1`; both optional but expected.)

---

## GAME: hex  (game key: `'hex'`)
Source span in index.html: **lines 3210–6509** (`// ---- HEX GAME (FFT-style) ----`).
HTML container span: **lines 688–731**.

### HTML container(s)
- Root: `<div id="hx-battle">` (one block, lines 688–731). Self-contained; contains all hex DOM.
- Child element ids (all live inside `#hx-battle`): `hx-intro-overlay`, `hx-intro-hero`, `hx-intro-name`,
  `hx-intro-stats`, `hx-intro-abilities`, `hx-intro-legend`, `hx-intro-btn`, `hx-turn-label`, `hx-summary`,
  `hx-svg-wrap`, `hx-svg`, `hx-log`, `hx-info`, `hx-info-name`, `hx-info-stats`, `hx-info-status`,
  `hx-ability-panel`, `hx-ability-row`, `hx-unit-status-bar`, `hx-skip-btn`, `hx-end-btn`.
- Tooltip element `#hx-ability-tooltip` is created at runtime (CSS for it exists in the hex style block).
- Inline `onclick`s in markup: `hxZoomAdjust(-0.15)`, `hxZoomAdjust(0.15)`, `hxSkipUnit()`, `hxEndTurn()`,
  and the intro/legend close button (inline `display='none'`).

### CSS selectors OWNED by hex (move to /hex page only)
Prefixes / exact selectors (index.html lines 397–478):
- `#hx-battle`, `#hx-battle *`, `#hx-svg`, `#hx-svg text`
- `.hx-log`, `.hx-log::-webkit-scrollbar`, `.hx-log::-webkit-scrollbar-thumb`,
  `.hx-log-attack`, `.hx-log-heal`, `.hx-log-special`, `.hx-log-info`
- `.hx-info`, `.hx-info-main`, `.hx-info-flavor`
- `.hx-actions`, `.hx-end-btn`, `.hx-skip-btn`, `.hx-skip-btn:disabled`
- `.hx-turn-label`, `.hx-turn-label.player-turn`, `.hx-turn-label.enemy-turn`
- `#hx-summary`
- `#hx-ability-panel` (+ `::-webkit-scrollbar`, `::-webkit-scrollbar-thumb`), `.hx-ability-row`
- `.hx-ability-btn` (+ `:active`, `:disabled`, `.active`, `.move-btn`, `.move-btn.active`, position:relative)
- `.hx-ability-icon`, `.hx-ability-name`, `.hx-ability-cd`, `.hx-ability-cd.ready`
- `.cd-badge`
- `.hx-ability-type-melee|ranged|magic|heal|summon|debuff`
- `.hx-ab-tier`, `.hx-ab-tier.mid`, `.hx-ab-tier.strong`, `.hx-ab-ap`, `.hx-ab-dmg`
- `@keyframes hxFlash`, `@keyframes hxPulse`
- `#hx-ability-tooltip` (+ `.tip-name`, `.tip-row`, `.tip-effect`, `.tip-cd-ready`, `.tip-cd-wait`)
- `#hx-unit-status-bar`
NOTE: hex uses NO shared `.confirm-btn` / `.btn` (its buttons are `.hx-*` or inline-styled).

### JS globals OWNED by hex (top-level consts/lets)
- Constants: `HEX_COLS`, `HEX_ROWS`, `HEX_SIZE`, `_HEX_W`, `HEX_SVG_W`, `HEX_SVG_H`,
  `HX_WEAPON_ABILITIES`, `HX_MAGIC_ABILITIES`, `HEX_UNIT_DEFS`.
- Mutable state: `hxs` (master game-state object), `_hxTooltipTimer`,
  `_hxZoomLevel`, `_hxPanX`, `_hxPanY`, `_hxPinchDist0`, `_hxPinchLevel0`, `_hxPinchInited`.

### JS functions OWNED by hex (prefix `hx`/`_hx`)
`hxAbilityDamage`, `hxBuildHeroAbilities`, `hxObstAt`, `hxCountFlankers`, `hxIsInEnemyZoC`,
`hxLoSBlocked`, `hxDamageObstacle`, `hxAbilityTargets`, `hxConfirmApplyBtn`, `hxConfirmApply`,
`hxApplySchoolCooldown`, `hxAbilityAP`, `hxMarkActed`, `hxAbilityAccAt`, `hxCalcHitChance`,
`hxDealDamage`, `hxDistDmgMult`, `hxLegacyEffects`, `hxEvalEffectCond`, `hxEffectDefaultTo`,
`hxApplyAbility`, `hxApplyAbilityFx`, `hxApplyRiderEffect`, `hxDelay`, `hxFlashHex`,
`hxPickEnemyAbility`, `hxTickCooldowns`, `hxRefreshBlock`, `hxLog`, `hxRender`,
`hxShowAbilityTooltip`, `hxHideAbilityTooltip`, `hxAttachAbilityTooltip`, `hxUpdateStatusBar`,
`hxSelectMoveMode`, `hxSelectAbility`, `hxClickUnit`, `hxClickHex`, `hxTerrainEmojiAt`,
`hxTerrainDescAt`, `hxTerrainInfoAt`, `hxSkipUnit`, `_hxApplyZoom`, `hxZoomAdjust`,
`hxInitPinchZoom`, `hxEndTurn`, `initHex`.

### Init entry function
`initHex()` (index.html line 6176). In monolith dispatched via `setTimeout(initHex, 0)`.
On the hex page call it after DOM + core.js are ready, e.g. `setTimeout(initHex, 0)`.
`initHex()` shows `#hx-battle`, HIDES the shared `h1`/`#subtitle`, retunes `body` padding,
reads `gameData.hero` / `gameData.companions` / `gameData.player_units` / `gameData.enemy_units`.

### Shared deps used by hex
`gameData` (12×), `sendResultToBot` (1×). Does NOT use `rng`/`shuffle`/`M3_COLORS`.

---

## GAME: match3fight  (game key: `'match3fight'`)
Source span in index.html: **lines 6510–7874** (`// ---- MATCH3 FIGHT (game:'match3fight') ----`).
HTML container span: **lines 763–772**.

### HTML container(s)
- Root: `<div id="m3f-game">` (lines 763–772). Self-contained.
- Child element ids: `m3f-enemy`, `m3f-stocks`, `m3f-board`, `m3f-hero`, `m3f-hands`,
  `m3f-endturn`, `m3f-log`, `m3f-result`.
- `#m3f-log` carries class `combat-log` (shared); `#m3f-result` carries class `result-banner` (shared).
- Inline `onclick` in markup: `m3fEndTurn()`. The "Завершить ход" button uses shared `.btn .btn-primary`.

### CSS selectors OWNED by match3fight (move to /match3fight page only)
Prefix-based (index.html lines 261–297). All `.m3f-*` / `#m3f-game`:
- `#m3f-game`
- `.m3f-fighter`, `.m3f-fighter-head`, `.m3f-fighter-name`, `.m3f-fighter-hp-text`
- `.m3f-shield`, `.m3f-wounds`
- `.m3f-statuses`, `.m3f-status-chip`, `.m3f-status-chip.bad`
- `.m3f-resources`, `.m3f-res-chip`, `.m3f-info`
- `.m3f-stocks`, `.m3f-stock`, `.m3f-stock-dot`
- `.m3f-board`, `.m3f-cell`, `.m3f-cell.selected`, `.m3f-cell.removing`, `.m3f-cell.dead`,
  `.m3f-cell.m3f-special` (+ `::after`), `.m3f-cell.m3f-bonus`, `.m3f-cell.m3f-half`
- `.m3f-hands`, `.m3f-hand`, `.m3f-hand-label`, `.m3f-perks`, `.m3f-perk` (+ `:active`, `:disabled`),
  `.m3f-perk-name`, `.m3f-perk-cost`, `.m3f-perk-cost .m3f-stock-dot`, `.m3f-perk-desc`
USES shared: `.btn`/`.btn-primary` (end-turn button), `.combat-log` (#m3f-log), `.result-banner` (#m3f-result).

### JS globals OWNED by match3fight
- `M3F_SIZE` (8), `M3F_COLORS` (8-color palette), `m3f` (master state, `let m3f = null`).

### JS functions OWNED by match3fight (prefix `m3f`)
`m3fDemoScene`, `m3fLoadScene`, `m3fMkPerk`, `m3fMkStatus`, `m3fGem`, `m3fMkGemMeta`,
`m3fGemMatchesColor`, `m3fInitBoard`, `m3fRender`, `m3fClick`, `m3fCellColor`, `m3fCellMatchesColor`,
`m3fFindMatches`, `m3fFallAnim`, `m3fCascade`, `m3fRoll`, `m3fAddStock`, `m3fCheckStockPerks`,
`m3fAccumulateStocks`, `m3fFireCellTrigger`, `m3fRunMatchRules`, `m3fResolvePersons`, `m3fSourcePerson`,
`m3fStatusValue`, `m3fHasStatus`, `m3fResAmount`, `m3fSegmentParamValue`, `m3fFuncValue`,
`m3fConditionPersons`, `m3fConditionParamValue`, `m3fEvalConditionOne`, `m3fEvalCondition`,
`m3fCheckConditions`, `m3fApplyEffect`, `m3fApplyEffectUnit`, `m3fResetContactFlags`,
`m3fRunAdditionalEffects`, `m3fApplyEffectOnce`, `m3fAttack`, `m3fApplyTurnKeep`, `m3fApplyDamageKeep`,
`m3fTickStatuses`, `m3fIsStunned`, `m3fRunTimePerks`, `m3fStockDot`, `m3fPerkEnabled`, `m3fRenderHands`,
`m3fUsePerk`, `m3fEndTurn`, `m3fEnemyTurn`, `m3fStatusChips`, `m3fRenderFighter`, `m3fUpdateStocksUI`,
`m3fUpdateAllUI`, `m3fLog`, `m3fIsDefeated`, `m3fCheckEnd`, `m3fFinish`, `initM3F`.

### Init entry function
`initM3F()` (index.html line 7862). In monolith dispatched via `setTimeout(initM3F, 0)`.
Shows `#m3f-game`, sets `#subtitle` to 'Бой 3-в-ряд', then `m3fLoadScene` → `m3fInitBoard` →
`m3fRunTimePerks('hero')` → `m3fTickStatuses` → `m3fRender` → `m3fUpdateAllUI` → log → `m3fCheckEnd`.

### Shared deps used by match3fight
`gameData` (3×), `rng` (7×, e.g. `m3fGem`, `m3fRoll`), `sendResultToBot` (1×, in `m3fFinish`).
NOTE: match3fight does NOT reference `M3_COLORS` in code — the only mention (line 6515) is a comment.
It uses its OWN `M3F_COLORS` (8 entries). So `M3F_COLORS` stays local to the m3f page; `M3_COLORS`
in core.js exists for the `match3` game (which extracts later).

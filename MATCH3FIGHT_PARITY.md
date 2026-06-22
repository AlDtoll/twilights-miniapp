# Match3Fight Web Port — Prioritized Parity Report

Consolidated from five subsystem analyses. Deduplicated, grouped by subsystem, sorted by severity. Cross-subsystem duplicates (the same root cause reported from multiple angles — e.g. VAMP, DODGE, counterattacks, ARMOR double-roll, `times` non-consumption, resistance rounding) are merged into a single canonical entry under the most relevant subsystem, with the convergent findings noted.

---

## A. Status lifecycle (`times`, isActive) — foundational

These underlay many attack/condition/perk bugs; they are now implemented as the shared primitives the rest of the engine builds on.

> **Status (2026-06-22 re-audit): RESOLVED — full parity.** `m3fCompareValue` / `m3fIsActive` / `m3fDecreaseTimes` (index.html:508-525) port `Status.compareValue()`/`isActive()`/`decreaseTimes()`. `m3fIsWork` (1344) = `isActive() && roll(probability)` gates every combat-modifier application; the NEUTRAL set (508-510, `M3F_NEUTRAL_STATUS_TYPES` 502-505) matches Status.kt. No open A-items remain.

### RESOLVED

**A1. Status `times` counter — implemented**
- Android: `Status.times` consumed via `decreaseTimes()` at every use — WEAK, STRONG, VUL, ARMOR, EVASION, ACCURACY, CHANGE_DEFEND, STUN, DODGE, VAMP, COUNTERATTACK. `isActive()` treats `times<=0` as inactive.
- Web: `m3fMkStatus` reads `times` (index.html:490); `m3fDecreaseTimes` (522-525) consumes it; it is decremented at every consuming site in `m3fAttack` (WEAK/STRONG 1379-1380, VUL/ARMOR 1384-1385, EVASION 1408, ACCURACY 1411, SMART_DODGE/DODGE 1421/1427, VAMP 1483, COUNTERATTACK/HARM/REACTION 1506/1517) and CHANGE_DEFEND (1234). `m3fIsActive` (514-520) gates on `times==null || times>0`.

**A2. `isActive()`/`compareValue()` gating — implemented**
- Android: `Status.isActive()` requires `(duration==-1 || duration>0) && compareValue() && (times==null||times>0)`. `compareValue()`: NEUTRAL types need `value!=0`, GOOD/BAD types need `value>0`.
- Web: `m3fCompareValue` (508-511) and `m3fIsActive` (514-520) mirror this exactly; the NEUTRAL set (502-505) is GENERATE, CHANGE_STOCK, CHANGE_TURN_KEEP_STRATEGY, ACCURACY, EVASION, CHANGE_DEFEND, RESISTANCE, INFO. Combat modifiers run through `m3fIsWork` (1344); status phases run through `m3fTickStatuses` (1553) which now respects `isActive()`.

**A3. Duration decrement keeps object at 0 — implemented**
- Android: `updatePersonStatus` decrements duration only when `isActive() && end==end`; at duration 0 it sets `value=0` but KEEPS the object in the list (matters for Condition STATUS HAVE/EMPTY checks).
- Web: `m3fTickStatuses` (1553+) decrements only active, phase-matching statuses and zeroes `value` at duration 0 while keeping the object, so STATUS HAVE/EMPTY/EXIST conditions read it correctly.

---

## B. Attack resolution (`m3fAttack`) — largest functional gap

Reported convergently by the ATTACK, Effect-executor, and Status analyses.

> **Status (2026-06-22 re-audit): B1–B9 RESOLVED — confirmed parity in `m3fAttack` (index.html:1359) / `m3fAttackDealDamage` (1446) / `m3fAnswerOnAttacks` (1498).** Only the numeric/logging tail B10–B12 remains open. **Note on B2/(c):** the engine heals the TARGET (defender) off the TARGET's own VAMP statuses, mirroring Android `restoreHpByVamp` where `sourceOfAttack` resolves from `person = personForAttack` (the attacked person). Any spec/harness that asserts "VAMP heals the SOURCE/attacker" is wrong about the design — see B2 below.

### RESOLVED

**B1. Counterattacks / HARM / REACTION — implemented**
- Android: `attackPerson` (PerkExecutor.kt) — unless `ignoreAnswer||help||ignoreCounterAttacks`, the target's active COUNTERATTACK/HARM/REACTION statuses each trigger `answerOnAttack`. `times` is decremented ONLY for COUNTERATTACK (1156-1158) and for REACTION after a successful `executeIfAvailable` (1210); HARM returns a `help` attack but never decrements times in this path. REACTION is fully gated: `canShow` (conditionsForDisplay) then `executeIfAvailable`/`canExecuteLikeRegularPerk` (probability+pFunc, charges, cooldown, conditionsForEnable, resources, prices).
- Web: `m3fAttack` calls `m3fAnswerOnAttacks` (1440) after a non-self, non-help, non-ignoreCounterAttacks, non-ignoreAnswer attack — whether it hit, missed, or was dodged. `m3fAnswerOnAttacks` (1498) iterates the target's COUNTERATTACK/HARM (return a BOTH attack at the attacker, HARM as `help`, `ignoreAnswer:true` so no re-counter) — `times` decremented for COUNTERATTACK only, not HARM, matching Kotlin. REACTION runs `reactionPerk`/`reactionEffect` through the full availability gate: conditionsForDisplay, then a probability+pFunc roll, then `m3fPerkEnabled` (charges, cooldown, conditionsForEnable, prices, resources); only on success does it pay charges/cooldown, decrement `times`, log, and fire effects. This mirrors `executeIfAvailable` directly rather than deferring to E1.

**B2. VAMP lifesteal — implemented (heals the TARGET, by design)**
- Android: `restoreHpByVamp` (ApplyAttackExecutor.kt:156-184) — on HP damage from a `!fromStatus && !help` attack, **the TARGET (defender) heals off its OWN VAMP statuses**. `sourceOfAttack` is resolved from `person`, and `execute` sets `person = personForAttack` = the attacked person (the target), not the attacker (confirmed at ApplyAttackExecutor.kt:25/47/157). So the defender heals `damage*status.value/100` per active VAMP status it holds (clamped to maxHp), decrements times, logs.
- Web: `m3fAttackDealDamage` (1474-1487) — after `hpDamage>0` on a non-self, non-help attack, iterates the TARGET's (`tgt`) VAMP statuses, heals `tgt` by `floor(hpDamage*value/100)` clamped to maxHp, decrements times, logs under `tgt`. Faithful to Android.
- ⚠️ Spec/harness caveat: a "behavior (c)" stating "VAMP heals SOURCE on hp damage" is **incorrect** — neither Android nor the web port heal the attacker. A VAMP placed on the attacking source will NOT heal it (the attacker is never the `personForAttack`). The correct statement is "VAMP heals the TARGET (defender) off its own VAMP on hp damage." If a harness asserts source-heal, fix the harness/spec, not the engine.

**B3. DODGE / SMART_DODGE — implemented**
- Android: `applyAttackOrUseDodge` (PerkExecutor.kt) — after a hit succeeds, target SMART_DODGE (`smartValue<attack.value`) then DODGE consumes the dodge and negates the attack (unless `attack.ignoreDodge` for plain DODGE).
- Web: after the hit-chance check passes (1417-1431) and not self-target, SMART_DODGE fires when `smartValue!=null && v > smartValue` (1419-1423), else plain DODGE unless `ignoreDodge` (1425-1430); both consume `times` and abort damage while still flowing to counterattacks.

**B4. Combat-modifier statuses check & consume `times` — implemented**
- Android: WEAK/STRONG/VUL/ARMOR/EVASION/ACCURACY/CHANGE_DEFEND each require `times>0` and call `decreaseTimes()` on application.
- Web: each modifier runs through `m3fIsWork` (active + times>0 + probability roll) and calls `m3fDecreaseTimes` on success — WEAK/STRONG 1379-1380, VUL/ARMOR 1384-1385, EVASION 1408, ACCURACY 1411.

**B5. Combat modifiers gated by isWork()/active + probability roll — implemented**
- Android: WEAK/STRONG/VUL applied only inside `if(status.isWork())`; EVASION/ACCURACY via `findWorkStatuses`; RESISTANCE via `isWork() && type==RESISTANCE`. `isWork()` rolls `Random(0..100)<=probability`.
- Web: `m3fIsWork` (1344) = `isActive() && m3fRoll(probability)` gates WEAK/STRONG/VUL/ARMOR (1376), EVASION (1408), ACCURACY (1411), and RESISTANCE (1394). `times` consumed only on a successful application.

**B6. ARMOR no longer double-rolled — implemented**
- Android: ARMOR reduction is unconditional once `isWork()` passes; no second roll.
- Web: ARMOR goes through the same single `m3fIsWork` gate as WEAK/STRONG/VUL (1376/1385) — no dedicated extra roll; reduction applied on success subject to `ignoreArmor`.

**B7. Self-directed attacks skip status modification — implemented**
- Android: for SELF / HERO-by-hero / ENEMY-by-enemy attacks `isSelfAttack=true` and `changeEffectByPersonsStatuses` is SKIPPED entirely.
- Web: `m3fAttack` wraps all WEAK/STRONG/VUL/ARMOR/RESISTANCE modification and the hit/dodge block in `if (!selfTarget)` (1368-1398); a self-attack applies the raw value.

**B8. `ignore*` and `help` flags — implemented**
- Android: `countHitChance`/`effectChangeByPersonStatuses` honor `ignoreEvasion`, `ignoreAcc`, `ignoreWeak`, `ignoreStrong`, `ignoreVul`, `ignoreArmor`, plus `ignoreDodge`/`ignoreCounterAttacks`/`help`. `help` skips source ACCURACY, VAMP and counterattacks; WEAK/STRONG also skipped under `help`.
- Web: `m3fAttack` reads `effect.help` and every `ignore*` flag — WEAK/STRONG skip under `help||ignoreWeak||ignoreStrong` (1379-1380), VUL/ARMOR under `ignoreVul`/`ignoreArmor` (1384-1385), EVASION under `ignoreEvasion` (1407), ACCURACY under `help||ignoreAcc` (1410), DODGE under `ignoreDodge` (1426), counterattacks under `help||ignoreCounterAttacks||ignoreAnswer` (1439), VAMP under `help` (1478).

**B9. WEAK/STRONG vs VUL/ARMOR ownership & target-scope — implemented**
- Android: WEAK/STRONG keyed to the attack SOURCE (`isPersonPerk`); VUL/ARMOR/RESISTANCE keyed to `effect.target` scope via `shouldApplyStatusEffect`.
- Web: `m3fAttack` resolves WEAK/STRONG by `isPersonPerk` (the source side, 1373/1378) and VUL/ARMOR by `m3fShouldApplyStatusEffect(target, …)` scope (1374/1383); both persons are iterated like `effectChangeByPersonStatuses`.

### MINOR

**B10. HEAL CHANGE/SET 0-floor differs** — STILL OPEN
- Android: `increaseHp`/`setHpValue` clamp to maxHp but NOT to 0 — a negative CHANGE heal can drive hp below 0; SET can set negative.
- Web: HEAL case (1243-1245) uses `Math.max(0,...)` on SET and `if (t.hp < 0) t.hp = 0;` afterward, so hp never goes below 0.
- Fix: Drop the 0-floor: SET => `min(maxHp, value)`; CHANGE => `min(maxHp, hp+value)`. Confirm negative heals are actually used first.

### COSMETIC

**B11. Hit-chance roll discretization** — STILL OPEN
- Android: `Random.nextInt(0,101)` (integer 0..100, 101 buckets), hit when `chance >= roll` (so 0% can still hit on roll 0; 100% always hits).
- Web: hit when `chance < rng()*100` => miss (continuous [0,100), index.html:1413); 0% never hits, boundaries round differently.
- Fix: Use `Math.floor(rng()*101)` and miss when `chance < roll`.

**B12. BOTH-type damage log shows pre-shield total** — STILL OPEN
- Android: logs `damageForHp = value - damageBlockedByShield` (post-shield HP portion).
- Web: final log (1491) prints pre-shield total `v`, so absorbed hits log a higher number.
- Fix: Log actual `hpDamage` for the damage line; keep a separate shield-block line.

---

## C. Effect executor (`m3fApplyEffect` family)

### MAJOR

**C1. DEFEND ignores `effect.type` (no SET support)**
- Android: `defendPerson` — CHANGE => `shield += value`; SET => `shield = value` (absolute). No `>=0` clamp.
- Web: DEFEND case (1185-1192) always `t.shield += Math.max(0,v)`; type never read, so SET wrongly adds and shield is force-clamped.
- Fix: Read `ty=(effect.type||'CHANGE')`; SET => `t.shield = v`, else `+= v`. Remove the `Math.max(0,...)` clamp on the CHANGE path.

**C2. CHANGE_DEFEND not gated and never consumes times**
- Android: applied only when `status.isWork() && isPersonPerk`, adds `status.value` to a Defend effect, calls `decreaseTimes()`.
- Web: DEFEND branch sums all CHANGE_DEFEND values from `srcF.statuses` unconditionally — no isWork/isActive/probability/times.
- Fix: Gate on `isActive() + m3fRoll(probability)`, restrict to acting side, decrement times on application.

**C3. STUN-at-perk-time: effects not blocked, stun not consumed**
- Android: `execute` (PerkExecutor.kt:200-205) — if the acting source has active STUN, the perk's effects are NOT executed (logs «Оглушение не позволило применить навык») and the stun's `times` is decremented.
- Web: `m3fIsStunned` exists but perk-dispatch sites (766/840/1456/1607/1745/1904) call `effects.forEach(m3fApplyEffect)` with no source-stun check; a stunned actor applies all effects and stun is not consumed at perk time.
- Fix: At each perk-execution entry, if acting side is stunned, skip effects (log the stun message) and decrement STUN times — instead of relying only on turn-level stun handling. (See also D-stun items; this is the per-perk layer.)

**C4. Effect-level charges (`currentCharges`) not consumed**
- Android: `applyEffect` (PerkExecutor.kt:489-497) — if `effect.currentCharges != null`, fires only when `!=0` and calls `decreaseCharges()` each application (separate from perk charges).
- Web: `m3fApplyEffectUnit`/`m3fApplyEffectOnce` never read or decrement effect charges; a charged effect fires unlimited times.
- Fix: Track per-effect `currentCharges`; if `effect.charges!=null` skip when 0, else decrement before dispatch.

**C5. EDIT_STATUS duration/times merge rules diverge**
- Android: `updateExistingStatus` — for ANY existing status first set `duration = effectStatus.duration`. SET => `value=effectValue, times=effectStatus.times` (even if null). CHANGE => `value+=effectValue` (times untouched). TIMES => only if `times!=null`: `value=effectValue` AND `times += effectStatus.times`.
- Web: EDIT_STATUS (1238-1265) updates duration only on SET and only when non-null; SET sets times only when non-null; TIMES adds OR falls back to value and never sets value; CHANGE wrongly also adds times.
- Fix: Always set `existing.duration = ns.duration`; SET: `value=effectValue, times=ns.times` (allow null); CHANGE: `value+=effectValue` only; TIMES: only when `ns.times!=null` set `value=effectValue` and `times += ns.times`.

### MINOR

**C6. EDIT_STOCK target=ALL applies to wrong/both pools**
- Android: `EditStockHandler` maps ALL -> `isHeroTarget=true` (enemy not handled) — ALL edits ONLY the hero pool.
- Web: uses `m3fTargetOwner(target, source)` so ALL edits the SOURCE side; an enemy perk with ALL edits the enemy pool instead of hero.
- Fix: Map EDIT_STOCK ALL to the hero pool.

**C7. EDIT_STOCK ADD/REMOVE not implemented**
- Android: ADD appends a Stock scale entry; REMOVE removes one (hero pool only).
- Web: only SET/CHANGE; ADD/REMOVE fall into CHANGE and just add to value.
- Fix: Add explicit ADD/REMOVE scale handling on the hero pool (or at minimum no-op rather than treating as CHANGE).

**C8. EDIT_RES adds a maxAmount clamp Android lacks + ALL target side**
- Android: `editPersonResources` — SET/CHANGE with NO max clamp (may go negative); ALL edits ENEMY only.
- Web: EDIT_RES (1224-1236) clamps to `r.maxAmount` and ALL edits BOTH sides.
- Fix: Remove the maxAmount clamp; map ALL to enemy only.

**C9. INFO effect with `title` ignored (dash separator)**
- Android: Info branch — if `title!=null` logs a CUSTOM_MESSAGE «Прочерк» separator; only when title is null logs `message`.
- Web: INFO (1267) only logs `message`; a title-only Info produces no entry.
- Fix: When `title` present, emit the dash/separator log instead of relying on message.

**C10. `showFail` log on probability failure not emitted**
- Android: on fail with `showFail`, logs «Эффект не сработал. Выпало N» and, if FAIL additionalEffects exist, «Но неудача дала эффекты:».
- Web: FAIL branch (1117-1120) runs FAIL additionalEffects but emits neither line.
- Fix: On fail with `showFail !== false`, log the technical line (with rolled number) and the FAIL header before running FAIL effects.

---

## D. Turn flow (`m3fEndTurn` / `m3fEnemyTurn` / enemy actions)

### MAJOR

**D1. Enemy actions add a probability roll Android does not have**
- Android: `enemyActions()` (EndTurnExecutor.kt:302-322) fires every `hand.show && perk.show && perk.enable` perk deterministically; `perk.probability` only affects the displayed name, not whether it fires.
- Web: `m3fEnemyActions` (~1736) gates with `(rng()*100) > (perk.probability??100)`, randomly skipping a perk.
- Fix: Remove the probability roll. (If probability is meant to gate availability it belongs in `enable` computation, not here.)

**D2. Enemy stun: whole turn skipped vs per-perk suppression**
- Android: `PerkExecutor.execute` runs per perk during enemyActions(); on STUN it STILL runs reload/charge/resource/price bookkeeping and only suppresses EFFECTS, logging «Оглушение не позволило применить навык» and calling `decreaseTimes()` once per attempted perk. Iteration continues over all eligible perks.
- Web: `m3fEnemyActions` (~1719) checks `m3fIsStunned(enemy)` once at top; if stunned it logs «оглушён, пропускает ход», calls `m3fEnemyFinish()` and skips ALL perks — no cost spent, no per-perk stun-time decrement.
- Fix: Do not early-return on stun. Iterate every eligible perk; spend prices/charges/resources and set reload=0 as normal, suppress effects, decrement STUN times once per attempted perk.

**D3. Hero stun: perk click blocked vs suppressed-with-cost**
- Android: hero perk while stunned still pays price/charges/resources and reloads; effects suppressed; STUN `times` decremented.
- Web: `m3fUsePerk` (1597) returns immediately if `m3fIsStunned(m3f.hero)` — no cost, no reload, no stun consumption.
- Fix: Allow the click while stunned; deduct costs, set reload=0, skip effects, decrement hero STUN times.

**D4. Stunned enemy wrongly skips its board move**
- Android: enemy board move (`makeMove`) is chosen on `BattleSettings.MAKE_ENEMY_MOVE` and is NOT gated by stun; the swap happens regardless, then `enemyActions()` runs (where stun suppresses effects).
- Web: `m3fEnemyTurn` (1708) gates the board move on `makeEnemyMove && !m3fIsStunned(enemy)` — a stunned enemy skips its swap entirely.
- Fix: Remove the `!m3fIsStunned(enemy)` guard from the board-move branch.

### MINOR

**D5. Hit/touch counter clearing omitted**
- Android: `execute()` calls `clearHitsAndTouches(true)` at start (line 66); `afterEnemyAction()` calls `clearEnemyHitsAndTouches()` (line 372) — per-turn hit/touch counters for attack accounting.
- Web: no equivalent; `m3fResetContactFlags` handles contact flags but no hit/touch clear at execute/afterEnemyAction boundaries.
- Fix: If any effect/condition reads per-turn hit/touch counts, clear them at the start of `m3fEndTurn` and in `m3fEnemyFinish`.

### COSMETIC

**D6. `messageAboutMakeMove` two-stage log**
- Android: `makeMove()` logs «Противник думает...» then after a random 0-3s delay «Противник ходит» and swaps.
- Web: `m3fEnemyBoardMove` logs only `${enemy.name}: совмещение.` — omits the two-stage log and think delay.
- Fix: Optional — add the two-stage messages for log parity; swap behavior already equivalent.

> Confirmed parity (no change): timer first-tick=1 / per-turn reset, «За ход»/«Время хода» log gating & ordering, hand-level display condition re-check per perk, enemy prepare-order (decay before board move).

---

## E. Perk availability & AUTO systems (reload / category / StockPerk / TimePerk / sectors)

### BLOCKER

**E1. Auto/sector perks bypass full availability gating**
- Android: StockPerk, TimePerk and sector perks all route through `executeIfAvailable -> canExecuteLikeRegularPerk` (PerkExecutor.kt:89-163): probability (+pFunc), `currentCharges!=0`, `!isReloading()`, all `conditionsForEnable`, resource sufficiency, price vs stocks. Only then decreaseCharges + execute + pay price + reload bookkeeping.
- Web: `m3fCheckStockPerks` (757-768) checks only `conditionsForDisplay` then applies effects — no probability/charges/cooldown/enable/resources/prices, no charge decrement, no price payment. `m3fRunTimePerks` (1448-1460) checks display + charges only. `m3fTapSector` (1898-1908) checks only display.
- Fix: Route all auto/sector perks through a shared `executeIfAvailable` equivalent (probability+pFunc, charges!=0, !reloading, conditionsForEnable, resources, stocks; then decrement charges, set reload=0 + category siblings, pay prices, spend resources, apply effects).

### MAJOR

**E2. reloadType PERK/COMBO not implemented (single per-turn counter)**

This is the convergent root of three findings (turn-flow + perk-availability):
- Android: `reloadPerksWithTurn` in `giveTurnToHero` (lines 142-182): TURN perks `+1` only if `show && isReloading()` (capped at coolDown); PERK perks RESET to `reload=coolDown` each round; COMBO RESET to `reload=0` each round. Additionally `reloadPerkAfterUse` (Perk.kt:195-210) counts PERK/COMBO down by ACTIONS (`+1` per other action in the turn for shown reloading perks). COMBO starts `startReload=0` (on cooldown).
- Web: `m3fEndTurn` (1626) and `m3fEnemyTurn` (1705) do `perkReload[name] += 1` for EVERY perk unconditionally, no reloadType branch, no cap, no per-action increment. COMBO initialized to coolDown (ready), never reset to 0. PERK never force-readied at round start.
- Fix:
  - Initialize COMBO perks' reload to 0.
  - Per-action: for every shown+reloading PERK and COMBO perk (except the just-used one/category), `perkReload += 1`.
  - At hero-turn handover: TURN => `+1` gated by `show && isReloading()` (cap at coolDown); PERK => `reload=coolDown`; COMBO => `reload=0`.

**E3. Category exclusivity only locks coolDown==1 TURN hero perks**
- Android: `ifPerkHasReloadDownTimeIt` (PerkExecutor.kt:228-248) sets `reload=0` for the used perk AND every perk sharing `category` (any coolDown, any reloadType, BOTH hands) on ANY use — by hero, enemy, or auto.
- Web: `m3fUsePerk` (1611) sets a transient `categoryLocked[category]` only when used perk has `category && coolDown===1 && reloadType==='TURN'`; `m3fPerkEnabled` (1537) blocks under the same condition. Enemy (`m3fEnemyActions`) and auto-perks never set it at all.
- Fix: On ANY perk use (hero, enemy, auto), set `perkReload=0` for the used perk and every category sibling on both sides. Remove the coolDown==1/TURN-only restriction and the `categoryLocked` map; rely on the shared reload counter so siblings are blocked by their own coolDown.

**E4. StockPerk does not decrement charges or pay prices** (subset of E1, called out)
- Android: `executeIfAvailable` calls `decreaseCharges()` and pays price via `payPriceForPerk`.
- Web: `m3fCheckStockPerks` applies effects with no charge decrement, no price payment — a charged/priced StockPerk is infinite and free.
- Fix: After the availability check, decrement perkCharges and deduct prices from the owner's pool.

### MINOR

**E5. Per-turn reload advance ignores `show && isReloading()` gate**
- Android: `reloadPerksWithTurn` advances TURN reload only when `perk.show && perk.isReloading()`. A hidden perk stays frozen.
- Web: `m3fEndTurn`/enemy advance `+1` unconditionally; a perk hidden for several turns becomes instantly ready when it reappears.
- Fix: Gate the `+1` on currently-shown (conditionsForDisplay pass) AND still reloading (`perkReload < coolDown`).

**E6. Reload advancement split across two call sites vs single round step**
- Android: `reloadPerksWithTurn` advances BOTH hands once per round inside `giveTurnToHero` (after turn increment) — single round-boundary step.
- Web: hero hands advanced in `m3fEndTurn` (start of enemy turn), enemy hands at top of `m3fEnemyTurn` — split timing can desync status/condition evaluation within the round.
- Fix: Move both hero+enemy reload advancement into `m3fGiveTurnToHero` (after turn-num increment), applying per-reloadType rules. (Resolve together with E2/E5.)

**E7. Perk at 0 charges stays visible-but-disabled instead of hidden**
- Android: `changePerkDisplay` sets `show=false` when `currentCharges==0` (the perk disappears).
- Web: `m3fRenderHands` (1563-1565) hides by `conditionsForDisplay` only; `m3fPerkEnabled` (1535) disables at `charges<=0` but the button stays visible.
- Fix: In `m3fRenderHands` also skip perks where `perk.charges!=null && perkCharges<=0`.

> Confirmed parity: StockPerk upward-crossing detection (`prev<threshold && cur>=threshold`), TimePerk exact-second timing/ordering & per-turn reset, auto-state add/remove (`m3fApplyStatesFor` vs `Person.applyStates`), enemy-side `conditionsForEnable` owner.

---

## F. Board → Stocks + Rules (scoring)

### MAJOR

**F1. Match-group construction & orientation for HeroRules**
- Android: `computeMatchGroups` builds BFS 4-neighbour connected components, ONE `MatchGroupInfo` per component with full `size` and orientation in {HORIZONTAL, VERTICAL, T_SHAPE, L_SHAPE, OTHER}.
- Web: `m3fFindMatches` emits a separate run per straight line; crossing runs never merged; orientation only HORIZONTAL/VERTICAL. So `minSize`/orientation gating fires differently (an L/T 5-match is two size-3 runs, not one size-5 group).
- Fix: After collecting matched cells, compute BFS connected components, derive size + orientation (incl. T/L/OTHER) per component, pass those to `m3fRunMatchRules`.

**F2. Match rules fire per straight run, not once per group** (consequence of F1)
- Android: `MatchPerkExecutor` iterates `computeMatchGroups` groups; an L/T 5-match fires a rule once.
- Web: `m3fRunMatchRules` iterates per straight run; an L/T shape produces 2 runs, double-firing the perk.
- Fix: Drive `m3fRunMatchRules` from the BFS components (folds into F1).

**F3. Dual-color gem scoring weight (full/full vs 0.5/0.5)**
- Android: `addValueFromCrushedGems` — when `gem.extraType != null`, primary scored at `*0.5` and extra color also at `*0.5` (one gem's worth split across two pools).
- Web: `m3fAccumulateStocks` scores primary at full `gs.fullValue` (785) and extra at full `egs.fullValue` (807) — roughly double Android total.
- Fix: When `meta.extra` is set, multiply both primary and extra contributions by 0.5 before the cell modifier. Keep the half-debuff path (no extra, `fullValue/2`) unchanged.

**F4. Bonus points go to wrong pool / wrong color**
- Android: bonus uses a SEPARATE random `gem.bonusType` color (set in `generateNewGem` with `bonusProbability`, distinct from `gem.type`), adding `GEM_MAP[bonusType].bonusValue` to the BONUS color's pool.
- Web: `m3fMkGemMeta` sets only a boolean `meta.bonus`; `m3fAccumulateStocks` adds the PRIMARY color's `bonusValue` to the PRIMARY pool (786) — wrong target and wrong value source.
- Fix: On gem creation, roll a distinct `bonusType` color (`!=primary`) under `bonusProbability`, store in meta. In accumulation add `gemSettings[bonusType].bonusValue` to the bonusType pool, applying the cell modifier.

**F5. Overlapping H+V cell scored twice vs once**
- Android: `removeMatches` iterates raw matchedPositions (no de-dup); an H/V intersection cell appears in both triplets and is scored twice.
- Web: `m3fFindMatches` accumulates into a Set (617); intersection cells score once — under-scores intersections vs Android.
- Fix: Score each matched-cell occurrence with multiplicity (per run/triplet) rather than de-duplicating. (Confirm desired behavior; this is faithful-to-Android but verify it's intended.)

**F6. Rounding & accumulation of stock points**
- Android: sums all per-cell contributions per gemType into a Double map, clamps each contribution `>=0`, then `increaseStock(delta.toInt())` — single truncation per gemType after summation.
- Web: `m3fAddStock` is called separately per primary/extra/GENERATE, each doing `Math.round(v)` — rounds, and at each add. (e.g. two 2.5s: Android `floor(5.0)=5`, web `round(2.5)+round(2.5)=6`.)
- Fix: Accumulate contributions into per-gemType float sums (clamp each `>=0`), then commit once with `Math.trunc`.

### MINOR

**F7. turnKeep / damageKeep rounding (round vs truncate)** — also reported in turn-flow analysis
- Android: `stock.value * keep / 100` with Int arithmetic = truncation toward zero (e.g. `37*40/100=14`). turnKeep adds CHANGE_TURN_KEEP_STRATEGY (coerced `>=0`); damageKeep has no status modifier.
- Web: `m3fApplyTurnKeep` (1356) / `m3fApplyDamageKeep` (1364) use `Math.round`.
- Fix: Use `Math.trunc(value * keep / 100)` in both.

**F8. RESISTANCE rounding (round vs truncate)** — also reported in attack/status analyses
- Android: `applyResistanceMultiplier` = `(value * multiplier).toInt().coerceAtLeast(0)` — truncate toward zero.
- Web: `m3fAttack` = `Math.round(v * (1 - resist/100))` — off-by-one on fractional results.
- Fix: Use `Math.trunc(v * (1 - resist/100))` then clamp `>=0`.

**F9. Probability comparison off-by-one** — also reported in board analysis
- Android: `Random.nextInt(0,101) < probability` (discrete 0..100, strict `<`); `P = probability/101`. 0 never fires; 100 fires for 0..99.
- Web: `m3fRoll(prob)` = `(rng()*100) <= prob` (continuous [0,100), `<=`); `P = prob/100`. Both operator and distribution differ.
- Fix: `return Math.floor(rng()*101) < (prob||0)`.

**F10. TRIGGER cell perk lacks per-batch dedup**
- Android: each TRIGGER cell fires at most once per `crushGems` batch via a `processedTriggerCells` set keyed by `(row,col)`, through `executeIfAvailable`.
- Web: `m3fAccumulateStocks` calls `m3fFireCellTrigger` per cell with no dedup guard (821); safe only while cells are de-duped — breaks if the F5 occurrence fix is applied.
- Fix: Track a per-batch processed set of trigger coordinates; fire each at most once.

### COSMETIC

**F11. extra/half roll ordering vs RNG stream** — Android always rolls extra even when half later overrides; web makes them mutually exclusive (half first). Color/scoring outcome matches; only RNG-stream parity differs. Fix only if exact RNG parity is desired.

> Confirmed parity: CHANGE_STOCK applied to extra branch (path correct; only the 0.5 weight is missing — F3).

---

## G. Conditions DSL (`m3fEvalCondition` family)

> **Status (2026-06-22 re-audit): G1–G7 RESOLVED — confirmed parity.** `m3fEvalCondition` (index.html:1075-1078), `m3fEvalConditionOne` (1038-1070), `m3fConditionParamValue` (1016-1034) and `m3fActiveStatusValue` (947-950) mirror `CheckConditionExecutor`. No open G-items remain.

### RESOLVED

**G1. Target ALL uses AND — implemented**
- Android: `EffectTarget.ALL` => `enemy.check(...) && hero.check(...)` — must hold for BOTH.
- Web: `m3fEvalCondition` (1075-1078) uses `persons.every(...)`; single-person targets are equivalent under either.

**G2. Non-STATUS EXIST — implemented**
- Android: `Symbol.EXIST` => `valueForCompare != 0` (true only when value non-zero) for HP/RES/STOCK/TURN/etc.
- Web: `m3fEvalConditionOne` non-STATUS EXIST => `return val !== 0;` (1066); EMPTY => `val === 0` (1067).

**G3. SP / shield parameter — implemented**
- Android: `getPersonParameter` SP => `this.shield`.
- Web: `m3fConditionParamValue` `case 'SP': return person.shield || 0;` (1019).

**G4. STATUS value reads first active status — implemented**
- Android: STATUS => `statuses.find { name==name && isActive() }?.value ?: 0` — first ACTIVE status's value, not a sum.
- Web: `m3fActiveStatusValue` (947-950) returns the first status matching name that passes `m3fIsActive`, else 0; used for STATUS param (1021) and all MORE/LESS/EQUALS/NOT/HAVE/EXIST/EMPTY comparisons (1047-1056).

**G5. Status presence respects isActive() — implemented**
- Android: STATUS presence via `isActive()`; then HAVE => `value>0`, EXIST => `value!=0`, EMPTY => `value==0`.
- Web: STATUS branch (1046-1057) reads `m3fActiveStatusValue` (so expired-duration / depleted-times / failing-compareValue statuses yield 0) and applies HAVE => `val>0`, EXIST => `val!==0`, EMPTY => `val===0`.

**G6. STOCK pool resolved from the evaluated person — implemented**
- Android: STOCK pool chosen by which person object (hero vs enemy), not by `condition.target`.
- Web: `m3fConditionParamValue` STOCK uses `m3fStockPool(person === m3f.enemy ? 'enemy' : 'hero')` (1028) — driven by the evaluated person, not `cond.target`.

**G7. ATTEMPT parameter — implemented**
- Android: ATTEMPT => `attemptCounterInteractor.value() ?: 0`.
- Web: `m3fConditionParamValue` `case 'ATTEMPT': return m3f.attempt || 0;` (1024).

> Note: the prompt's `BLOCKS` parameter does not exist in the Android enum (only HITS/TOUCHES), so its absence in web is correct. Symbol set and HP/HP_P/TURN/TIME/HITS/TOUCHES/RES/TOUCHED/HIT read correctly.

---

# FIX PLAN (ordered)

> Steps 1–3 are DONE (re-audit 2026-06-22): the status lifecycle primitives, the full `m3fAttack` rewrite, and the conditions DSL are all in place and confirmed against Android. Remaining open work starts at step 4, plus the numeric tail B10/B11/B12 in step 9.

1. ~~**Status lifecycle foundation** — `isActive()` (A2), `times`/`decreaseTimes()` (A1), duration-keeps-object (A3).~~ DONE.

2. ~~**Attack resolution core** — isWork gating + `times` (B4/B5/B6), self-attack skip (B7), `help`/`ignore*` flags (B8), ownership/scope (B9), VAMP (B2), DODGE/SMART_DODGE (B3), counterattacks/HARM/REACTION (B1).~~ DONE.

3. ~~**Conditions DSL correctness** — ALL-AND (G1), non-STATUS EXIST (G2), SP (G3), ATTEMPT (G7), first-active STATUS value (G4/G5), STOCK-pool-from-person (G6).~~ DONE.

4. **STUN semantics** — Per-perk suppression-with-cost at the execution layer (C3), then the turn-flow variants: enemy iterates with cost (D2), hero click allowed with cost (D3), stunned enemy still moves the board (D4).

5. **Perk reload & category exclusivity** — Implement reloadType PERK/COMBO (per-action + round-rules) and consolidate reload advance into `m3fGiveTurnToHero` (E2/E5/E6); category-exclusivity on any use by any side (E3); gate the `+1` on show&&reloading (E5).

6. **Auto/sector perk gating** — Route StockPerk/TimePerk/sector/trigger through a shared `executeIfAvailable` (E1) including charge decrement + price payment (E4); add per-batch trigger dedup (F10); hide 0-charge perks (E7).

7. **Effect-executor details** — DEFEND SET (C1), CHANGE_DEFEND gating (C2), effect charges (C4), EDIT_STATUS merge rules (C5), EDIT_STOCK ALL/ADD/REMOVE (C6/C7), EDIT_RES clamp+ALL (C8), INFO title (C9), showFail log (C10).

8. **Scoring/board** — BFS match groups + once-per-group rule firing (F1/F2), dual-color 0.5 weight (F3), bonus color/pool (F4), intersection multiplicity (F5, verify intent), single-truncation accumulation (F6).

9. **Numeric parity (low-risk, batch last)** — turnKeep/damageKeep truncation (F7), resistance truncation (F8/B11 hit-roll), probability roll discretization (F9), HEAL 0-floor (B10).

10. **Cosmetic/logging** — BOTH-damage log number (B12), enemy two-stage move log (D6), hit/touch counter clearing (D5), extra/half RNG-stream order (F11).
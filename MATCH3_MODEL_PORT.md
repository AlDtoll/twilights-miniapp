# Перенос модели из Android-приложения Twilights (match3) в мини-апп

Документ описывает, какие концепции из Android-проекта `twiligihts` (match-3 RPG, модели `Status`, `Perk`, `Effect`, `Stock`) перенесены в hex-игру мини-аппа и в каком виде. Цель — единая ментальная модель между Android-приложением и web-играми.

## 1. Статусы → броня (ARMOR)
**Android:** `Status {name, value, type, probability}` — статус с величиной и вероятностью срабатывания; тип `ARMOR` среди прочих.
**Перенос (hex):** `unit.statuses: [{name, value, chance}]`. При получении урона каждая деталь брони по очереди кидает `chance%`; сработавшая вычитает `value`. Броня НЕ разрушается (как `duration:-1`). Несколько деталей складываются по срабатыванию.

## 2. Щиты → барьеры (ряд заслонов)
**Идея Данила (поверх Android-щитов):** ряд барьеров `[35,35,...]`. Любой удар снимает ОДИН передний барьер; проходит `max(0, урон − значение)`. Барьеры временные (1 ход), сбрасываются при движении, даются навыком.
**Перенос (hex):** `unit.shields: []`, эффект `{type:'barrier', value, count}`.

## 3. Перк/навык → композируемые эффекты
**Android:** `Perk` = действие с НАБОРОМ `Effect` (ATTACK/DEFEND/HEAL/EDIT_STATUS/EDIT_STOCK/INFO…); у эффектов своя вероятность и условия (`conditions`, `pFunc`, `successType`: TOUCH/HIT/FAIL/SUCCESS).
**Перенос (hex):** `ability.effects: [{type, value, chance?, condition?, to?}]`.
- `chance` — вероятность срабатывания эффекта (0-100, дефолт 100).
- `to` — куда: `target` | `self` | `ally` (дефолт по типу).
- Движок `hxApplyAbilityFx`: сперва урон-эффекты (с броском попадания), затем «райдеры» по своему шансу+условию; `acted`/кулдаун ровно один раз.
- **Обратная совместимость**: старый формат (`damage` + один `effect`) авто-конвертится (`hxLegacyEffects`); 84 старых навыка не тронуты.

### Типы эффектов (hex)
damage, stun, heal, lifesteal, knockback, barrier, buff, summon, chain, ignite, debuff, pull, **gain_ap** (вернуть очко действия — аналог «энергии»).

### Условия (`hxEvalEffectCond`)
always, onHit, targetHpBelow/Above (% от maxHp), selfHpBelow/Above, isFlanked (≥2 смежных врага), distGte/distLte, targetInCover, targetType.

## 4. Что НЕ перенесено
**Очки типов гемов** (`Stock`/`pFunc` по сегментам очков) — в hex-игре нет match-3 поля и накопления очков по типам, поэтому условия «по очкам типа N» невозможны. Ресурс в hex — это **AP** (очки действия), контекст — HP/дистанция/окружение/уклонение/тип цели. «Энергию» из примеров маппим на AP (`gain_ap`).

> Полноценный аналог Android-боя (match-3 → ресурсы по типам → навыки → бой) реализуется отдельной игрой **match3 fight** (`game:'match3fight'`) — там очки типов будут, и условия «по очкам» вернутся.

## Пример композируемого навыка
```js
{ id:'sword_swift', name:'Быстрый удар', type:'melee', range:1, ap:1, maxCooldown:2,
  effects:[ {type:'damage', value:25}, {type:'gain_ap', value:1, chance:50} ] }
// 25 урона; 50% шанс вернуть 1 AP
```

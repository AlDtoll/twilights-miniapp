# Match-3 Fight (`game:'match3fight'`)

Веб-аналог боевого цикла Android-приложения **twiligihts** внутри `index.html`.
Использует **те же имена полей JSON**, что и `SCENE_CREATION_GUIDE.md` / `ENEMY_AI.md`.
Неизвестные поля игнорируются (forward-compat) — более полная Android-сцена загрузится без ошибок.

## Боевой цикл

1. Поле 3-в-ряд (6×6). Цвет гема `g` (0-based) → `gemType = g+1` (цвета Android 1-based).
2. Совпадение даёт очки (**Stock**) того цвета, по правилам `gemSettings`.
3. Ладони героя (`heroHands`) группируют навыки (`perks`) по `gemType`.
4. Навык стоит `prices` (ресурсы-стоки) и запускает список `effects` (ATTACK / DEFEND / HEAL / EDIT_STATUS / EDIT_STOCK).
5. У героя и врага есть `hp / maxHp / shield / statuses`.
6. Кнопка **«Завершить ход»** → распад стоков (`turnKeepStrategy`) → ход врага (SimpleStrategy).
7. Победа при `enemy.hp ≤ 0`, поражение при `hero.hp ≤ 0`.

Результат отправляется ботом через `sendResultToBot`:
```json
{ "game":"match3fight", "win":true, "outcome":"Победа", "turns":2, "heroHpLeft":84, "enemyHpLeft":0 }
```

## Запуск

- Через бот: base64-кодированный JSON сцены в `?data=` (как у остальных мини-игр).
- Без сцены: если `game:'match3fight'` без полей `hero/enemy/heroHands/settings` — грузится **встроенная демо-сцена** (см. ниже), игра запускается автономно.

---

## Формат JSON (реализованное подмножество)

### hero / enemy
| Поле | Тип | Описание |
|------|-----|----------|
| `name` | string | имя |
| `hp` | int | текущее здоровье (по умолчанию = `maxHp`) |
| `maxHp` | int | максимум (по умолчанию = `hp`, иначе 100) |
| `shield` | int | щиты (по умолчанию 0) |
| `statuses` | array | статусы (см. ниже) |
| `info` | string | **только enemy** — описание |
| `preview` | string | **только enemy** — имя файла превью (парсится, визуально не используется) |

Поля `wounds/maxWounds/touches/hits/blocks/wasHit…` — парсятся/инициализируются, но в v1 на механику не влияют.

### Stock (ресурс)
Строится автоматически из `settings.gemSettings`. Объект: `{ value, gemType, maxValue }`. Никогда не отрицателен; обрезается по `maxValue`.

### settings
| Поле | По умолчанию | Описание |
|------|--------------|----------|
| `types` | 5 | число цветов гемов (мин. 4) |
| `makeEnemyMove` | false | v1: враг не делает реальный матч на поле, сразу применяет навыки |
| `animateEnemy` | false | парсится, без визуала |
| `gemSettings` | — | массив (см. ниже) |

### gemSettings (элемент)
| Поле | По умолчанию | Описание |
|------|--------------|----------|
| `type` | — | цвет гема как **строка** (`"1"`..`"5"`) |
| `name` | "" | id иконки (`axe_shield`, `armor`, …) — иконка авто-выводится |
| `fullValue` | 10 | базовые очки за гем |
| `halfProbability` | 0 | % шанс получить половину очков |
| `bonusValue` | 2 | бонусные очки |
| `bonusProbability` | 0 | % шанс бонуса |
| `turnKeepStrategy` | 50 | % стоков, сохраняемых после хода |
| `damageKeepStrategy` | 100 | % стоков после получения урона героем (только атаки) |
| `displayName` | "тип N" | имя для игрока |
| `colorHex` | из палитры | цвет ячейки (расширение для веба) |
| `maxValue` | null | максимум стока |

### hand (элемент heroHands / enemyHands)
| Поле | Описание |
|------|----------|
| `gemType` | int — цвет ресурса ладони (ярлык/группировка) |
| `name` | подпись ладони |
| `perks` | массив навыков |
| `conditionsForDisplay` | парсится, **DSL отложен** → ладонь всегда видима |

### perk
| Поле | По умолчанию | Описание |
|------|--------------|----------|
| `name` | — | имя (должно быть уникально) |
| `description` | — | опционально; если нет — авто-текст из стоимости |
| `effects` | [] | список эффектов |
| `prices` | [] | стоимость `[{gemType, value}]` |
| `icon` | "" | иконка |
| `category` | null | категория (для взаимоисключения) |
| `coolDown` | 0 | перезарядка в ходах |
| `reloadType` | "TURN" | только `TURN` в v1 |
| `charges` | null | конечное число применений |
| `probability` | 100 | % срабатывания (для врага) |
| `place` | false | пассивный (парсится, отложен) |

**Взаимоисключение:** навыки с одинаковыми `category` + `coolDown:1` + `reloadType:"TURN"` — только один за ход.

### effect
Общие: `command`, `target` (`HERO|ENEMY|SELF|FOE|ALL`), `value`, `probability` (default 100), `func`, `pFunc`, `repeats`, `rFunc`.

`func`/`pFunc` поддерживают: `dice` (`+rand(1..N)`) и `segments` с `parameter:"STOCK"` (`+ stock[gemType] × mul`). Прочие параметры segments игнорируются.

| command | поля | поведение |
|---------|------|-----------|
| `ATTACK` | `type` (`BOTH`/`SP`/`HP`) | формула щит/HP (см. ниже) |
| `DEFEND` | `value` | `shield += value` (+ статус `CHANGE_DEFEND`) |
| `HEAL` | `type` (`CHANGE`/`SET`) | `CHANGE: hp+=value` (cap maxHp), `SET: hp=value`; отрицательное = урон |
| `EDIT_STOCK` | `type` (`CHANGE`/`SET`), `gemTypes[]` | изменить стоки, не ниже 0 |
| `EDIT_STATUS` | `type` (`SET`/`CHANGE`/`TIMES`), `status{}` | добавить статус на цель |

**Формула ATTACK** (порядок):
1. Модификаторы значения: `WEAK`(−)/`STRONG`(+) у источника; `VULNERABLE`/`VUL`(+)/`ARMOR`(−, с шансом `probability`) у цели; затем `RESISTANCE` множитель `×(1 − Σ/100)`; `coerce ≥ 0`.
2. Шанс попадания `= 100 − Σ EVASION(цель) + Σ ACCURACY(источник)`; промах → «Промах!» (self-цель не проверяется).
3. Применение:
   - `BOTH` (по умолчанию, == «без type» в гайде): `absorbed = min(v, shield); shield -= absorbed; hp -= (v − absorbed)`.
   - `SP`: `shield = max(0, shield − v)`, HP не трогается.
   - `HP`: `hp -= v` (пробивает щиты).
4. После урона по HP героя — `damageKeepStrategy` распад стоков.

> **Каноническое имя атаки по умолчанию = `BOTH`** (текст гайда говорит «без type», но enum-константа — `BOTH`).

### status
| Поле | По умолчанию | Описание |
|------|--------------|----------|
| `name` | — | имя |
| `value` | 0 | величина |
| `type` | INFO | тип (см. ниже) |
| `probability` | 100 | % срабатывания |
| `duration` | 1 | ходов; `-1` = бесконечно; декремент при применении |
| `gemTypes` | [] | для GENERATE/CHANGE_STOCK/CHANGE_TURN_KEEP_STRATEGY |
| `times` | null | число применений |
| `end` | false | `true` → применяется ПОСЛЕ хода, в UI «(E)» |

Реализованные типы: `DAMAGE`, `DAMAGE_HP`, `HEAL`, `DEFEND`, `ARMOR` (вероятностный блок), `STRONG`, `WEAK`, `VULNERABLE`/`VUL`, `STUN`, `GENERATE`, `CHANGE_STOCK`, `RESISTANCE`/`EVASION`/`ACCURACY` (учитываются в формуле атаки), `CHANGE_DEFEND`, `CHANGE_TURN_KEEP_STRATEGY`. Неизвестные типы игнорируются.

`end:false` → применяется и декрементируется ПЕРЕД ходом владельца; `end:true` → ПОСЛЕ.

### heroRules (MatchRule)
| Поле | По умолчанию | Описание |
|------|--------------|----------|
| `orientation` | null=любая | `HORIZONTAL`/`VERTICAL` (T/L-формы → отложены) |
| `gemType` | null=любой | цвет |
| `minSize` | 3 | мин. размер совпадения |
| `perk` | — | объект с `effects[]`, выполняется при совпадении |

Все подходящие правила срабатывают (без исключительности).

## Враг (SimpleStrategy, `ENEMY_AI.md`)
1. Статусы `end:false` врага.
2. Ладони сверху-вниз → навыки сверху-вниз: первый доступный (хватает стоков, не на кулдауне, есть заряды) И прошедший бросок `probability` — применяется, **затем стоп** (порядок в JSON = приоритет).
3. Статусы `end:true`. Возврат хода герою.
4. `STUN` блокирует ход врага.

---

## Демо-сцена (Twilights)

Загружается автоматически при `game:'match3fight'` без сцены.

```json
{
  "game": "match3fight",
  "hero": { "name": "Воин зари", "hp": 100, "maxHp": 100, "shield": 0, "statuses": [] },
  "enemy": {
    "name": "Тень разлома", "hp": 80, "maxHp": 80, "shield": 0,
    "info": "Порождение трещины между мирами.",
    "statuses": [ { "name": "Шипы", "type": "ARMOR", "value": 3, "probability": 50, "duration": -1 } ]
  },
  "settings": {
    "types": 5, "makeEnemyMove": false,
    "gemSettings": [
      { "type": "1", "name": "axe_shield", "fullValue": 10, "turnKeepStrategy": 40, "damageKeepStrategy": 100, "displayName": "оружия" },
      { "type": "2", "name": "sparkles",  "fullValue": 10, "turnKeepStrategy": 40, "damageKeepStrategy": 100, "displayName": "воли мага" },
      { "type": "3", "name": "armor",     "fullValue": 10, "turnKeepStrategy": 50, "damageKeepStrategy": 100, "displayName": "защиты" },
      { "type": "4", "name": "hill",      "fullValue": 8,  "turnKeepStrategy": 30, "damageKeepStrategy": 100, "displayName": "земли" },
      { "type": "5", "name": "move",      "fullValue": 8,  "turnKeepStrategy": 30, "damageKeepStrategy": 100, "displayName": "духа" }
    ]
  },
  "heroHands": [
    { "gemType": 1, "name": "Оружие", "perks": [
      { "name": "Меч-удар", "description": "Рубящий удар клинком.",
        "prices": [{ "gemType": 1, "value": 20 }],
        "effects": [{ "command": "ATTACK", "target": "ENEMY", "value": 18, "func": { "dice": 6 } }] }
    ] },
    { "gemType": 2, "name": "Воля мага", "perks": [
      { "name": "Импульс волшебника", "description": "Чистая магия, пробивает щиты.",
        "prices": [{ "gemType": 2, "value": 25 }],
        "effects": [{ "command": "ATTACK", "type": "HP", "target": "ENEMY", "value": 14 }] }
    ] },
    { "gemType": 3, "name": "Защита", "perks": [
      { "name": "Заслон", "description": "Поднять щит.",
        "category": "Восстановление", "coolDown": 1, "reloadType": "TURN",
        "prices": [{ "gemType": 3, "value": 15 }],
        "effects": [{ "command": "DEFEND", "target": "SELF", "value": 20 }] },
      { "name": "Лечение", "description": "Перевязать раны.",
        "category": "Восстановление", "coolDown": 1, "reloadType": "TURN",
        "prices": [{ "gemType": 3, "value": 20 }],
        "effects": [{ "command": "HEAL", "type": "CHANGE", "target": "SELF", "value": 18 }] }
    ] }
  ],
  "heroRules": [
    { "orientation": null, "gemType": null, "minSize": 4,
      "perk": { "name": "Резонанс", "effects": [{ "command": "EDIT_STOCK", "type": "CHANGE", "target": "SELF", "gemTypes": [1], "value": 10 }] } }
  ],
  "enemyHands": [
    { "gemType": 1, "name": "Когти", "perks": [
      { "name": "Когтистый удар", "probability": 100, "prices": [],
        "effects": [{ "command": "ATTACK", "target": "HERO", "value": 12, "func": { "dice": 4 } }] },
      { "name": "Морок", "probability": 50, "coolDown": 2, "reloadType": "TURN", "prices": [],
        "effects": [{ "command": "EDIT_STATUS", "type": "CHANGE", "target": "HERO", "value": 2,
          "status": { "name": "Ослабление", "type": "WEAK", "value": 4, "duration": 2 } }] }
    ] }
  ]
}
```

«Заслон» и «Лечение» делят `category:"Восстановление"` → демонстрация взаимоисключения (один за ход).

---

## Отложено в v1 (JSON остаётся совместимым)

extraProbability / двухцветные гемы; `Settings.cells` (MULTIPLIER/ADDITIVE/TRIGGER);
TimePerks / StockPerks (пороговые перки); продвинутые статусы полностью
(DODGE/SMART_DODGE, COUNTERATTACK/HARM, REACTION/reactionEffect, VAMP, INFO-логика);
`pFunc`/`func` параметры кроме STOCK; DSL `conditions`/`conditionsForDisplay`/`conditionsForEnable`;
`reloadType` `PERK`/`COMBO` (только `TURN`); пассивные `place`-перки; `gif`;
`additionalEffects`/`successType`; `wounds`; ориентации `T_SHAPE`/`L_SHAPE`/`OTHER`;
реальный матч врага на поле (`makeEnemyMove` по умолчанию false); флаги `ignore*`/`help`.

## Известные ограничения v1 (осознанно, вне рамок одиночного боя)
- **Единый пул очков (Stocks)**: герой и враг используют общий пул ресурсов. В Android-движке у каждой стороны свой список; для боя «игрок против врага» с активными перками игрока это упрощение допустимо. Враг-сторонние STOCK-условия читают пул игрока.
- ~~EDIT_RES / RES~~ — **РЕАЛИЗОВАНО**: именованные боевые ресурсы (стрелы, заряды) `{name, amount, maxAmount?}` на hero/enemy. Эффект `EDIT_RES` (target, resName, type SET|CHANGE, value) меняет существующий ресурс; перк может стоить ресурсов (`perk.resources:[{name,amount}]`); условие/сегмент `parameter:'RES'` (name, target) читает счётчик. Показывается чипами под бойцом. Демо: «Стрелы 3/5», «Выстрел из лука» (−1 стрела), «Собрать стрелы» (EDIT_RES +2).
- **EXIST на нестатусном параметре**: символ EXIST/HAVE/EMPTY имеет смысл только для STATUS (по спеку); на STOCK/HP не применять.

Эти пункты — следующий шаг, если понадобится полноценный кампанейный режим.

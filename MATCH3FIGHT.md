# Match-3 Fight (`game:'match3fight'`)

Веб-порт боевого цикла Android-приложения **twiligihts**. Отдельная страница `match3fight/index.html`.
Использует **те же имена полей JSON**, что и `SCENE_CREATION_GUIDE.md` / `ENEMY_AI.md`.
Неизвестные поля игнорируются (forward-compat) — более полная Android-сцена загрузится без ошибок.

> **Статус: полный паритет движка 1:1 с Android (блоки A–G).** Аудит и список различий — в
> `MATCH3FIGHT_PARITY.md`. Реализованы: жизненный цикл статусов (`isActive`/`compareValue`/`times`/
> duration→value0), боёвка с `isWork`-бросками + расходом `times`, VAMP/DODGE/SMART_DODGE/
> COUNTERATTACK/HARM/REACTION, STUN-подавление-с-оплатой, scope целей и флаги `ignore*`/`help`,
> общий `executeIfAvailable` (авто-перки/триггеры/реакции через полный gate), `reloadType`
> TURN/PERK/COMBO, category-эксклюзив, StockPerk/TimePerk, очки по связным группам (BFS) с
> правилом раз-на-группу, дуальные гемы 0.5, `Settings.cells` (MULTIPLIER/ADDITIVE/TRIGGER),
> **раздельные пулы стоков** героя и врага, условия (ALL=AND, EXIST, SP, ATTEMPT, первый активный),
> EDIT_STATUS-merge, EDIT_STOCK ALL/ADD/REMOVE, EDIT_RES, DEFEND SET. Округления — truncate (toInt).

## Боевой цикл

1. Поле 3-в-ряд **8×8** (Android `GameBoard`: 8×8). Цвет гема `g` (0-based) → `gemType = g+1`.
2. **Одно успешное совмещение за ход** (доска блокируется крышкой до следующего хода) + каскады. Кнопка «Завершить ход» доступна всегда в свой ход — можно пропустить без совмещения.
3. Совпадение даёт очки (**Stock**) по правилам `gemSettings` + `Settings.cells`; правила `heroRules` срабатывают раз на связную группу.
4. Ладони героя (`heroHands`) группируют навыки (`perks`) по `gemType`. Навык стоит `prices`/`resources` и запускает `effects[]`.
5. У героя и врага есть `hp / maxHp / shield(барьеры) / statuses / resources`.
6. **Цель по части тела:** сначала тапнуть сектор противника (`EnemySectors` → статус «Цель: X»), затем применить навык — он действует на выбранный сектор (двухшаговое наведение НЕ используется: перк зависит от уже выбранного сектора, как в движке).
7. **«Завершить ход»** → распад стоков (`turnKeepStrategy`) → ход врага → возврат герою.
8. Победа при `enemy.hp ≤ 0`, поражение при `hero.hp ≤ 0`.

## Интерфейс (раскладка как в Android)

- **Поле сверху** на всю ширину (фиксировано); таймер раунда ⏱ и очки — над полем.
- Под полем — **две колонки: игрок СЛЕВА, противник СПРАВА** (Android `heroBlock`/`enemyBlock`). Статусы растут вниз внутри своей колонки → поле не дёргается.
- **Выдвижные панели рук** по краям: лево — руки героя, право — руки противника (read-only). Тап по руке → её навыки **оверлеем поверх поля** (план 2); ✕ — назад к полю (план 1). Оверлей пере-рендерится при смене состояния/цели (`conditionsForDisplay`).
- Самонаведённые навыки (лечение/щит) — сразу; навыки по врагу — после выбора сектора.
- Заголовки сайта на боевом экране скрыты.

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
| `makeEnemyMove` | false | `true` — враг делает один реальный свайп + каскады перед навыками |
| `animateEnemy` | false | анимация перков врага (полёт иконки) vs мгновенное применение |
| `cells` | — | модификаторы клеток: MULTIPLIER / ADDITIVE / TRIGGER |
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
| `conditionsForDisplay` | **реализовано** — DSL условий проверяется (видимость ладони/перка) |

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
| `reloadType` | "TURN" | `TURN` (раунд) / `PERK` (на применение) / `COMBO` (сброс в конце хода) |
| `charges` | null | конечное число применений |
| `probability` | 100 | % срабатывания (бросок `isWork`; + `pFunc`) |
| `conditionsForEnable` / `conditionsForDisplay` | — | DSL условий (доступность/видимость) |
| `place` | false | пассивный (парсится, отложен) |

**Взаимоисключение:** навыки с одинаковыми `category` + `coolDown:1` + `reloadType:"TURN"` — только один за ход.

### effect
Общие: `command`, `target` (`HERO|ENEMY|SELF|FOE|ALL`), `value`, `probability` (default 100), `func`, `pFunc`, `repeats`, `rFunc`.

`func`/`pFunc` поддерживают: `dice` (`+rand(1..N)`) и `segments` с `parameter:"STOCK"` (`+ stock[gemType] × mul`). Прочие параметры segments игнорируются.

| command | поля | поведение |
|---------|------|-----------|
| `ATTACK` | `type` (`BOTH`/`SP`/`HP`), `ignore*`/`help` | формула щит/броня/HP (см. ниже) |
| `DEFEND` | `type` (`CHANGE`/`SET`), `value` | `CHANGE: shield+=value`, `SET: shield=value` (+ статус `CHANGE_DEFEND` с `isWork`) |
| `HEAL` | `type` (`CHANGE`/`SET`) | `CHANGE: hp+=value` (cap maxHp), `SET: hp=value`; отрицательное = урон |
| `EDIT_STOCK` | `type` (`CHANGE`/`SET`/`ADD`/`REMOVE`), `gemTypes[]`, `target` | изменить стоки выбранной стороны (ALL=пул героя), не ниже 0 |
| `EDIT_STATUS` | `type` (`SET`/`CHANGE`/`TIMES`), `status{}` | merge по value/duration/times как в Android |
| `EDIT_RES` | `resName`, `type` (`SET`/`CHANGE`), `target` | именованный ресурс (стрелы/заряды) |
| `INFO` | `message` / `title` | строка в лог (title → разделитель «—») |

**Формула ATTACK** (порядок, как `ApplyAttackExecutor`):
1. Если `selfTarget` — модификаторы статусов НЕ применяются (сырое значение). Иначе каждый модификатор применяется через бросок `isWork` (`isActive` + `Random(0..100) ≤ probability`) и расходует `times`:
   - `WEAK`(−)/`STRONG`(+) у **источника**; `VULNERABLE`/`VUL`(+)/`ARMOR`(−)/`RESISTANCE`(×) у цели по **scope** `effect.target` (не только у буквальной цели). `coerce ≥ 0`. Флаги `ignore*` пропускают соответствующий модификатор; `help` — атака без модификаторов источника/контратак/вампиризма.
2. Шанс попадания `= 100 − Σ EVASION(цель) + Σ ACCURACY(источник)` (ближний/мгновенный = 100). Промах → «Промах!». Затем `SMART_DODGE`/`DODGE` цели может полностью свести атаку (расход `times`, если не `ignoreDodge`).
3. Применение: барьеры (`shield` как ряд) → броня → HP. `BOTH` (по умолчанию) — `absorbed=min(v,shield); shield-=absorbed; hp-=(v−absorbed)`; `SP` — только щит; `HP` — пробивает щиты.
4. **VAMP**: источник лечится на `floor(hpDamage×value/100)` (расход `times`). **Контратаки** `COUNTERATTACK`/`HARM`/`REACTION` цели — ответ на атаку.
5. После урона по HP героя — `damageKeepStrategy` распад стоков.

> Имя атаки по умолчанию = `BOTH`.

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

Реализованные типы: `DAMAGE`, `DAMAGE_HP`, `HEAL`, `DEFEND`, `ARMOR` (вероятностный блок), `STRONG`, `WEAK`, `VULNERABLE`/`VUL`, `STUN`, `GENERATE`, `CHANGE_STOCK`, `RESISTANCE`/`EVASION`/`ACCURACY`, `CHANGE_DEFEND`, `CHANGE_TURN_KEEP_STRATEGY`, `VAMP`, `DODGE`/`SMART_DODGE`, `COUNTERATTACK`/`HARM`/`REACTION`, `INFO`. Неизвестные типы игнорируются.

`isActive()`: статус действует только если `(duration==-1||duration>0) && compareValue() && (times==null||times>0)` — статус со `value 0` (вкл. `skipZero`) считается отсутствующим. `end:false` → ПЕРЕД ходом владельца, `end:true` → ПОСЛЕ; декремент `duration` только когда активен (при duration 0 держится `value=0`, не удаляется).

### heroRules (MatchRule)
| Поле | По умолчанию | Описание |
|------|--------------|----------|
| `orientation` | null=любая | `HORIZONTAL`/`VERTICAL` (T/L-формы → отложены) |
| `gemType` | null=любой | цвет |
| `minSize` | 3 | мин. размер совпадения |
| `perk` | — | объект с `effects[]`, выполняется при совпадении |

Все подходящие правила срабатывают (без исключительности).

## Враг (`ENEMY_AI.md`)
1. Статусы `end:false` врага; барьеры сбрасываются.
2. При `makeEnemyMove:true` — один случайный свайп + каскады (очки/правила врага).
3. Ладони сверху-вниз → **все** перки с `show && enable` применяются по порядку (не «один лучший»; без лишнего броска вероятности на каст — вероятность только внутри эффектов). `EnemySectors`/`EnemyHands` игроку не показываются (правая панель — read-only просмотр).
4. Статусы `end:true`. Возврат хода герою.
5. `STUN` — подавление **по-перково с оплатой** (стоимость платится, эффекты гасятся, один STUN расходуется на попытку), а не пропуск всего хода; на доске оглушённый враг всё равно делает свайп.

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

## Реализовано (было «отложено в v1»)

Раздельные пулы стоков героя/врага; `Settings.cells` (MULTIPLIER/ADDITIVE/TRIGGER); двухцветные гемы (вес 0.5);
TimePerks / StockPerks через общий `executeIfAvailable`; продвинутые статусы (DODGE/SMART_DODGE, COUNTERATTACK/HARM,
REACTION, VAMP, INFO); DSL `conditions`/`conditionsForDisplay`/`conditionsForEnable` (ALL=AND, EXIST, SP, ATTEMPT,
STATUS=первый активный); `reloadType` PERK/COMBO; флаги `ignore*`/`help`; реальный свайп врага (`makeEnemyMove`);
EDIT_RES (именованные ресурсы), EDIT_STATUS-merge, EDIT_STOCK ALL/ADD/REMOVE, DEFEND SET; связные группы очков (BFS);
сектора (`EnemySectors`); загрузка реальной сцены через `?scene=NAME` (формат Android с заглавными ключами).

## Загрузка сцены и тесты

- `?scene=NAME` → грузит `match3fight/scenes/NAME.json` (формат Android: `Hero/Enemy/HeroHands/Settings/EnemySectors/…`). Адаптер нормализует в внутренний вид.
- Отправка теста: `send_miniapp.py <chat> "<подпись>" match3fight --scene <NAME>` (см. [[feedback_send_tests_via_script]]).
- Пример сцены: `scenes/zevft_ogr.json` (Зевфт против Огра Фоса).
- Деплой через GitHub Pages; при частых пушах возможен лаг сборки — см. [[github-pages-deploy-lag]].

## Осознанные упрощения

- `place`-перки (пассивные), `additionalEffects`/`successType`, `gif`, `wounds`, ориентации `T_SHAPE`/`L_SHAPE`/`OTHER` — парсятся, на механику пока не влияют.
- Условие на «очки за конкретный матч в каскаде» отсутствует (по очкам; см. диалог — такого условия в движке тоже нет).
- ALL-атака на self-сторону: Android шлёт модифицированное значение, веб — сырое (редкий edge, задокументирован в `MATCH3FIGHT_PARITY.md`).

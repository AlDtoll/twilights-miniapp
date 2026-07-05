# Tejeduria Mini App — инструкция для ИИ-бота-мастера

## Что это

Telegram WebApp с мини-играми для ролевой игры **Tejeduria**.
URL: `https://loreworlds.ru:8443/tejeduria/`
Репо (общий, игры для всех сеттингов): `AlDtoll/twilights-miniapp`

Скрипт запуска: `tejeduria/minigames/send_miniapp_tejeduria.py` в репо `twilights-world` (клон tejeduria).

> Инфраструктура общая с Twilights (тот же домен, веб-корень, `shared/core.js`). Игры называются
> нейтрально и по сути общие — Tejeduria подключает у себя только то, что ей нужно. Пока это две руны.

### Запуск (важно)

Токен берётся ТОЛЬКО из окружения (в файле не хранится):

```bash
set -a && source /home/claudeuser/.claude/env/secrets.env && set +a
export TELEGRAM_BOT_TOKEN="$TEJEDURIA_BOT_TOKEN"
python3 tejeduria/minigames/send_miniapp_tejeduria.py <chat_id> "<текст>" <game> [опции]
```

3 позиционных аргумента: `chat_id text game`, затем флаги. Кнопка идёт через **ReplyKeyboard**
(так работает `tg.sendData` для возврата результата) — поэтому шлётся **только в личку** игрока.

---

## Игры

### rune-reaction — Испытание реакции (сетка вспыхивающих рун)

На сетке `size×size` поочерёдно вспыхивают руны — нужно коснуться активной руны, пока она горит.
Проверяет скорость реакции и внимание. Быстрее вспышки (`--speed`) и больше сетка = сложнее.

```bash
python3 tejeduria/minigames/send_miniapp_tejeduria.py <chat_id> "🌀 Проверка реакции" rune-reaction \
  --size 4 --time-limit 25 --speed 900 --prompt "Плетение требует концентрации."
```

- `--size 3|4|5` — размер сетки (по умолч. 3)
- `--time-limit N` — лимит времени, сек (по умолч. 20)
- `--speed N` — мс между сменами активной руны (меньше = быстрее = сложнее)
- `--prompt "…"` — нарративный текст перед стартом
- `--label "…"` — текст кнопки (по умолч. «🌀 Испытание реакции»)
- `--result-chat CHAT_ID` — доставить результат в другой чат

Результат: `{"game":"rune-reaction","size":4,"hits":N,"total":M,"accuracy":0.0-1.0,"outcome":"Мастерски|Отлично|Хорошо|Неплохо|Провал","level":0-4}`
Уровень по точности: ≥0.85→4, ≥0.70→3, ≥0.50→2, ≥0.30→1, иначе 0.

### rune-puzzle — Сложи руну (слайдер-пазл, 15-puzzle)

Плитки руны перемешаны на сетке `size×size` — собрать исходный узор, меняя плитки местами.
Проверяет пространственное мышление/усидчивость. Быстрее собрал = выше исход.

```bash
python3 tejeduria/minigames/send_miniapp_tejeduria.py <chat_id> "🧩 Сложи руну" rune-puzzle \
  --size 3 --time-limit 120 --shuffle 40 --rune-index 2 --prompt "Восстанови плетение руны."
```

- `--size 3|4|5` — размер сетки (по умолч. 3; лимит по умолч. 120/180/240 сек)
- `--time-limit N` — лимит времени, сек
- `--shuffle N` — число ходов перемешивания (больше = сложнее)
- `--rune-index 0-7` — какой узор руны собирать
- `--prompt "…"` — нарративный текст перед стартом
- `--label "…"` — текст кнопки (по умолч. «🧩 Сложи руну»)
- `--result-chat CHAT_ID` — доставить результат в другой чат

Результат: `{"game":"rune-puzzle","size":3,"solved":true|false,"timeSeconds":N,"moves":N,"outcome":"Мастерски|Отлично|Хорошо|Провал","level":0-4}`
Не собрал за время → `solved:false`, «Провал», level 0. Собрал → уровень по затраченному времени.

---

## Как результат возвращается мастеру

Игрок доиграл → `sendResultToBot(obj)` (в `shared/core.js`) → `Telegram.WebApp.sendData` → бот получает
апдейт `message.web_app_data.data` (JSON-строка выше). Токен в URL не нужен, доставка нативная.
Хук бота-мастера Tejeduria должен разбирать `web_app_data` и разворачивать исход по `outcome`/`level`.

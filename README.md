# twilights-miniapp

Статический фронтенд для **Twilights** («Сумерки мира»): Telegram Mini App с мини-играми и веб-дашборды игрока.

Канон, скрипты забега и запуск игр из чата — в репозитории [twilights-world](https://github.com/AlDtoll/twilights-world).

## Где смотреть

| Что | URL |
|-----|-----|
| **Дашборд игрока** | https://aldtoll.github.io/twilights-miniapp/player.html?run=run_007&player=danil |
| **Карта области** | https://aldtoll.github.io/twilights-miniapp/map.html?run=run_007&player=danil |
| **Мини-игры (GitHub Pages)** | https://aldtoll.github.io/twilights-miniapp/ |
| **Мини-игры (прод, Telegram WebApp)** | https://loreworlds.ru:8443/ |

Параметры `run` и `player` — id забега и папки игрока в `twilights/runs/` (например `run_007`, `danil`).

На VPS дашборд и `data/` также катятся в `/var/www/loreworlds` (основной хост `loreworlds.ru`).

## Что внутри

```
twilights-miniapp/
├── index.html          # лаунчер мини-игр (Telegram WebApp)
├── player.html         # дашборд: казна, НП, герой, лояльность, вера, угроза…
├── map.html            # карта области + панорамы поселений
├── data/               # JSON, генерируется из twilights-world (не править руками)
│   ├── index.json      # список забегов для дропдауна
│   ├── run_NNN_<player>.json
│   └── run_NNN_neutrals.json
├── assets/             # спрайты панорам (здания, стража, ополчение, лавки…)
├── shared/             # общие утилиты для игр
├── <game>/             # ~50 мини-игр, у каждой свой index.html
└── AI_USAGE.md         # параметры игр для мастера / send_miniapp.py
```

### Дашборд (`player.html`)

Читает `data/run_*_<player>.json`. Блоки: карта области, казна, постройки, события, сезонные роллы, очаг, герой, свита, персонал, территория, мощь, лояльность, вера, рост, угроза, НП.

У каждого НП — **панорама поселения**: здания по слотам, стража у ворот, ополчение за ними (спрайты из `assets/`).

### Карта (`map.html`)

Обзор клеток области, дороги, нейтралы. Клик по НП — та же панорама, что в дашборде.

### Мини-игры

Отдельная папка на игру (`blackjack/`, `timing/`, `hex/`, `rune-puzzle/`, …). Мастер шлёт кнопку WebApp через `twilights/minigames/send_miniapp.py` в репо twilights-world; результат уходит в Telegram-чат.

Полный каталог типов проверок и CLI-параметры — в [AI_USAGE.md](./AI_USAGE.md). Список ключей игр синхронизирован с `GAME_SUBPATH` в `send_miniapp.py`.

## Обновление данных дашборда

Источник правды — файлы забега в twilights-world (`settlements.md`, `finance.md`, `hero_status.md`, …).

```bash
# из клона twilights-world на VPS
cd ~/sessions/twilights-world/workspace/twilights-world
twilights/scripts/push_dashboard.sh
```

Скрипт:

1. Запускает `generate_miniapp_data.py` → пишет JSON в `~/twilights-miniapp/data/`
2. Синхронизирует `data/` и HTML (`player.html`, `map.html`) на `loreworlds.ru`
3. При изменениях в `data/` — коммит `auto: dashboard …` и push в этот репозиторий (GitHub Pages)

Точечно:

```bash
python3 twilights/scripts/generate_miniapp_data.py --run run_007 --player danil
```

После смены дорог / нейтралов может понадобиться `road_update.py` (см. twilights-world).

## Ассеты панорам

`assets/buildings/` — PNG по архетипам построек (`masterskaya.png`, `uprava.png`, …).  
`assets/guards/`, `assets/militia/`, `assets/houses/`, `assets/shops/` — фигурки на панораме.

Имена файлов и привязка к слотам — в `generate_miniapp_data.py` и логике `player.html` / `map.html`. После замены картинки на GitHub Pages обновление — 1–2 минуты; на loreworlds — через `push_dashboard.sh` или ручной `cp`.

## Разработка

- Статика, без сборщика: правки HTML/CSS/JS → commit → GitHub Pages.
- Проверка страниц локально: любой HTTP-сервер из корня репо (`python3 -m http.server`).
- Игры: править `/<game>/index.html`, сверяться с [AI_USAGE.md](./AI_USAGE.md) и `check_ai_usage_sync.py` в twilights-world.

## Связанные репозитории

| Репо | Роль |
|------|------|
| [twilights-world](https://github.com/AlDtoll/twilights-world) | канон, run-данные, `generate_miniapp_data.py`, `send_miniapp.py` |
| twilights-web-room (VPS) | веб-комната / чат с мастером (отдельно от этого репо) |

## Лицензия / доступ

Приватный проект забега Twilights. Публичный репозиторий — для GitHub Pages и совместной разработки UI.

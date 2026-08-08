"""
Bake-скрипт: рендерит Управу из uprava_engine.html headless-Playwright,
удаляет фон (небо + тень) прямо в DOM, сериализует чистый SVG с прозрачным
фоном и сохраняет в assets/uprava.svg.
"""
import pathlib
import sys

from playwright.sync_api import sync_playwright

ENGINE_PATH = pathlib.Path('/home/claudeuser/.claude/skills/auto/twilights-tech/building-drawing/uprava_engine.html')
OUT_PATH    = pathlib.Path('/home/claudeuser/twilights-miniapp/assets/uprava.svg')

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Открываем движок как file:// URI, ждём domcontentloaded
        page.goto(ENGINE_PATH.as_uri(), wait_until='domcontentloaded')

        # Ждём появления SVG в DOM — движок рендерит синхронно, детерминированно
        page.wait_for_selector('#c svg', state='attached')

        # Убираем фон прямо в DOM (не трогаем файл движка):
        # 1. Небо: <rect fill="#c8dff0"> внутри #c svg
        # 2. Тень: <ellipse filter="url(#shadowBlur)"> внутри #c svg
        page.evaluate("""() => {
            const svg = document.querySelector('#c svg');
            if (!svg) throw new Error('SVG не найден в #c');

            // Удаляем небо-rect (fill == '#c8dff0')
            for (const el of Array.from(svg.querySelectorAll('rect'))) {
                if (el.getAttribute('fill') === '#c8dff0') {
                    el.remove();
                }
            }

            // Удаляем тень-ellipse (атрибут filter содержит 'shadow')
            for (const el of Array.from(svg.querySelectorAll('ellipse'))) {
                const f = el.getAttribute('filter') || '';
                if (f.includes('shadow')) {
                    el.remove();
                }
            }

            // Удаляем мёртвый фильтр тени из defs (использовался только ellipse)
            const shadowFilter = svg.querySelector('filter#shadowBlur');
            if (shadowFilter) {
                shadowFilter.remove();
            }
        }""")

        # Сериализуем очищенный SVG
        svg_html = page.evaluate("document.querySelector('#c svg').outerHTML")

        browser.close()

    # Проверки
    if 'xmlns' not in svg_html:
        sys.exit('ОШИБКА: в SVG отсутствует xmlns — движок не добавил атрибут')
    if 'viewBox' not in svg_html:
        sys.exit('ОШИБКА: в SVG отсутствует viewBox — движок не добавил атрибут')
    if '#c8dff0' in svg_html:
        sys.exit('ОШИБКА: фон #c8dff0 всё ещё присутствует в SVG — небо не удалено')
    if '<ellipse' in svg_html:
        sys.exit('ОШИБКА: <ellipse> всё ещё присутствует в SVG — тень-ellipse не удалена')
    if 'shadowBlur' in svg_html:
        sys.exit('ОШИБКА: shadowBlur всё ещё присутствует в SVG — фильтр тени не удалён из defs')

    # Сохраняем
    OUT_PATH.write_text(svg_html, encoding='utf-8')

    size = OUT_PATH.stat().st_size
    print(f'Записано: {OUT_PATH}')
    print(f'Размер: {size} байт')
    print(f'Начало SVG (200 символов): {svg_html[:200]}')

if __name__ == '__main__':
    main()

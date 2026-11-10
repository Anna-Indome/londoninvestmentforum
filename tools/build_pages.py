"""Сборка страниц /terms, /privacy, /thanks из content/*.md. Запуск: python3 tools/build_pages.py"""
import pathlib, markdown

ROOT = pathlib.Path(__file__).resolve().parent.parent
TPL = '''<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title} — Лондонский инвестиционный форум 2027</title>
<link rel="icon" href="/img/9841853c5a16fb129010040a45cef244.png">
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@600;700;800&family=Raleway:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/page.css">
</head>
<body>
<header class="top"><a href="/">← Лондонский инвестиционный форум 2027</a></header>
<main class="doc">
{body}
</main>
<footer class="foot">InDome Investment Management Limited · 15132902 · <a href="mailto:info@indome.co.uk">info@indome.co.uk</a> · <a href="/terms">Правила</a> · <a href="/privacy">Конфиденциальность</a></footer>
</body>
</html>
'''
for name in ('terms', 'privacy', 'thanks'):
    md = (ROOT / 'content' / f'{name}.md').read_text(encoding='utf-8')
    title = md.splitlines()[0].lstrip('# ').strip()
    body = markdown.markdown(md, extensions=['tables'])
    (ROOT / 'public' / f'{name}.html').write_text(TPL.format(title=title, body=body), encoding='utf-8')
    print('ok', name)

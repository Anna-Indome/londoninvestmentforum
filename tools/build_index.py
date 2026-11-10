"""Сборка public/index.html из макета Claude Design (Main.dc.html).

Запуск: python3 tools/build_index.py <путь к Main.dc.html>
Макет — источник вёрстки; форма регистрации и скрипты заменяются статическими.
"""
import re, sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
ACCENT = '#DBA15D'
IMG_EXT = {
    '9841853c5a16fb129010040a45cef244': 'png', 'cc29c67baf32f60f74414b7963d4de5d': 'jpg',
    '9295b4e86e6f589471f54908987da860': 'jpg', '9cac9ef7da36360e221442d51fbe33cc': 'jpg',
    'd09fb2515d8d44a93fb54c731f2945d9': 'png', '05190301c238854aacaced8ca85ea0d1': 'png',
    '3aa3304c50db1e83d566e95fb44d0eb0': 'png', '77632e2ff866d0e573f67b204df392d3': 'png',
}

src = pathlib.Path(sys.argv[1]).read_text(encoding='utf-8')
helmet = re.search(r'<helmet>(.*?)</helmet>', src, re.S).group(1)
body = re.search(r'</helmet>(.*?)</x-dc>', src, re.S).group(1)
form = (ROOT / 'tools' / 'form.html').read_text(encoding='utf-8')

i = body.index('    <form id="reg-form"'); j = body.index('</form>', i) + len('</form>\n')
body = body[:i] + form + body[j:]

def blob(m):
    bid = m.group(1)
    return f"/img/{bid}.{IMG_EXT.get(bid, 'png')}"

def transform(t):
    t = re.sub(r'/_blob/([0-9a-f]{32})', blob, t)
    t = t.replace('{{accent}}', ACCENT)
    for k in ('cdDays', 'cdHours', 'cdMins', 'cdSecs'):
        t = t.replace('{{' + k + '}}', '--')
    t = re.sub(r'onClick="\{\{ pick\.(\w+) \}\}"', lambda m: MAP[m.group(1)], t)
    return t

MAP = {'guest': 'data-reg="guest"', 'vip': 'data-reg="vip"', 'investor': 'data-reg="investor"',
       'sponsor': 'data-reg="sponsor"', 'guestDeal': 'data-reg="guest" data-dealroom="1"',
       'guestSpeaker': 'data-reg="guest" data-speaker="1"'}
helmet = transform(helmet)
body = transform(body)
body = re.sub(r'min-height: \d+px; box-sizing', 'box-sizing', body, count=1)
body = body.replace('<a href="#top" style="color: #9F9F9F;">Политика конфиденциальности</a>', '<a href="/privacy" style="color: #9F9F9F;">Политика конфиденциальности</a>')
body = body.replace('<a href="#top" style="color: #9F9F9F;">Условия участия</a>', '<a href="/terms" style="color: #9F9F9F;">Условия участия</a>')
assert '{{' not in helmet + body, re.findall(r'\{\{[^}]*\}\}', body)[:5]

head = '''<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=1440">
<title>Лондонский инвестиционный форум 2027 · 24 марта · Drapers' Hall</title>
<meta name="description" content="Лондонский инвестиционный форум для бизнес-сообщества. 24 марта 2027, Drapers' Hall, Лондон.">
<link rel="icon" href="/img/9841853c5a16fb129010040a45cef244.png">
<link rel="stylesheet" href="/css/site.css">
'''
# helmet уже содержит <link> и <style>; переносим их в <head>, разметку — в <body>
html = head + helmet.strip() + '\n</head>\n<body>\n' + body.strip('\n') + '\n<script src="/js/site.js" defer></script>\n</body>\n</html>\n'
(ROOT / 'public' / 'index.html').write_text(html, encoding='utf-8')
print('ok', len(html))

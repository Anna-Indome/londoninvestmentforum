# London Investment Forum 2027 — сайт и регистрация

Лендинг форума (24 марта 2027, Drapers' Hall) с обязательной формой регистрации, оплатой через Stripe и записью участников в Google-таблицу. Хостинг — Cloudflare Pages.

## Как это работает

1. Участник заполняет форму на сайте. Без обязательных полей и согласия с правилами она не отправляется.
2. `functions/api/register.js` (Cloudflare) проверяет поля и передаёт их скрипту Google-таблицы.
3. `apps-script/Code.gs` записывает строку со статусом «ожидает оплаты» (спонсор — «заявка спонсора») и шлёт письмо на info@indome.co.uk.
4. Участник уходит на страницу оплаты Stripe своего билета; почта и номер регистрации (`client_reference_id`) уже подставлены.
5. После оплаты Stripe возвращает его на `/thanks` и шлёт событие на `functions/api/stripe-webhook.js`, который проверяет подпись и меняет статус в таблице на «оплачено» (+ сумма, дата, номер платежа). Брошенная оплата → «не оплачено», возврат → «возврат».

## Структура

```
public/                 сайт (папка публикации Cloudflare Pages)
  index.html            лендинг (собран из макета Claude Design)
  terms.html            правила участия, оплаты и возврата  → /terms
  privacy.html          политика конфиденциальности        → /privacy
  thanks.html           страница после оплаты               → /thanks
  css/, js/site.js      стили формы, логика формы и счётчика early bird
  img/                  изображения (см. img/README.md)
functions/api/          серверные функции Cloudflare Pages
  register.js           POST /api/register
  stripe-webhook.js     POST /api/stripe-webhook
apps-script/Code.gs     скрипт для Google-таблицы
content/*.md            тексты /terms, /privacy, /thanks
tools/                  сборка страниц из макета и markdown
```

## Запуск: шаг за шагом

### 1. Google-таблица и скрипт

1. Откройте таблицу **LIF2027_Registration_list** → «Расширения» → «Apps Script».
2. Вставьте содержимое `apps-script/Code.gs` вместо кода по умолчанию, сохраните.
3. «Настройки проекта» (шестерёнка) → «Свойства скрипта» → добавьте:
   - `SECRET` — длинный случайный ключ (например, 40 случайных символов). Тот же ключ пойдёт в Cloudflare как `APPS_SCRIPT_SECRET`.
   - `NOTIFY_EMAIL` — `info@indome.co.uk` (можно не указывать, это значение по умолчанию).
4. «Начать развёртывание» → «Новое развёртывание» → тип «Веб-приложение»: выполнять от имени «Меня», доступ «Все». Разрешите доступ к таблицам и почте.
5. Скопируйте URL веб-приложения (`https://script.google.com/macros/s/…/exec`).

Письма уходят от имени аккаунта, который развернул скрипт. Лимит: около 100 писем в сутки для обычного аккаунта Google и около 1500 для Google Workspace.

После изменения `Code.gs` нужно «Управление развёртываниями» → изменить → «Новая версия», иначе работает старый код.

### 2. Stripe

1. Settings → Business → Public details: сайт, почта поддержки info@indome.co.uk, Terms of service URL `https://<домен>/terms`, Privacy policy URL `https://<домен>/privacy`.
2. Для каждого билета — Payment Link: количество 1 (без изменения), лимит оплат 150 / 20 / 40, сбор имени, компании и VAT-номера, «Require customers to accept your terms of service», после оплаты — переход на `https://<домен>/thanks`.
3. Workbench → Webhooks → Add destination: `https://<домен>/api/stripe-webhook`, события `checkout.session.completed`, `checkout.session.expired`, `charge.refunded`. Скопируйте секрет `whsec_…`.

Сначала всё делается в тестовом режиме (Sandbox), потом повторяется в боевом.

### 3. Cloudflare Pages

1. Workers & Pages → Create → Pages → Connect to Git → репозиторий `herman-aleron/londoninvestmentforum`, ветка `main`.
2. Build settings: Framework preset — **None**, Build command — пусто, Build output directory — **`public`**. Папку `functions/` Cloudflare подхватит сам.
3. Settings → Variables and Secrets (Production, а при необходимости и Preview):

| Переменная | Значение |
| --- | --- |
| `APPS_SCRIPT_URL` | URL веб-приложения из шага 1 |
| `APPS_SCRIPT_SECRET` | тот же ключ, что `SECRET` в скрипте (тип Secret) |
| `STRIPE_LINK_GUEST` | ссылка на оплату «Гость» (`https://buy.stripe.com/…`) |
| `STRIPE_LINK_VIP` | ссылка на оплату «VIP гость» |
| `STRIPE_LINK_INVESTOR` | ссылка на оплату «Инвестор» |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` из Stripe (тип Secret) |

4. Redeploy, проверить сайт на `<проект>.pages.dev`.
5. Custom domains → добавить домен форума; у регистратора — запись CNAME, которую покажет Cloudflare.

После 01.02.2027 (конец early bird) создайте новые цены и ссылки в Stripe и замените `STRIPE_LINK_*` в Cloudflare — код менять не нужно. Дату счётчика можно поменять в `public/js/site.js` (`END`).

### 4. Проверка перед запуском (тестовый режим, карта 4242 4242 4242 4242)

- [ ] Форма без обязательных полей не отправляется
- [ ] Гость: строка «ожидает оплаты» + письмо на info@ → оплата → `/thanks` → «оплачено» с суммой
- [ ] VIP и Инвестор — то же самое
- [ ] Спонсор: строка «заявка спонсора» + письмо, без перехода в Stripe
- [ ] Возврат в Stripe → «возврат»
- [ ] Боевые ссылки и `whsec_` в Cloudflare, одна реальная оплата и возврат, тестовые строки удалены

## Правки сайта

- **Лендинг** собирается из макета Claude Design: `python3 tools/build_index.py <путь к Main.dc.html>`. Форма — `tools/form.html`, её логика — `public/js/site.js`.
- **Правила и политика**: правьте `content/terms.md` / `content/privacy.md`, затем `python3 tools/build_pages.py` (нужен `pip install markdown`).
- Каждый push в `main` Cloudflare публикует автоматически.

## Известные ограничения

- Лендинг свёрстан под ширину 1440 px; на телефонах он показывается уменьшенной копией десктопа (`<meta name="viewport" content="width=1440">`). Мобильную версию нужно сделать до активной рекламы.
- Изображения нужно добавить в `public/img/` (список в `public/img/README.md`).
- В `/terms` и `/privacy` остались пункты в квадратных скобках (дата редакции, НДС, номер ICO) — заполнить после согласования с юристом.

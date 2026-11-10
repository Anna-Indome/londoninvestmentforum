/**
 * Лондонский инвестиционный форум 2027 — приём регистраций в Google-таблицу.
 *
 * Скрипт привязан к таблице LIF2027_Registration_list (Расширения → Apps Script).
 * Его вызывает только сайт на Cloudflare (functions/api/*), запросы подписаны секретом.
 *
 * Свойства скрипта (Настройки проекта → Свойства скрипта):
 *   SECRET        — длинный случайный ключ, тот же, что APPS_SCRIPT_SECRET в Cloudflare (обязательно)
 *   NOTIFY_EMAIL  — куда слать уведомления о регистрациях (по умолчанию info@indome.co.uk)
 *   SHEET_NAME    — имя листа (по умолчанию первый лист таблицы)
 */

var HEADERS = [
  'ID регистрации', 'Дата и время (UTC)', 'Тип билета', 'Имя и фамилия', 'Компания и роль', 'Email',
  'Телефон / мессенджер', 'LinkedIn / сайт', 'Кто вы на форуме', 'Уточнение (Другое)', 'Комментарий',
  'Deal Room (фаундер)', 'Питч-сессии (инвестор)', 'Спикер', 'Тема выступления', 'Согласие UK GDPR',
  'Статус', 'Сумма оплаты (£)', 'Дата оплаты (UTC)', 'Stripe Session ID',
  'Согласие на рассылку', 'Согласие на передачу контактов спонсорам'
];
var COL = {}; // имя столбца → номер (1-based)
HEADERS.forEach(function (h, i) { COL[h] = i + 1; });

var TICKETS = { guest: 'Гость', vip: 'VIP гость', investor: 'Инвестор', sponsor: 'Спонсор' };

var STATUS = {
  pending: 'ожидает оплаты',
  sponsor: 'заявка спонсора',
  paid: 'оплачено',
  expired: 'не оплачено',
  refunded: 'возврат'
};

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var props = PropertiesService.getScriptProperties();
    var secret = props.getProperty('SECRET');
    if (!secret || body.secret !== secret) return json({ ok: false, error: 'forbidden' });

    if (body.action === 'register') return json(register(body.data, props));
    if (body.action === 'payment') return json(updatePayment(body.data));
    return json({ ok: false, error: 'unknown action' });
  } catch (err) {
    console.error(err);
    return json({ ok: false, error: String(err) });
  }
}

function doGet() {
  return json({ ok: true, service: 'LIF2027 registrations' });
}

function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var name = PropertiesService.getScriptProperties().getProperty('SHEET_NAME');
  var sh = name ? ss.getSheetByName(name) : ss.getSheets()[0];
  // Заголовки: дописываем недостающие столбцы справа, существующие не трогаем.
  var lastCol = Math.max(sh.getLastColumn(), 1);
  var current = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  for (var i = 0; i < HEADERS.length; i++) {
    if (current[i] !== HEADERS[i]) sh.getRange(1, i + 1).setValue(HEADERS[i]);
  }
  sh.setFrozenRows(1);
  return sh;
}

function yes(v) { return v ? 'да' : ''; }

function register(d, props) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = sheet_();
    var ticket = TICKETS[d.ticket] || d.ticket;
    var status = d.ticket === 'sponsor' ? STATUS.sponsor : STATUS.pending;
    var row = new Array(HEADERS.length).fill('');
    row[COL['ID регистрации'] - 1] = d.id;
    row[COL['Дата и время (UTC)'] - 1] = new Date().toISOString().replace('T', ' ').slice(0, 19);
    row[COL['Тип билета'] - 1] = ticket;
    row[COL['Имя и фамилия'] - 1] = d.name;
    row[COL['Компания и роль'] - 1] = d.company;
    row[COL['Email'] - 1] = d.email;
    row[COL['Телефон / мессенджер'] - 1] = "'" + d.phone; // апостроф — чтобы +44 не стал формулой
    row[COL['LinkedIn / сайт'] - 1] = d.link;
    row[COL['Кто вы на форуме'] - 1] = d.role || '';
    row[COL['Уточнение (Другое)'] - 1] = d.roleOther || '';
    row[COL['Комментарий'] - 1] = d.comment || '';
    row[COL['Deal Room (фаундер)'] - 1] = yes(d.dealroom);
    row[COL['Питч-сессии (инвестор)'] - 1] = yes(d.pitch);
    row[COL['Спикер'] - 1] = yes(d.speaker);
    row[COL['Тема выступления'] - 1] = d.topic || '';
    row[COL['Согласие UK GDPR'] - 1] = yes(d.gdpr);
    row[COL['Статус'] - 1] = status;
    row[COL['Согласие на рассылку'] - 1] = yes(d.marketing);
    row[COL['Согласие на передачу контактов спонсорам'] - 1] = yes(d.sponsorShare);
    sh.appendRow(row);
  } finally {
    lock.releaseLock();
  }
  notify_(d, ticket, status, props);
  return { ok: true, id: d.id };
}

function notify_(d, ticket, status, props) {
  var to = props.getProperty('NOTIFY_EMAIL') || 'info@indome.co.uk';
  var rows = [
    ['ID регистрации', d.id], ['Тип билета', ticket], ['Статус', status],
    ['Имя и фамилия', d.name], ['Компания и роль', d.company], ['Email', d.email],
    ['Телефон / мессенджер', d.phone], ['LinkedIn / сайт', d.link],
    ['Кто вы на форуме', d.role], ['Уточнение', d.roleOther], ['Комментарий', d.comment],
    ['Deal Room (фаундер)', yes(d.dealroom)], ['Питч-сессии (инвестор)', yes(d.pitch)],
    ['Спикер', yes(d.speaker)], ['Тема выступления', d.topic],
    ['Рассылка', yes(d.marketing)], ['Передача контактов спонсорам', yes(d.sponsorShare)]
  ].filter(function (r) { return r[1]; });
  var esc = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
  var html = '<table cellpadding="6" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px">' +
    rows.map(function (r) {
      return '<tr><td style="color:#666;border-bottom:1px solid #eee">' + esc(r[0]) + '</td><td style="border-bottom:1px solid #eee">' + esc(r[1]) + '</td></tr>';
    }).join('') + '</table>';
  MailApp.sendEmail({
    to: to,
    replyTo: d.email,
    subject: 'Регистрация на форум: ' + ticket + ' — ' + d.name + ' (' + d.id + ')',
    htmlBody: '<p>Новая регистрация на Лондонский инвестиционный форум 2027.</p>' + html,
    name: 'London Investment Forum 2027'
  });
}

/**
 * Обновление статуса по событию Stripe.
 * d = { id: номер регистрации (client_reference_id) | '', status: 'paid'|'expired'|'refunded',
 *       amount, paidAt, session, paymentIntent }
 */
function updatePayment(d) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = sheet_();
    var last = sh.getLastRow();
    if (last < 2) return { ok: false, error: 'empty sheet' };
    var data = sh.getRange(2, 1, last - 1, HEADERS.length).getValues();
    var idx = -1;
    for (var i = data.length - 1; i >= 0; i--) {
      var r = data[i];
      if (d.id && r[COL['ID регистрации'] - 1] === d.id) { idx = i; break; }
      if (!d.id && d.paymentIntent && String(r[COL['Stripe Session ID'] - 1]).indexOf(d.paymentIntent) !== -1) { idx = i; break; }
    }
    if (idx === -1) return { ok: false, error: 'registration not found' };
    var rowNum = idx + 2;
    var current = data[idx][COL['Статус'] - 1];

    if (d.status === 'paid') {
      sh.getRange(rowNum, COL['Статус']).setValue(STATUS.paid);
      sh.getRange(rowNum, COL['Сумма оплаты (£)']).setValue(d.amount);
      sh.getRange(rowNum, COL['Дата оплаты (UTC)']).setValue(d.paidAt);
      sh.getRange(rowNum, COL['Stripe Session ID']).setValue(d.session + (d.paymentIntent ? ' / ' + d.paymentIntent : ''));
    } else if (d.status === 'expired') {
      // Не затираем оплату: брошенная повторная попытка не должна менять «оплачено».
      if (current === STATUS.pending) sh.getRange(rowNum, COL['Статус']).setValue(STATUS.expired);
    } else if (d.status === 'refunded') {
      sh.getRange(rowNum, COL['Статус']).setValue(STATUS.refunded);
    }
    return { ok: true, row: rowNum };
  } finally {
    lock.releaseLock();
  }
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

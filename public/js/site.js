(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };

  // Счётчик до конца early bird: 01.02.2027 23:59:59 по Лондону (GMT = UTC в феврале)
  var END = Date.UTC(2027, 1, 1, 23, 59, 59);
  var pad = function (n) { return String(n).padStart(2, '0'); };
  function tick() {
    var t = Math.max(0, Math.floor((END - Date.now()) / 1000));
    if ($('cd-d')) $('cd-d').textContent = String(Math.floor(t / 86400));
    if ($('cd-h')) $('cd-h').textContent = pad(Math.floor((t % 86400) / 3600));
    if ($('cd-m')) $('cd-m').textContent = pad(Math.floor((t % 3600) / 60));
    if ($('cd-s')) $('cd-s').textContent = pad(t % 60);
  }
  tick(); setInterval(tick, 1000);

  var form = $('reg-form');
  if (!form) return;
  var ticket = $('f-ticket'), role = $('f-role'), speaker = $('f-speaker');
  var HINT = {
    guest: 'Заявки рассматривают организаторы форума. Поля со звёздочкой обязательны.',
    vip: 'VIP гость: билет гостя и ужин. Заявки рассматривают организаторы форума. Поля со звёздочкой обязательны.',
    investor: 'Билет инвестора: доступ в Deal Room, инвесторский лаунж и переговорные. Поля со звёздочкой обязательны.',
    sponsor: 'Спонсорскую презентацию с пакетами отправим на указанную почту. Поля со звёздочкой обязательны.'
  };

  function show(sel, on) {
    form.querySelectorAll('[data-show="' + sel + '"]').forEach(function (el) { el.hidden = !on; });
  }
  function sync() {
    var t = ticket.value, sp = t === 'sponsor';
    $('reg-hint').textContent = HINT[t];
    $('reg-submit').textContent = sp ? 'Стать спонсором' : 'Перейти к оплате';
    $('f-link-label').textContent = sp ? 'Сайт компании *' : 'LinkedIn или сайт *';
    show('not-sponsor', !sp);
    show('role-other', !sp && role.value === 'Другое');
    show('dealroom', t === 'guest' || t === 'vip');
    show('investor', t === 'investor');
    show('speaker', speaker.checked);
  }
  [ticket, role, speaker].forEach(function (el) { el.addEventListener('change', sync); });

  // Кнопки на странице выбирают тип билета и галочки
  document.querySelectorAll('a[data-reg]').forEach(function (a) {
    a.addEventListener('click', function () {
      ticket.value = a.getAttribute('data-reg');
      if (a.getAttribute('data-dealroom')) $('f-dealroom').checked = true;
      if (a.getAttribute('data-speaker')) speaker.checked = true;
      sync();
    });
  });
  var h = (location.hash || '').match(/^#register-(guest|vip|investor|sponsor)$/);
  if (h) { ticket.value = h[1]; location.hash = '#register'; }
  sync();

  var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  function visible(el) { return !el.closest('[hidden]'); }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var err = $('reg-error'), ok = $('reg-ok'), btn = $('reg-submit');
    var bad = [];
    form.querySelectorAll('.is-bad').forEach(function (el) { el.classList.remove('is-bad'); });
    var need = ['f-name', 'f-company', 'f-email', 'f-phone', 'f-link'];
    if (ticket.value !== 'sponsor') { if (role.value === 'Другое') need.push('f-roleother'); }
    if (speaker.checked) need.push('f-topic');
    need.forEach(function (id) {
      var el = $(id), v = el.value.trim();
      if (!v || (id === 'f-email' && !EMAIL.test(v))) bad.push(el);
    });
    if (!$('f-gdpr').checked) bad.push($('f-gdpr'));
    if (bad.length) {
      bad.forEach(function (el) { el.classList.add('is-bad'); });
      err.textContent = 'Заполните обязательные поля, отмеченные красным' + ($('f-gdpr').checked ? '.' : ', и подтвердите согласие с правилами и обработкой данных.');
      err.hidden = false; ok.hidden = true; bad[0].focus();
      return;
    }

    var fd = new FormData(form), data = {};
    fd.forEach(function (v, k) { data[k] = v; });
    ['dealroom', 'pitch', 'speaker', 'gdpr', 'marketing', 'sponsorShare'].forEach(function (k) {
      var el = form.querySelector('[name="' + k + '"]');
      data[k] = !!(el && el.checked && visible(el));
    });
    if (ticket.value === 'sponsor') { data.role = ''; data.roleOther = ''; }

    err.hidden = true; btn.disabled = true;
    var label = btn.textContent; btn.textContent = 'Отправляем…';
    fetch('/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      .then(function (r) { return r.json().catch(function () { return { ok: false }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error(res.error || 'Не удалось отправить форму. Попробуйте ещё раз или напишите на info@indome.co.uk');
        if (res.redirect) { btn.textContent = 'Переходим к оплате…'; location.href = res.redirect; return; }
        ok.textContent = 'Спасибо! Заявка спонсора принята (№ ' + res.id + '). Презентацию с пакетами отправим на указанную почту.';
        ok.hidden = false; btn.disabled = false; form.reset(); sync();
      })
      .catch(function (e2) {
        err.textContent = e2.message; err.hidden = false; btn.disabled = false; btn.textContent = label;
      });
  });
})();

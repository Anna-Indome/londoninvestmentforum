// POST /api/register — приём формы регистрации.
// Проверяет поля, записывает регистрацию в Google-таблицу через Apps Script
// и возвращает ссылку на оплату Stripe (для спонсора — без оплаты).
//
// Переменные окружения Cloudflare Pages:
//   APPS_SCRIPT_URL, APPS_SCRIPT_SECRET
//   STRIPE_LINK_GUEST, STRIPE_LINK_VIP, STRIPE_LINK_INVESTOR

const TICKETS = ['guest', 'vip', 'investor', 'sponsor'];
const LINK_ENV = { guest: 'STRIPE_LINK_GUEST', vip: 'STRIPE_LINK_VIP', investor: 'STRIPE_LINK_INVESTOR' };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });

const clean = (v, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function newId() {
  const d = new Date().toISOString().slice(2, 10).replace(/-/g, ''); // ГГММДД
  const r = crypto.getRandomValues(new Uint8Array(3));
  const hex = Array.from(r, (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  return `LIF-${d}-${hex}`;
}

export async function onRequestPost({ request, env }) {
  let b;
  try {
    b = await request.json();
  } catch {
    return json({ ok: false, error: 'Неверный формат запроса' }, 400);
  }

  // Ловушка для ботов: скрытое поле должно быть пустым.
  if (b.website) return json({ ok: true, id: 'LIF-0', redirect: null });

  const d = {
    ticket: clean(b.ticket, 20),
    name: clean(b.name, 200),
    company: clean(b.company, 200),
    email: clean(b.email, 200),
    phone: clean(b.phone, 100),
    link: clean(b.link, 300),
    role: clean(b.role, 100),
    roleOther: clean(b.roleOther, 200),
    comment: clean(b.comment, 2000),
    topic: clean(b.topic, 300),
    dealroom: !!b.dealroom,
    pitch: !!b.pitch,
    speaker: !!b.speaker,
    gdpr: !!b.gdpr,
    marketing: !!b.marketing,
    sponsorShare: !!b.sponsorShare,
  };

  const missing = [];
  if (!TICKETS.includes(d.ticket)) missing.push('ticket');
  for (const k of ['name', 'company', 'phone', 'link']) if (!d[k]) missing.push(k);
  if (!EMAIL_RE.test(d.email)) missing.push('email');
  if (d.ticket !== 'sponsor') {
    if (!d.role) missing.push('role');
    if (d.role === 'Другое' && !d.roleOther) missing.push('roleOther');
  }
  if (d.speaker && !d.topic) missing.push('topic');
  if (!d.gdpr) missing.push('gdpr');
  if (missing.length) return json({ ok: false, error: 'Заполните обязательные поля', fields: missing }, 422);

  // Поля, которые для типа билета не показываются, не сохраняем.
  if (d.ticket === 'sponsor') { d.role = ''; d.roleOther = ''; d.dealroom = false; d.pitch = false; }
  if (d.ticket === 'investor') d.dealroom = false;
  if (d.ticket !== 'investor') d.pitch = false;
  if (d.role !== 'Другое') d.roleOther = '';
  if (!d.speaker) d.topic = '';

  let paymentLink = null;
  if (d.ticket !== 'sponsor') {
    paymentLink = env[LINK_ENV[d.ticket]];
    if (!paymentLink) return json({ ok: false, error: 'Оплата временно недоступна. Напишите на info@indome.co.uk' }, 503);
  }
  if (!env.APPS_SCRIPT_URL || !env.APPS_SCRIPT_SECRET) {
    return json({ ok: false, error: 'Регистрация временно недоступна. Напишите на info@indome.co.uk' }, 503);
  }

  d.id = newId();

  let saved;
  try {
    const res = await fetch(env.APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: env.APPS_SCRIPT_SECRET, action: 'register', data: d }),
      redirect: 'follow',
    });
    saved = await res.json();
  } catch (e) {
    console.error('Apps Script error', e);
  }
  if (!saved || !saved.ok) {
    console.error('Apps Script rejected', saved);
    return json({ ok: false, error: 'Не удалось сохранить регистрацию. Попробуйте ещё раз или напишите на info@indome.co.uk' }, 502);
  }

  let redirect = null;
  if (paymentLink) {
    const u = new URL(paymentLink);
    u.searchParams.set('locked_prefilled_email', d.email);
    u.searchParams.set('client_reference_id', d.id);
    u.searchParams.set('locale', 'ru');
    redirect = u.toString();
  }
  return json({ ok: true, id: d.id, redirect });
}


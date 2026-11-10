// POST /api/stripe-webhook — уведомления Stripe о платежах.
// Проверяет подпись Stripe и обновляет статус строки в Google-таблице.
//
// События (Stripe → Workbench → Webhooks):
//   checkout.session.completed     → «оплачено» (+ сумма, дата, номер платежа)
//   checkout.session.expired       → «не оплачено» (только если ещё «ожидает оплаты»)
//   charge.refunded                → «возврат»
//
// Переменные окружения: STRIPE_WEBHOOK_SECRET, APPS_SCRIPT_URL, APPS_SCRIPT_SECRET

const TOLERANCE_SEC = 300;

async function hmacHex(secret, payload) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('');
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

async function verify(raw, header, secret) {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(',').map((p) => p.split('=')).filter((p) => p.length === 2 && p[0] === 't')
  );
  const signatures = header.split(',').filter((p) => p.startsWith('v1=')).map((p) => p.slice(3));
  const t = Number(parts.t);
  if (!t || !signatures.length) return false;
  if (Math.abs(Date.now() / 1000 - t) > TOLERANCE_SEC) return false;
  const expected = await hmacHex(secret, `${t}.${raw}`);
  return signatures.some((s) => safeEqual(s, expected));
}

const utc = (unix) => new Date(unix * 1000).toISOString().replace('T', ' ').slice(0, 19);

export async function onRequestPost({ request, env }) {
  const raw = await request.text();
  if (!env.STRIPE_WEBHOOK_SECRET || !(await verify(raw, request.headers.get('Stripe-Signature'), env.STRIPE_WEBHOOK_SECRET))) {
    return new Response('Invalid signature', { status: 400 });
  }

  const event = JSON.parse(raw);
  const o = event.data && event.data.object;
  let data = null;

  if (event.type === 'checkout.session.completed' && o.payment_status === 'paid') {
    data = {
      id: o.client_reference_id || '',
      status: 'paid',
      amount: (o.amount_total || 0) / 100,
      paidAt: utc(event.created),
      session: o.id,
      paymentIntent: o.payment_intent || '',
    };
  } else if (event.type === 'checkout.session.expired') {
    if (o.client_reference_id) data = { id: o.client_reference_id, status: 'expired' };
  } else if (event.type === 'charge.refunded') {
    if (o.payment_intent) data = { id: '', status: 'refunded', paymentIntent: o.payment_intent };
  }

  if (!data) return new Response('ignored', { status: 200 });

  try {
    const res = await fetch(env.APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: env.APPS_SCRIPT_SECRET, action: 'payment', data }),
      redirect: 'follow',
    });
    const out = await res.json();
    if (!out.ok) {
      console.error('Apps Script update failed', event.type, out);
      // Регистрация не найдена — отвечаем 200, чтобы Stripe не повторял бесконечно; смотрите логи.
      if (out.error === 'registration not found') return new Response('not found', { status: 200 });
      return new Response('update failed', { status: 500 });
    }
  } catch (e) {
    console.error('Apps Script error', e);
    return new Response('upstream error', { status: 500 }); // Stripe повторит отправку
  }
  return new Response('ok', { status: 200 });
}

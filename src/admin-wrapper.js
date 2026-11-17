import worker from './worker.js';

const encoder = new TextEncoder();
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers }
});
const cleanEmail = value => typeof value === 'string' ? value.trim().toLowerCase().slice(0, 254) : '';
const validEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const digest = async value => {
  const bytes = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
};
const random = (size = 32) => [...crypto.getRandomValues(new Uint8Array(size))].map(byte => byte.toString(16).padStart(2, '0')).join('');
const cookieToken = request => request.headers.get('Cookie')?.split(';').map(part => part.trim()).find(part => part.startsWith('veneto_session='))?.slice(15) || '';
async function passwordHash(password, salt = random(16)) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: encoder.encode(salt), iterations: 150000, hash: 'SHA-256' }, key, 256);
  const bytes = new Uint8Array(bits);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `pbkdf2$150000$${salt}$${btoa(binary)}`;
}
async function passwordVerify(password, stored) {
  try {
    const [algorithm, iterations, salt] = stored.split('$');
    if (algorithm !== 'pbkdf2' || iterations !== '150000' || !salt) return false;
    return await passwordHash(password, salt) === stored;
  } catch { return false; }
}
async function otpDigest(email, code, secret) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(`${email}:${code}`));
  return [...new Uint8Array(signature)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
function sameOrigin(request) {
  const origin = request.headers.get('Origin');
  return !origin || origin === new URL(request.url).origin;
}
async function ownerExists(env) {
  const result = await env.DB.prepare('SELECT COUNT(*) AS count FROM admins').first();
  return Number(result?.count || 0) > 0;
}
async function updateOwnerCredentials(request, env) {
  if (!sameOrigin(request)) return json({ error: 'طلب غير صالح.' }, 403);
  const token = cookieToken(request);
  if (!token) return json({ error: 'سجّل الدخول مجددًا.' }, 401);
  const sessionResult = await worker.fetch(new Request(new URL('/api/session', request.url), { headers: request.headers }), env);
  if (!sessionResult.ok) return json({ error: 'انتهت الجلسة؛ سجّل الدخول مجددًا.' }, 401);
  const session = await sessionResult.json();
  if (session.role !== 'owner') return json({ error: 'هذه الإعدادات متاحة للمدير الأساسي فقط.' }, 403);

  const sessionHash = await digest(token);
  const sessionRow = await env.DB.prepare('SELECT s.admin_id,s.csrf_token,a.password_hash FROM sessions s JOIN admins a ON a.id=s.admin_id WHERE s.token_hash=? AND s.expires_at>=?')
    .bind(sessionHash, Date.now()).first();
  if (!sessionRow || request.headers.get('x-csrf-token') !== sessionRow.csrf_token) return json({ error: 'انتهت صلاحية التحقق الأمني؛ حدّث الصفحة ثم أعد المحاولة.' }, 403);

  const body = await request.json().catch(() => ({}));
  const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';
  const nextEmail = body.email === undefined || body.email === '' ? '' : cleanEmail(body.email);
  const nextPassword = typeof body.newPassword === 'string' ? body.newPassword : '';
  if (!currentPassword || !await passwordVerify(currentPassword, sessionRow.password_hash)) return json({ error: 'كلمة المرور الحالية غير صحيحة.' }, 403);
  if (!nextEmail && !nextPassword) return json({ error: 'أدخل بريدًا جديدًا أو كلمة مرور جديدة.' }, 400);
  if (nextEmail && !validEmail(nextEmail)) return json({ error: 'أدخل بريدًا إلكترونيًا صحيحًا.' }, 400);
  if (nextPassword && (nextPassword.length < 12 || nextPassword.length > 200)) return json({ error: 'يجب أن تتكون كلمة المرور الجديدة من 12 خانة على الأقل.' }, 400);

  try {
    if (nextEmail) await env.DB.prepare('UPDATE admins SET email=? WHERE id=?').bind(nextEmail, sessionRow.admin_id).run();
    if (nextPassword) await env.DB.prepare('UPDATE admins SET password_hash=? WHERE id=?').bind(await passwordHash(nextPassword), sessionRow.admin_id).run();
  } catch (error) {
    if (String(error?.message || '').includes('UNIQUE')) return json({ error: 'هذا البريد مستخدم لحساب آخر.' }, 409);
    throw error;
  }
  await env.DB.prepare('DELETE FROM sessions WHERE admin_id=? AND token_hash<>?').bind(sessionRow.admin_id, sessionHash).run();
  await env.DB.prepare('INSERT INTO audit_log(admin_id,action,details_json) VALUES(?,?,?)').bind(sessionRow.admin_id, 'owner_credentials_updated', JSON.stringify({ emailChanged: !!nextEmail, passwordChanged: !!nextPassword })).run();
  return json({ ok: true, email: nextEmail || session.email, message: 'تم تحديث بيانات المدير. أُنهِيَت الجلسات الأخرى لأمان الحساب.' });
}
async function sendOtp(request, env) {
  if (!sameOrigin(request)) return json({ error: 'طلب غير صالح.' }, 403);
  const body = await request.json().catch(() => ({}));
  const email = cleanEmail(body.email);
  if (!validEmail(email)) return json({ error: 'أدخل بريدًا إلكترونيًا صحيحًا.' }, 400);
  if (await ownerExists(env)) return json({ error: 'تم إعداد حساب المدير مسبقًا؛ سجّل الدخول بالبريد وكلمة المرور.' }, 409);
  const ownerEmail = cleanEmail(env.OWNER_EMAIL);
  if (!ownerEmail || email !== ownerEmail) return json({ ok: true, message: 'إذا كان البريد هو بريد المدير الأساسي فسيصلك رمز التحقق.' });
  const missing = ['RESEND_API_KEY', 'RESEND_FROM_EMAIL', 'OTP_SECRET', 'OWNER_SETUP_TOKEN'].filter(name => !env[name]);
  if (missing.length) return json({ error: `إعداد إرسال البريد غير مكتمل. أضف الإعدادات المطلوبة في Cloudflare: ${missing.join(', ')}.` }, 503);

  const key = `owner_email_otp:${await digest(email)}`;
  const previous = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first();
  let previousState = null;
  try { previousState = previous?.value ? JSON.parse(previous.value) : null; } catch {}
  const now = Date.now();
  if (previousState?.sentAt && now - previousState.sentAt < 60_000) return json({ error: 'انتظر دقيقة قبل طلب رمز جديد.' }, 429);
  const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, '0');
  const expiresAt = now + 10 * 60_000;
  const codeHash = await otpDigest(email, code, env.OTP_SECRET);
  const mail = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: env.RESEND_FROM_EMAIL, to: [email], subject: 'رمز إعداد مدير VENETO',
      text: `رمز التحقق الخاص بإعداد حساب مدير VENETO هو: ${code}\n\nينتهي الرمز خلال 10 دقائق ويستخدم مرة واحدة. إذا لم تطلبه فتجاهل هذه الرسالة.`,
      html: `<div dir="rtl" style="font-family:Arial,sans-serif"><h2>إعداد حساب مدير VENETO</h2><p>رمز التحقق:</p><p style="font-size:32px;font-weight:bold;letter-spacing:8px">${code}</p><p>ينتهي الرمز خلال 10 دقائق ويستخدم مرة واحدة. إذا لم تطلبه فتجاهل هذه الرسالة.</p></div>`
    })
  });
  if (!mail.ok) {
    console.error('VENETO email provider returned an error', mail.status, (await mail.text()).slice(0, 500));
    return json({ error: 'تعذر إرسال البريد. تحقق من مفتاح Resend وعنوان الإرسال الموثق ثم راجع سجلات Cloudflare.' }, 502);
  }
  await env.DB.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP')
    .bind(key, JSON.stringify({ codeHash, expiresAt, sentAt: now, attempts: 0 })).run();
  return json({ ok: true, message: 'إذا كان البريد هو بريد المدير الأساسي فسيصلك رمز التحقق.' });
}
async function verifyOtp(request, env) {
  if (!sameOrigin(request)) return json({ error: 'طلب غير صالح.' }, 403);
  const body = await request.json().catch(() => ({}));
  const email = cleanEmail(body.email);
  const code = typeof body.code === 'string' ? body.code.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!validEmail(email) || !/^\d{6}$/.test(code)) return json({ error: 'تحقق من البريد ورمز التحقق المكون من 6 أرقام.' }, 400);
  if (password.length < 12 || password.length > 200) return json({ error: 'يجب أن تتكون كلمة المرور من 12 خانة على الأقل.' }, 400);
  if (email !== cleanEmail(env.OWNER_EMAIL)) return json({ error: 'رمز التحقق غير صالح أو منتهي.' }, 400);
  if (await ownerExists(env)) return json({ error: 'تم إعداد حساب المدير مسبقًا؛ استخدم تسجيل الدخول.' }, 409);
  const key = `owner_email_otp:${await digest(email)}`;
  const row = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first();
  let state = null;
  try { state = row?.value ? JSON.parse(row.value) : null; } catch {}
  if (!state || state.expiresAt < Date.now()) {
    await env.DB.prepare('DELETE FROM settings WHERE key = ?').bind(key).run();
    return json({ error: 'رمز التحقق غير صالح أو منتهي. اطلب رمزًا جديدًا.' }, 400);
  }
  if (state.attempts >= 5) {
    await env.DB.prepare('DELETE FROM settings WHERE key = ?').bind(key).run();
    return json({ error: 'تجاوزت عدد المحاولات. اطلب رمزًا جديدًا.' }, 429);
  }
  const supplied = await otpDigest(email, code, env.OTP_SECRET || 'missing-secret');
  if (supplied !== state.codeHash) {
    state.attempts += 1;
    await env.DB.prepare('UPDATE settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?').bind(JSON.stringify(state), key).run();
    return json({ error: 'رمز التحقق غير صحيح.' }, 400);
  }
  const headers = new Headers(request.headers);
  headers.set('content-type', 'application/json');
  const claimUrl = new URL('/api/setup/claim', request.url);
  const response = await worker.fetch(new Request(claimUrl, { method: 'POST', headers, body: JSON.stringify({ email, setupToken: env.OWNER_SETUP_TOKEN, password }) }), env);
  if (response.ok) await env.DB.prepare('DELETE FROM settings WHERE key = ?').bind(key).run();
  return response;
}
async function handleAuth(request, env) {
  const path = new URL(request.url).pathname;
  try {
    if (path === '/api/email-auth/status' && request.method === 'GET') return json({ setupRequired: !(await ownerExists(env)) });
    if (path === '/api/email-auth/send' && request.method === 'POST') return await sendOtp(request, env);
    if (path === '/api/email-auth/verify' && request.method === 'POST') return await verifyOtp(request, env);
    if (path === '/api/admin/owner-credentials' && request.method === 'POST') return await updateOwnerCredentials(request, env);
    return null;
  } catch (error) {
    console.error('VENETO email authentication / owner settings error', error);
    return json({ error: 'حدث خطأ في الخادم أثناء التحقق أو تحديث الإعدادات. راجع سجلات Worker في Cloudflare.' }, 500);
  }
}
async function addAdminScripts(response) {
  if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) return response;
  const html = await response.text();
  const updated = html.replace('</body>', '<script type="module" src="/email-auth.js"></script><script type="module" src="/owner-settings.js"></script></body>');
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  return new Response(updated, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request, env, ctx) {
    const path = new URL(request.url).pathname;
    const authResponse = await handleAuth(request, env);
    if (authResponse) return authResponse;
    if (request.method === 'GET' && (path === '/admin' || path === '/admin/')) {
      const target = new URL('/admin.html', request.url);
      return addAdminScripts(await worker.fetch(new Request(target, { method: 'GET', headers: request.headers }), env, ctx));
    }
    if (request.method === 'GET' && path === '/admin.html') return addAdminScripts(await worker.fetch(request, env, ctx));
    return worker.fetch(request, env, ctx);
  }
};

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
  let binary = '';
  for (const byte of new Uint8Array(bits)) binary += String.fromCharCode(byte);
  return `pbkdf2$150000$${salt}$${btoa(binary)}`;
}
async function passwordVerify(password, stored) {
  try {
    const [algorithm, iterations, salt] = stored.split('$');
    if (algorithm !== 'pbkdf2' || iterations !== '150000' || !salt) return false;
    return await passwordHash(password, salt) === stored;
  } catch { return false; }
}
function sameOrigin(request) {
  const origin = request.headers.get('Origin');
  return !origin || origin === new URL(request.url).origin;
}
async function ownerExists(env) {
  const result = await env.DB.prepare('SELECT COUNT(*) AS count FROM admins').first();
  return Number(result?.count || 0) > 0;
}
async function setupStatus(env) {
  const setupRequired = !(await ownerExists(env));
  const consumed = await env.DB.prepare("SELECT value FROM settings WHERE key='owner_setup_token_used'").first();
  return { setupRequired, registrationAllowed: setupRequired && !consumed };
}
async function claimFirstOwner(request, env) {
  if (!sameOrigin(request)) return json({ error: 'طلب غير صالح.' }, 403);
  if (!env.OWNER_SETUP_TOKEN || env.OWNER_SETUP_TOKEN.length < 24) return json({ error: 'رمز إعداد المدير السري غير مضبوط في إعدادات Worker.' }, 503);
  const body = await request.json().catch(() => ({}));
  const email = cleanEmail(body.email);
  const password = typeof body.password === 'string' ? body.password : '';
  const confirmation = typeof body.confirmPassword === 'string' ? body.confirmPassword : '';
  const suppliedToken = typeof body.setupToken === 'string' ? body.setupToken : '';
  if (!validEmail(email)) return json({ error: 'أدخل بريدًا إلكترونيًا صحيحًا.' }, 400);
  if (password.length < 12 || password.length > 200) return json({ error: 'كلمة المرور يجب ألا تقل عن 12 خانة.' }, 400);
  if (password !== confirmation) return json({ error: 'تأكيد كلمة المرور غير مطابق.' }, 400);
  if (!suppliedToken || (await digest(suppliedToken)) !== (await digest(env.OWNER_SETUP_TOKEN))) return json({ error: 'رمز الإعداد غير صحيح.' }, 403);
  if (await ownerExists(env)) return json({ error: 'تم إنشاء حساب المدير بالفعل؛ لا يمكن التسجيل مرة أخرى.' }, 409);

  const guestToken = cookieToken(request);
  if (!guestToken) return json({ error: 'تعذر التحقق من الجلسة. حدّث الصفحة وحاول مجددًا.' }, 403);
  const guestHash = await digest(guestToken);
  const guest = await env.DB.prepare('SELECT csrf_token,admin_id,expires_at FROM sessions WHERE token_hash=?').bind(guestHash).first();
  if (!guest || guest.admin_id !== null || guest.expires_at < Date.now() || request.headers.get('x-csrf-token') !== guest.csrf_token) {
    return json({ error: 'انتهت صلاحية التحقق الأمني. حدّث الصفحة وحاول مجددًا.' }, 403);
  }

  const lockKey = 'owner_setup_token_used';
  let lock;
  try {
    lock = await env.DB.prepare('INSERT OR IGNORE INTO settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)')
      .bind(lockKey, 'in_progress').run();
  } catch (error) {
    console.error('VENETO owner setup lock error', error);
    return json({ error: 'تعذر تأمين التسجيل الأولي في قاعدة البيانات.' }, 500);
  }
  if (!lock?.meta?.changes) return json({ error: 'رمز الإعداد استُخدم أو يجري استخدامه بالفعل.' }, 409);

  try {
    if (await ownerExists(env)) return json({ error: 'تم إنشاء حساب المدير بالفعل؛ لا يمكن التسجيل مرة أخرى.' }, 409);
    const headers = new Headers(request.headers);
    headers.set('content-type', 'application/json');
    const claimUrl = new URL('/api/setup/claim', request.url);
    const response = await worker.fetch(new Request(claimUrl, {
      method: 'POST', headers,
      body: JSON.stringify({ email, password, setupToken: env.OWNER_SETUP_TOKEN })
    }), env);
    if (response.ok) {
      await env.DB.prepare('UPDATE settings SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=?').bind(await digest(env.OWNER_SETUP_TOKEN), lockKey).run();
      return response;
    }
    await env.DB.prepare('DELETE FROM settings WHERE key=? AND value=?').bind(lockKey, 'in_progress').run();
    return response;
  } catch (error) {
    await env.DB.prepare('DELETE FROM settings WHERE key=? AND value=?').bind(lockKey, 'in_progress').run();
    throw error;
  }
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
async function handleAuth(request, env) {
  const path = new URL(request.url).pathname;
  try {
    if (path === '/api/email-auth/status' && request.method === 'GET') return json(await setupStatus(env));
    if (path === '/api/setup/first-owner' && request.method === 'POST') return await claimFirstOwner(request, env);
    if (path === '/api/admin/owner-credentials' && request.method === 'POST') return await updateOwnerCredentials(request, env);
    return null;
  } catch (error) {
    console.error('VENETO authentication / owner settings error', error);
    return json({ error: 'حدث خطأ في الخادم أثناء المصادقة. راجع سجلات Worker في Cloudflare.' }, 500);
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

const $ = selector => document.querySelector(selector);
const auth = $('#auth');
if (auth) {
  const legacyForms = ['#setup', '#login', '#invite'];
  legacyForms.forEach(selector => { const form = $(selector); if (form) form.hidden = true; });
  const panel = document.createElement('div');
  panel.id = 'email-auth-panel';
  panel.innerHTML = `
    <style>
      #email-auth-panel{margin-top:1.5rem}#email-auth-panel form{display:grid;gap:.8rem;margin:1rem 0}
      #email-auth-panel label{display:grid;gap:.35rem}#email-auth-panel input{width:100%;padding:.85rem;border:1px solid #eadfce;border-radius:12px;font:inherit}
      #email-auth-panel button{padding:.85rem 1rem;border:0;border-radius:12px;background:#503628;color:#fff;font:inherit;cursor:pointer}
      #email-auth-panel .hint{color:#806e60}#email-auth-panel .error{color:#a8322a;min-height:1.4em}
    </style>
    <div id="email-auth-content"><p class="hint">جارٍ التحقق من إعداد الحساب…</p></div>`;
  auth.append(panel);
  const content = $('#email-auth-content');
  const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  async function api(path, body) {
    const response = await fetch(path, {
      method: body === undefined ? 'GET' : 'POST',
      credentials: 'same-origin',
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `تعذر إكمال الطلب (${response.status}).`);
    return result;
  }
  function errorBox(message = '') { return `<p class="error" role="alert">${escapeHtml(message)}</p>`; }
  function showSetup(message = '') {
    content.innerHTML = `<h2>إعداد حساب المدير الأساسي</h2><p class="hint">أدخل بريد المدير المسجل في Cloudflare. سنرسل رمزًا لمرة واحدة صالحًا لمدة 10 دقائق، ثم تختار كلمة مرورك.</p>${errorBox(message)}
      <form id="request-owner-code"><label>البريد الإلكتروني<input type="email" name="email" autocomplete="email" required></label><button>إرسال رمز التحقق</button></form>
      <form id="verify-owner-code" hidden><label>رمز التحقق (6 أرقام)<input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required></label><label>كلمة المرور الجديدة (12 خانة على الأقل)<input type="password" name="password" autocomplete="new-password" minlength="12" required></label><button>تأكيد الرمز وإنشاء الحساب</button></form>`;
    const requestForm = $('#request-owner-code');
    const verifyForm = $('#verify-owner-code');
    requestForm.addEventListener('submit', async event => {
      event.preventDefault();
      const email = new FormData(requestForm).get('email');
      const button = requestForm.querySelector('button'); button.disabled = true;
      try {
        await api('/api/email-auth/send', { email });
        requestForm.hidden = true;
        verifyForm.hidden = false;
        verifyForm.dataset.email = email;
        content.querySelector('.error').textContent = 'إذا كان هذا بريد المدير الأساسي، فسيصلك الرمز. تحقق من البريد غير الهام أيضًا.';
      } catch (error) {
        const box = content.querySelector('.error'); box.textContent = error.message;
      } finally { button.disabled = false; }
    });
    verifyForm.addEventListener('submit', async event => {
      event.preventDefault();
      const data = new FormData(verifyForm);
      const button = verifyForm.querySelector('button'); button.disabled = true;
      try {
        await api('/api/csrf');
        const response = await fetch('/api/email-auth/verify', {
          method: 'POST', credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: verifyForm.dataset.email, code: data.get('code'), password: data.get('password') })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || `تعذر إنشاء الحساب (${response.status}).`);
        location.reload();
      } catch (error) {
        content.querySelector('.error').textContent = error.message;
      } finally { button.disabled = false; }
    });
  }
  function showLogin(message = '') {
    content.innerHTML = `<h2>تسجيل دخول المدير</h2><p class="hint">أدخل البريد وكلمة المرور التي أنشأتها بعد التحقق من البريد.</p>${errorBox(message)}
      <form id="owner-login"><label>البريد الإلكتروني<input type="email" name="email" autocomplete="username" required></label><label>كلمة المرور<input type="password" name="password" autocomplete="current-password" required></label><button>تسجيل الدخول</button></form>`;
    const form = $('#owner-login');
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const data = new FormData(form); const button = form.querySelector('button'); button.disabled = true;
      try {
        await api('/api/csrf');
        const response = await fetch('/api/login', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: data.get('email'), password: data.get('password') }) });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || `تعذر تسجيل الدخول (${response.status}).`);
        location.reload();
      } catch (error) { content.querySelector('.error').textContent = error.message; }
      finally { button.disabled = false; }
    });
  }
  try {
    const state = await api('/api/email-auth/status');
    if (state.setupRequired) showSetup(); else showLogin();
  } catch (error) {
    content.innerHTML = `${errorBox(error.message)}<p class="hint">إذا استمر الخطأ، تحقق من ربط قاعدة D1 باسم DB في Production وسجلات Worker في Cloudflare.</p><button id="retry-email-auth">إعادة المحاولة</button>`;
    $('#retry-email-auth').addEventListener('click', () => location.reload());
  }
}

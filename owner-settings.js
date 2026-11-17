const $ = selector => document.querySelector(selector);
const ownerPanel = $('#owner');
if (ownerPanel) {
  const section = document.createElement('section');
  section.className = 'box';
  section.innerHTML = `
    <h2>تغيير بيانات المدير الأساسي</h2>
    <p class="muted">يمكنك تغيير البريد أو كلمة المرور. اكتب كلمة المرور الحالية للتأكيد، واترك الحقل الذي لا تريد تغييره فارغًا.</p>
    <form id="owner-credentials-form" class="form" autocomplete="off">
      <label>البريد الإلكتروني الجديد (اختياري)<input type="email" name="email" autocomplete="email"></label>
      <label>كلمة المرور الحالية<input type="password" name="currentPassword" autocomplete="current-password" required></label>
      <label>كلمة المرور الجديدة (اختياري، 12 خانة على الأقل)<input type="password" name="newPassword" minlength="12" autocomplete="new-password"></label>
      <button type="submit">حفظ بيانات المدير</button>
    </form>
    <p id="owner-credentials-message" role="status" aria-live="polite"></p>`;
  ownerPanel.append(section);

  const form = $('#owner-credentials-form');
  const message = $('#owner-credentials-message');
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    const data = new FormData(form);
    const email = String(data.get('email') || '').trim();
    const newPassword = String(data.get('newPassword') || '');
    if (!email && !newPassword) {
      message.textContent = 'أدخل بريدًا جديدًا أو كلمة مرور جديدة.';
      return;
    }
    button.disabled = true;
    message.textContent = 'جارٍ حفظ التغييرات…';
    try {
      const csrfResponse = await fetch('/api/csrf', { credentials: 'same-origin', cache: 'no-store' });
      const csrfData = await csrfResponse.json();
      if (!csrfResponse.ok || !csrfData.csrfToken) throw new Error('انتهت الجلسة. حدّث الصفحة وسجّل الدخول مجددًا.');
      const response = await fetch('/api/admin/owner-credentials', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', 'x-csrf-token': csrfData.csrfToken },
        body: JSON.stringify({
          email,
          currentPassword: data.get('currentPassword'),
          newPassword
        })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'تعذر حفظ بيانات المدير.');
      message.textContent = result.message || 'تم تحديث بيانات المدير بنجاح.';
      form.reset();
      const who = $('#who');
      if (who && result.email) who.textContent = result.email;
    } catch (error) {
      message.textContent = error.message || 'حدث خطأ أثناء حفظ الإعدادات.';
    } finally {
      button.disabled = false;
    }
  });
}

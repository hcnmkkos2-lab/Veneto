// Connect the existing menu/cart UI to the Worker order API without changing its layout.
(() => {
  const form = document.querySelector('#checkout-form');
  if (!form) return;
  let csrf = '';
  const getToken = async () => {
    if (!csrf) {
      const r = await fetch('/api/csrf', { credentials: 'same-origin' });
      const d = await r.json();
      if (!r.ok || !d.csrfToken) throw new Error('تعذر الاتصال بالخادم. أعد تحميل الصفحة.');
      csrf = d.csrfToken;
    }
    return csrf;
  };
  document.addEventListener('submit', async event => {
    if (event.target !== form) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const button = form.querySelector('[type="submit"]');
    if (button) button.disabled = true;
    try {
      const cartState = Object.fromEntries(cart);
      const items = Object.entries(cartState).filter(([, quantity]) => Number(quantity) > 0).map(([id, quantity]) => ({ id, quantity: Number(quantity) }));
      const data = new FormData(form);
      const response = await fetch('/api/orders', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': await getToken() },
        body: JSON.stringify({ customerName: data.get('customerName'), phone: data.get('phone'), areaId: document.querySelector('#area')?.value, items })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'تعذر إرسال الطلب. حاول مرة أخرى.');
      for (const id of Object.keys(cart)) delete cart[id];
      renderCart();
      form.reset();
      document.querySelector('#cart-dialog')?.close();
      alert(`تم استلام طلبك بنجاح. رقم الطلب: ${result.orderId.slice(0, 8)}`);
    } catch (error) {
      alert(error.message || 'تعذر إرسال الطلب. تحقق من اتصال الإنترنت.');
    } finally { if (button) button.disabled = false; }
  }, true);
})();

(() => {
  const ENDPOINT = 'https://txqsqudkhyehxkwmmart.supabase.co/functions/v1/aruna-review-native-submit';

  function init(root) {
    const toggle = root.querySelector('[data-aruna-question-toggle]');
    const form = root.querySelector('[data-aruna-question-form]');
    const status = root.querySelector('[data-aruna-question-status]');
    if (!toggle || !form || form.dataset.ready === 'true') return;
    form.dataset.ready = 'true';

    toggle.addEventListener('click', () => {
      const open = form.hidden;
      form.hidden = !open;
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) form.querySelector('input,textarea')?.focus();
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const submit = form.querySelector('[type="submit"]');
      const data = new FormData(form);
      const payload = {
        shop_domain: form.dataset.shopDomain,
        kind: 'question',
        product_id: form.dataset.productId,
        product_handle: form.dataset.productHandle,
        product_title: form.dataset.productTitle,
        customer_name: data.get('customer_name'),
        customer_email: data.get('customer_email'),
        question: data.get('question'),
      };
      if (!payload.customer_name || String(payload.question || '').trim().length < 3) {
        status.textContent = 'Preencha seu nome e sua pergunta.';
        return;
      }
      submit.disabled = true;
      status.textContent = 'Enviando sua pergunta…';
      try {
        const response = await fetch(ENDPOINT, {
          method:'POST',
          headers:{'content-type':'application/json'},
          body:JSON.stringify(payload),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok && result.error !== 'setup_required') throw new Error(result.error || 'submit_failed');
        if (result.error === 'setup_required') {
          status.textContent = 'O envio de perguntas está temporariamente indisponível. Tente novamente mais tarde.';
          return;
        }
        form.reset();
        status.textContent = result.duplicate ? 'Essa pergunta já foi recebida.' : 'Pergunta enviada. A loja poderá responder em breve.';
      } catch {
        status.textContent = 'Não foi possível enviar agora. Tente novamente em instantes.';
      } finally {
        submit.disabled = false;
      }
    });
  }

  function scan() { document.querySelectorAll('[data-aruna-qa-root]').forEach(init); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan, {once:true});
  else scan();
  document.addEventListener('shopify:section:load', scan);
})();

(() => {
  const ENDPOINT = 'https://txqsqudkhyehxkwmmart.supabase.co/functions/v1/aruna-review-native-submit';

  function init(root) {
    const toggle = root.querySelector('[data-aruna-review-toggle]');
    const form = root.querySelector('[data-aruna-review-form]');
    const status = root.querySelector('[data-aruna-review-status]');
    if (!toggle || !form || form.dataset.ready === 'true') return;
    form.dataset.ready = 'true';

    toggle.addEventListener('click', () => {
      const open = form.hidden;
      form.hidden = !open;
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) form.querySelector('input,select,textarea')?.focus();
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const submit = form.querySelector('[type="submit"]');
      const data = new FormData(form);
      const payload = {
        shop_domain: form.dataset.shopDomain,
        kind: 'review',
        product_id: form.dataset.productId,
        product_handle: form.dataset.productHandle,
        product_title: form.dataset.productTitle,
        customer_name: data.get('customer_name'),
        customer_email: data.get('customer_email'),
        rating: Number(data.get('rating')),
        title: data.get('title'),
        body: data.get('body'),
        language: document.documentElement.lang || 'pt-BR',
      };

      if (!payload.customer_name || !payload.rating || !String(payload.body || '').trim()) {
        status.textContent = 'Preencha seu nome, a nota e sua avaliação.';
        return;
      }

      submit.disabled = true;
      status.textContent = 'Enviando sua avaliação…';
      try {
        const response = await fetch(ENDPOINT, {
          method: 'POST',
          headers: {'content-type':'application/json'},
          body: JSON.stringify(payload),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok && result.error !== 'setup_required') throw new Error(result.error || 'submit_failed');
        if (result.error === 'setup_required') {
          status.textContent = 'O envio de avaliações está temporariamente indisponível. Tente novamente mais tarde.';
          return;
        }
        form.reset();
        status.textContent = result.duplicate
          ? 'Essa avaliação já foi recebida.'
          : 'Avaliação enviada. Ela aparecerá após a moderação da loja.';
      } catch (error) {
        status.textContent = 'Não foi possível enviar agora. Tente novamente em instantes.';
      } finally {
        submit.disabled = false;
      }
    });
  }

  function scan() {
    document.querySelectorAll('[data-aruna-reviews-root]').forEach(init);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan, {once:true});
  else scan();
  document.addEventListener('shopify:section:load', scan);
})();

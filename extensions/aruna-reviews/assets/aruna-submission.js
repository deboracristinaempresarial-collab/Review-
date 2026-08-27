(() => {
  const ENDPOINT = 'https://txqsqudkhyehxkwmmart.supabase.co/functions/v1/aruna-review-native-submit';
  const MEDIA_ENDPOINT = 'https://txqsqudkhyehxkwmmart.supabase.co/functions/v1/aruna-review-native-media';

  async function uploadMedia(form, file) {
    const data = new FormData();
    data.set('shop_domain', form.dataset.shopDomain || '');
    data.set('product_handle', form.dataset.productHandle || 'product');
    data.set('file', file);
    const response = await fetch(MEDIA_ENDPOINT, {method:'POST',body:data});
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.url) throw new Error(result.error || 'upload_failed');
    return result.url;
  }

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
      const files = [...(form.querySelector('[name="media"]')?.files || [])].slice(0, 4);
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
        media_urls: [],
      };

      if (!payload.customer_name || !payload.rating || !String(payload.body || '').trim()) {
        status.textContent = 'Preencha seu nome, a nota e sua avaliação.';
        return;
      }
      if (files.some((file) => file.size > 25 * 1024 * 1024)) {
        status.textContent = 'Cada foto ou vídeo deve ter no máximo 25 MB.';
        return;
      }

      submit.disabled = true;
      try {
        if (files.length) {
          status.textContent = `Enviando ${files.length} arquivo(s)…`;
          for (const file of files) payload.media_urls.push(await uploadMedia(form,file));
        }
        status.textContent = 'Enviando sua avaliação…';
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

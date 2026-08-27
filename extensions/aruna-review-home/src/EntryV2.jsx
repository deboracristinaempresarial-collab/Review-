/** @jsxImportSource preact */
import mountAppHome from './AppHome.jsx';

const ADMIN_URL = 'https://txqsqudkhyehxkwmmart.supabase.co/functions/v1/aruna-review-native-admin';
const REVIEW_TYPE = '$app:review';
const QUESTION_TYPE = '$app:question';
const STORAGE_KEY = 'arunaReviewNativeSyncKeyV1';

const CREATE_METAOBJECT = `mutation ArunaInboxCreate($metaobject: MetaobjectCreateInput!) {
  metaobjectCreate(metaobject: $metaobject) {
    metaobject { id }
    userErrors { field message code }
  }
}`;

const LIST_EXISTING_REVIEWS = `query ArunaExistingReviews {
  metaobjects(type: "$app:review", first: 250, sortKey: "updated_at", reverse: true) {
    nodes { id fields { key value } }
  }
}`;

const THEMES = [
  ['compat-01','Clássico','Lista limpa, estrelas e comentário'],
  ['compat-02','Moderno','Cards leves e bastante espaço'],
  ['compat-03','Marketplace','Resumo de notas + avaliações densas'],
  ['compat-04','Galeria','Destaque para fotos e vídeos'],
  ['compat-05','Cards','Avaliações em cartões separados'],
  ['compat-06','Minimal','Visual discreto e compacto'],
  ['compat-07','Centralizado','Nota média e título centralizados'],
  ['compat-08','Social','Fotos, nome e prova social em destaque'],
  ['compat-09','Lista','Leitura rápida para muitas avaliações'],
  ['compat-10','Amplo','Conteúdo espaçado em largura total'],
  ['compat-11','Escuro','Blocos com contraste forte'],
  ['aruna-premium','ARUNA Premium','Visual premium para a maioria das lojas'],
  ['aruna-compact','ARUNA Compacto','Ocupa menos espaço no produto'],
  ['aruna-media','ARUNA Fotos & Vídeos','Mídia dos clientes em primeiro plano'],
  ['aruna-lux','ARUNA Lux','Resumo sofisticado e avaliações elegantes'],
];

function field(key, value) {
  if (value === undefined || value === null) return null;
  return {key, value: String(value)};
}

function randomKey() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function getSyncKey() {
  let key = await shopify.storage.get(STORAGE_KEY);
  if (!key || typeof key !== 'string' || key.length < 32) {
    key = randomKey();
    await shopify.storage.set(STORAGE_KEY, key);
  }
  return key;
}

async function getShopContext() {
  const result = await shopify.query(`query ArunaShopContext {
    shop { myshopifyDomain }
    products(first: 100, sortKey: UPDATED_AT, reverse: true) { nodes { id title handle } }
  }`);
  return {
    shopDomain: result?.data?.shop?.myshopifyDomain || '',
    products: result?.data?.products?.nodes || [],
  };
}

async function adminCall(syncKey, body) {
  const response = await fetch(ADMIN_URL, {
    method: 'POST',
    headers: {'content-type':'application/json','x-aruna-sync-key':syncKey},
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || `Aruna inbox ${response.status}`);
  return data;
}

function reviewFields(payload) {
  return [
    field('product_id', payload.product_id || ''), field('product_handle', payload.product_handle || ''), field('product_title', payload.product_title || ''),
    field('customer_name', payload.customer_name || 'Cliente'), field('customer_email', payload.customer_email || ''),
    field('rating', Math.max(1, Math.min(5, Number(payload.rating) || 5))), field('title', payload.title || ''), field('body', payload.body || ''),
    field('status', payload.status || 'pending'), field('verified', payload.verified === true ? 'true' : 'false'),
    field('verification_status', payload.verified === true ? 'verified' : 'unverified'), field('merchant_reply', payload.merchant_reply || ''),
    field('featured', payload.featured === true ? 'true' : 'false'), field('source', payload.source || 'storefront'), field('external_id', payload.external_id || ''),
    field('review_date', payload.review_date || new Date().toISOString()),
    field('media_urls', JSON.stringify(Array.isArray(payload.media_urls) ? payload.media_urls.slice(0, 8) : [])),
    field('helpful_count', Math.max(0, Number(payload.helpful_count) || 0)), field('language', payload.language || 'pt-BR'),
    field('order_id', payload.order_id || ''), field('import_batch', payload.import_batch || ''),
  ].filter(Boolean);
}

function questionFields(payload) {
  return [
    field('product_id', payload.product_id || ''), field('product_handle', payload.product_handle || ''), field('product_title', payload.product_title || ''),
    field('customer_name', payload.customer_name || 'Cliente'), field('customer_email', payload.customer_email || ''), field('question', payload.question || ''),
    field('status', payload.status || 'pending'), field('merchant_answer', payload.merchant_answer || ''),
    field('submitted_at', payload.submitted_at || new Date().toISOString()), field('source', payload.source || 'storefront'),
  ].filter(Boolean);
}

async function createShopifyItem(item) {
  const payload = item?.payload || {};
  const approved = payload.status === 'approved';
  const metaobject = item.kind === 'question'
    ? {type:QUESTION_TYPE,fields:questionFields(payload),capabilities:{publishable:{status:approved ? 'ACTIVE' : 'DRAFT'}}}
    : {type:REVIEW_TYPE,fields:reviewFields(payload),capabilities:{publishable:{status:approved ? 'ACTIVE' : 'DRAFT'}}};
  const result = await shopify.query(CREATE_METAOBJECT, {variables:{metaobject}});
  const errors = result?.errors || result?.data?.metaobjectCreate?.userErrors || [];
  if (errors.length) throw new Error(errors[0]?.message || 'Falha ao salvar item na Shopify.');
}

function normalizeFields(node) {
  const out = {};
  for (const item of node?.fields || []) out[item.key] = item.value;
  return out;
}

function fingerprint(review) {
  return [
    String(review?.product_handle || review?.product_id || '').toLowerCase(),
    String(review?.external_id || '').toLowerCase(),
    String(review?.customer_name || '').toLowerCase(),
    String(Number(review?.rating) || 0),
    String(review?.body || review?.title || '').toLowerCase().replace(/\s+/g,' ').trim().slice(0,800),
  ].join('|');
}

async function existingReviewFingerprints() {
  try {
    const result = await shopify.query(LIST_EXISTING_REVIEWS);
    const nodes = result?.data?.metaobjects?.nodes || [];
    return new Set(nodes.map(normalizeFields).map(fingerprint));
  } catch {
    return new Set();
  }
}

async function syncInbox(syncKey) {
  const inbox = await adminCall(syncKey,{action:'inbox',limit:100});
  const items = Array.isArray(inbox.items) ? inbox.items : [];
  const synced = [];
  for (const item of items) {
    try {
      await createShopifyItem(item);
      synced.push(item.id);
    } catch (error) {
      console.error('Aruna Review inbox item failed', item?.id, error);
    }
  }
  if (synced.length) {
    await adminCall(syncKey,{action:'ack',ids:synced,status:'synced'});
    try { shopify.toast.show(`${synced.length} item(ns) recebidos no Aruna Review`); } catch {}
  }
  return {received:items.length,synced:synced.length};
}

async function setupNativeBridge() {
  const syncKey = await getSyncKey();
  const {shopDomain, products} = await getShopContext();
  const boot = await adminCall(syncKey,{action:'bootstrap',shop_domain:shopDomain});
  await adminCall(syncKey,{action:'catalog_update',products});
  await shopify.storage.set('arunaReviewSubmissionTokenV1', boot.submission_token || '');
  const api = {
    syncNow: () => syncInbox(syncKey),
    refreshCatalog: async () => {
      const context = await getShopContext();
      await adminCall(syncKey,{action:'catalog_update',products:context.products});
      api.products = context.products;
      return context.products;
    },
    createPair: async () => {
      await api.refreshCatalog();
      const pair = await adminCall(syncKey,{action:'create_pair'});
      await shopify.storage.set('arunaReviewPairCodeV1', pair);
      return pair;
    },
    connections: () => adminCall(syncKey,{action:'connections'}),
    revokeConnection: (id) => adminCall(syncKey,{action:'revoke_connection',id}),
    scanStorefront: (product) => adminCall(syncKey,{action:'scan_storefront',product,max_reviews:250}),
    shopDomain,
    products,
  };
  globalThis.arunaReviewNative = api;
  await syncInbox(syncKey);
  setInterval(() => syncInbox(syncKey).catch(() => {}), 30000);
  return api;
}

function el(name, text) {
  const node = document.createElement(name);
  if (text !== undefined) node.textContent = text;
  return node;
}

function stack(direction='block', gap='small') {
  const node = el('s-stack');
  node.setAttribute('direction',direction);
  node.setAttribute('gap',gap);
  return node;
}

function box() {
  const node = el('s-box');
  node.setAttribute('padding','base');
  node.setAttribute('borderWidth','base');
  node.setAttribute('borderRadius','base');
  node.setAttribute('background','subdued');
  return node;
}

function section(heading) {
  const node = el('s-section');
  if (heading) node.setAttribute('heading',heading);
  return node;
}

function stars(n=5) {
  return '★'.repeat(Math.max(1,Math.min(5,Number(n)||5))) + '☆'.repeat(Math.max(0,5-(Number(n)||5)));
}

function findButton(label) {
  return [...document.querySelectorAll('s-button')].find((button) => button.textContent?.trim() === label);
}

function mountHero(page) {
  if (page.querySelector('[data-aruna-v2-hero]')) return;
  const hero = section();
  hero.setAttribute('data-aruna-v2-hero','true');
  const card = box();
  const content = stack('block','base');
  const top = stack('inline','small');
  const title = el('s-heading','Aruna Review');
  const badge = el('s-badge','Shopify conectado');
  badge.setAttribute('tone','success');
  top.append(title,badge);
  content.append(top,el('s-text','Avaliações, importação, temas e migração das avaliações que já estão publicadas na sua loja — tudo no mesmo app.'));
  const actions = stack('inline','small');
  const reviews = el('s-button','Ver avaliações');
  reviews.setAttribute('variant','primary');
  reviews.addEventListener('click',() => findButton('Avaliações')?.click());
  const themes = el('s-button','Gerenciar temas');
  themes.addEventListener('click',() => findButton('Temas')?.click());
  actions.append(reviews,themes);
  content.append(actions);
  card.append(content);
  hero.append(card);
  page.prepend(hero);
}

function themePreviewCard(theme) {
  const [value,label,detail] = theme;
  const card = box();
  card.setAttribute('data-theme-preview',value);
  const content = stack('block','small');
  const head = stack('inline','small');
  const title = el('s-heading',label);
  const badge = el('s-badge',value.startsWith('aruna-') ? 'Aruna' : 'Compatível');
  badge.setAttribute('tone',value.startsWith('aruna-') ? 'info' : 'auto');
  head.append(title,badge);
  content.append(head,el('s-text',detail));

  const sample = el('s-box');
  sample.setAttribute('padding','base');
  sample.setAttribute('borderWidth','base');
  sample.setAttribute('borderRadius','base');
  if (value === 'compat-11') sample.setAttribute('background','strong');
  const sampleStack = stack('block','small');
  if (value === 'compat-03' || value === 'aruna-lux') {
    sampleStack.append(el('s-heading','4,9 / 5'),el('s-text','★★★★★  128 avaliações'));
  } else {
    sampleStack.append(el('s-text','★★★★★'));
  }
  if (value === 'compat-04' || value === 'aruna-media') {
    const media = stack('inline','small');
    for (let i=0;i<3;i++) {
      const thumb = el('s-box');
      thumb.setAttribute('padding','large');
      thumb.setAttribute('background','subdued');
      thumb.setAttribute('borderRadius','base');
      media.append(thumb);
    }
    sampleStack.append(media);
  }
  sampleStack.append(el('s-text','Cliente verificado · ★★★★★'),el('s-text','Produto excelente, chegou certinho e ficou perfeito no carro.'));
  sample.append(sampleStack);
  content.append(sample);
  const action = el('s-button','Abrir configuração deste tema');
  action.addEventListener('click',() => {
    findButton('Temas')?.click();
    try { shopify.toast.show(`Abra ${label} na lista de temas para ativar.`); } catch {}
  });
  content.append(action);
  card.append(content);
  return card;
}

function mountThemeShowcase(page) {
  if (page.querySelector('[data-aruna-theme-showcase]')) return;
  const host = section('Modelos dos temas');
  host.setAttribute('data-aruna-theme-showcase','true');
  const content = stack('block','base');
  content.append(el('s-text','Veja o formato de cada modelo antes de escolher. O tema selecionado continua sendo salvo pela área Temas do Aruna Review.'));
  const grid = el('s-grid');
  grid.setAttribute('gap','base');
  grid.setAttribute('gridTemplateColumns','repeat(3, minmax(0, 1fr))');
  THEMES.forEach((theme) => grid.append(themePreviewCard(theme)));
  content.append(grid);
  host.append(content);
  page.append(host);
}

function mountImporterControls(page, api) {
  if (page.querySelector('[data-aruna-native-bridge]')) return;
  const host = section('Extensão Aruna Review Importer');
  host.setAttribute('data-aruna-native-bridge','true');
  const content = stack('block','base');
  const callout = box();
  const calloutStack = stack('block','small');
  calloutStack.append(el('s-heading','Importe da página aberta direto para o seu app'),el('s-text','A extensão usa um código temporário, recebe seus produtos da Shopify e envia o lote para a caixa do Aruna Review. Não usa login nem servidor do BK.'));
  callout.append(calloutStack);
  content.append(callout);
  const actions = stack('inline','small');
  const pairButton = el('s-button','Gerar código de conexão');
  pairButton.setAttribute('variant','primary');
  const syncButton = el('s-button','Sincronizar caixa agora');
  const catalogButton = el('s-button','Atualizar produtos');
  const status = el('s-text','');
  pairButton.addEventListener('click', async () => {
    pairButton.disabled = true;
    status.textContent = 'Gerando código e atualizando produtos…';
    try {
      const pair = await api.createPair();
      const expiry = pair?.expires_at ? new Date(pair.expires_at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) : '';
      status.textContent = `Código: ${pair.code}${expiry ? ` · válido até ${expiry}` : ''}`;
    } catch {
      status.textContent = 'Não foi possível gerar o código agora.';
    } finally {
      pairButton.disabled = false;
    }
  });
  syncButton.addEventListener('click', async () => {
    syncButton.disabled = true;
    status.textContent = 'Sincronizando…';
    try {
      const result = await api.syncNow();
      status.textContent = result.synced ? `${result.synced} item(ns) sincronizados.` : 'Caixa de entrada já está em dia.';
      if (result.synced) findButton('Atualizar dados')?.click();
    } catch {
      status.textContent = 'Não foi possível sincronizar agora.';
    } finally {
      syncButton.disabled = false;
    }
  });
  catalogButton.addEventListener('click', async () => {
    catalogButton.disabled = true;
    status.textContent = 'Atualizando produtos…';
    try {
      const products = await api.refreshCatalog();
      status.textContent = `${products.length} produto(s) enviados para o importador.`;
    } catch {
      status.textContent = 'Não foi possível atualizar os produtos agora.';
    } finally {
      catalogButton.disabled = false;
    }
  });
  actions.append(pairButton,syncButton,catalogButton);
  content.append(actions,status);
  host.append(content);
  page.append(host);
}

function mountStoreMigration(page, api) {
  if (page.querySelector('[data-aruna-store-migration]')) return;
  const host = section('Migrar avaliações que já estão na loja');
  host.setAttribute('data-aruna-store-migration','true');
  const content = stack('block','base');
  const intro = el('s-banner','O Aruna procura avaliações que já estão públicas no produto e mostra uma prévia. Nada é criado até você confirmar. Duplicadas são ignoradas.');
  content.append(intro);

  const controls = stack('inline','small');
  const select = el('s-select');
  select.setAttribute('label','Produto');
  for (const product of api.products || []) {
    const option = el('s-option',product.title);
    option.setAttribute('value',product.id);
    option.dataset.handle = product.handle;
    option.dataset.title = product.title;
    select.append(option);
  }
  const scanButton = el('s-button','Buscar avaliações já na loja');
  scanButton.setAttribute('variant','primary');
  controls.append(select,scanButton);
  content.append(controls);

  const status = el('s-text','Selecione um produto para começar.');
  const preview = stack('block','small');
  const migrateButton = el('s-button','Migrar selecionadas');
  migrateButton.setAttribute('variant','primary');
  migrateButton.hidden = true;
  content.append(status,preview,migrateButton);

  let found = [];
  let selected = new Set();

  function render() {
    preview.innerHTML = '';
    selected = new Set(found.map((_,index) => index));
    if (!found.length) {
      migrateButton.hidden = true;
      return;
    }
    const actions = stack('inline','small');
    const all = el('s-button','Selecionar todas');
    const none = el('s-button','Limpar seleção');
    all.addEventListener('click',() => { selected = new Set(found.map((_,i)=>i)); renderItems(); });
    none.addEventListener('click',() => { selected = new Set(); renderItems(); });
    actions.append(all,none);
    preview.append(actions);

    const items = stack('block','small');
    preview.append(items);
    function renderItems() {
      items.innerHTML = '';
      found.slice(0,50).forEach((review,index) => {
        const card = box();
        const row = stack('inline','small');
        const check = el('s-checkbox');
        check.checked = selected.has(index);
        check.addEventListener('change',(event) => {
          if (event.currentTarget.checked) selected.add(index); else selected.delete(index);
          migrateButton.textContent = `Migrar ${selected.size} selecionada(s)`;
        });
        const reviewStack = stack('block','small');
        const head = stack('inline','small');
        const name = el('s-heading',review.customer_name || 'Cliente');
        const rating = el('s-badge',stars(review.rating));
        rating.setAttribute('tone','info');
        head.append(name,rating);
        reviewStack.append(head,el('s-text',review.body || review.title || 'Sem comentário'),el('s-text',`${review.source || 'loja'}${review.review_date ? ` · ${new Date(review.review_date).toLocaleDateString('pt-BR')}` : ''}`));
        if (Array.isArray(review.media_urls) && review.media_urls.length) {
          const mediaBadge = el('s-badge',`${review.media_urls.length} mídia(s)`);
          mediaBadge.setAttribute('tone','success');
          reviewStack.append(mediaBadge);
        }
        row.append(check,reviewStack);
        card.append(row);
        items.append(card);
      });
      if (found.length > 50) items.append(el('s-text',`Mostrando 50 de ${found.length}. Todas continuam selecionadas para migração.`));
      migrateButton.textContent = `Migrar ${selected.size} selecionada(s)`;
    }
    renderItems();
    migrateButton.hidden = false;
  }

  scanButton.addEventListener('click', async () => {
    const product = (api.products || []).find((item) => item.id === select.value) || api.products?.[0];
    if (!product) { status.textContent = 'Nenhum produto disponível.'; return; }
    scanButton.disabled = true;
    migrateButton.hidden = true;
    preview.innerHTML = '';
    status.textContent = 'Procurando avaliações públicas deste produto…';
    try {
      const [scan, existing] = await Promise.all([api.scanStorefront(product),existingReviewFingerprints()]);
      const rows = Array.isArray(scan.reviews) ? scan.reviews : [];
      found = rows.filter((row) => !existing.has(fingerprint(row)));
      const duplicates = rows.length - found.length;
      status.textContent = `${rows.length} encontrada(s) · ${found.length} nova(s)${duplicates ? ` · ${duplicates} duplicada(s) ignorada(s)` : ''}.`;
      render();
    } catch (error) {
      found = [];
      status.textContent = error?.message === 'shop_domain_not_ready' ? 'Abra o Aruna Review novamente para atualizar o domínio da loja.' : 'Não foi possível buscar as avaliações deste produto agora.';
    } finally {
      scanButton.disabled = false;
    }
  });

  migrateButton.addEventListener('click', async () => {
    const rows = found.filter((_,index) => selected.has(index));
    if (!rows.length) return;
    migrateButton.disabled = true;
    status.textContent = `Migrando ${rows.length} avaliação(ões)…`;
    let done = 0;
    try {
      for (const row of rows) {
        await createShopifyItem({kind:'review',payload:{...row,status:'approved'}});
        done++;
      }
      status.textContent = `${done} avaliação(ões) migradas para o Aruna Review.`;
      found = found.filter((_,index) => !selected.has(index));
      render();
      try { shopify.toast.show(`${done} avaliações migradas`); } catch {}
      findButton('Atualizar dados')?.click();
    } catch (error) {
      status.textContent = `${done} migrada(s). A operação parou porque uma avaliação não pôde ser salva.`;
    } finally {
      migrateButton.disabled = false;
    }
  });

  host.append(content);
  page.append(host);
}

function mountEnhancements(api) {
  const page = document.querySelector('s-page');
  if (!page) return;
  mountHero(page);
  mountStoreMigration(page,api);
  mountThemeShowcase(page);
  mountImporterControls(page,api);
}

export default async function extension() {
  let api = null;
  try {
    api = await setupNativeBridge();
  } catch (error) {
    console.error('Aruna Review native bridge unavailable', error);
  }
  const mounted = mountAppHome();
  if (api) {
    setTimeout(() => mountEnhancements(api), 0);
    setTimeout(() => mountEnhancements(api), 500);
  }
  return mounted;
}

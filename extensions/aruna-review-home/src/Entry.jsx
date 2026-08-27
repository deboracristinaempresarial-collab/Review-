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
    field('product_id', payload.product_id || ''),field('product_handle', payload.product_handle || ''),field('product_title', payload.product_title || ''),
    field('customer_name', payload.customer_name || 'Cliente'),field('customer_email', payload.customer_email || ''),
    field('rating', Math.max(1, Math.min(5, Number(payload.rating) || 5))),field('title', payload.title || ''),field('body', payload.body || ''),
    field('status', payload.status || 'pending'),field('verified', payload.verified === true ? 'true' : 'false'),
    field('verification_status', payload.verified === true ? 'verified' : 'unverified'),field('merchant_reply', payload.merchant_reply || ''),
    field('featured', payload.featured === true ? 'true' : 'false'),field('source', payload.source || 'storefront'),field('external_id', payload.external_id || ''),
    field('review_date', payload.review_date || new Date().toISOString()),
    field('media_urls', JSON.stringify(Array.isArray(payload.media_urls) ? payload.media_urls.slice(0, 8) : [])),
    field('helpful_count', Math.max(0, Number(payload.helpful_count) || 0)),field('language', payload.language || 'pt-BR'),
    field('order_id', payload.order_id || ''),field('import_batch', payload.import_batch || ''),
  ].filter(Boolean);
}

function questionFields(payload) {
  return [
    field('product_id', payload.product_id || ''),field('product_handle', payload.product_handle || ''),field('product_title', payload.product_title || ''),
    field('customer_name', payload.customer_name || 'Cliente'),field('customer_email', payload.customer_email || ''),field('question', payload.question || ''),
    field('status', payload.status || 'pending'),field('merchant_answer', payload.merchant_answer || ''),
    field('submitted_at', payload.submitted_at || new Date().toISOString()),field('source', payload.source || 'storefront'),
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
    shopDomain,
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

function mountBridgeControls(api) {
  const page = document.querySelector('s-page');
  if (!page || page.querySelector('[data-aruna-native-bridge]')) return;
  const section = el('s-section');
  section.setAttribute('heading','Importador Aruna');
  section.setAttribute('data-aruna-native-bridge','true');
  const stack = el('s-stack');
  stack.setAttribute('direction','block');
  stack.setAttribute('gap','small');
  const intro = el('s-text','Conecte a extensão Aruna Review Importer sem usuário e senha. O código vale por 10 minutos e leva os produtos da Shopify para o seletor da extensão.');
  const actions = el('s-stack');
  actions.setAttribute('direction','inline');
  actions.setAttribute('gap','small');
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
  stack.append(intro,actions,status);
  section.appendChild(stack);
  page.appendChild(section);
}

export default async function extension() {
  let api = null;
  try {
    api = await setupNativeBridge();
  } catch (error) {
    console.error('Aruna Review native bridge unavailable', error);
  }
  const mounted = mountAppHome();
  if (api) queueMicrotask(() => mountBridgeControls(api));
  return mounted;
}

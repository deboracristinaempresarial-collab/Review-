/** @jsxImportSource preact */
import mountAppHome from './AppHome.jsx';

const ADMIN_URL = 'https://txqsqudkhyehxkwmmart.supabase.co/functions/v1/aruna-review-native-admin';
const REVIEW_TYPE = '$app:review';
const QUESTION_TYPE = '$app:question';
const STORAGE_KEY = 'arunaReviewNativeSyncKeyV1';
const BK_AUTO_KEY = 'arunaReviewBkAutoMigrationV1';

const CREATE_METAOBJECT = `mutation ArunaInboxCreate($metaobject: MetaobjectCreateInput!) {
  metaobjectCreate(metaobject: $metaobject) {
    metaobject { id }
    userErrors { field message code }
  }
}`;

const LIST_EXISTING_REVIEWS = `query ArunaExistingReviews($after: String) {
  metaobjects(type: "$app:review", first: 250, after: $after) {
    nodes { fields { key value } }
    pageInfo { hasNextPage endCursor }
  }
}`;

const LIST_PRODUCTS = `query ArunaProducts($after: String) {
  shop { myshopifyDomain }
  products(first: 100, after: $after, sortKey: UPDATED_AT, reverse: true) {
    nodes { id title handle }
    pageInfo { hasNextPage endCursor }
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
  let after = null;
  let shopDomain = '';
  const products = [];
  do {
    const result = await shopify.query(LIST_PRODUCTS, {variables:{after}});
    shopDomain ||= result?.data?.shop?.myshopifyDomain || '';
    products.push(...(result?.data?.products?.nodes || []));
    const pageInfo = result?.data?.products?.pageInfo;
    after = pageInfo?.hasNextPage ? pageInfo.endCursor : null;
  } while (after && products.length < 250);
  return {shopDomain, products:products.slice(0,250)};
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

function fieldsToObject(fields=[]) {
  const out = {};
  for (const item of fields) out[item.key] = item.value;
  return out;
}

function fingerprint(review) {
  const external = String(review.external_id || '').trim().toLowerCase();
  if (external) return `ext|${review.product_id || review.product_handle || ''}|${external}`;
  return [
    'body',
    String(review.product_id || review.product_handle || '').toLowerCase(),
    String(review.customer_name || '').trim().toLowerCase(),
    String(Number(review.rating)||0),
    String(review.body || review.title || '').trim().toLowerCase().replace(/\s+/g,' ').slice(0,900),
  ].join('|');
}

async function existingReviewFingerprints() {
  let after = null;
  const seen = new Set();
  do {
    const result = await shopify.query(LIST_EXISTING_REVIEWS,{variables:{after}});
    const connection = result?.data?.metaobjects;
    for (const node of connection?.nodes || []) seen.add(fingerprint(fieldsToObject(node.fields)));
    after = connection?.pageInfo?.hasNextPage ? connection.pageInfo.endCursor : null;
  } while (after && seen.size < 5000);
  return seen;
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
    shopDomain,
    products,
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
    scanBkProduct: async (product) => {
      const result = await adminCall(syncKey,{action:'scan_storefront',product,max_reviews:250});
      const rows = Array.isArray(result?.reviews) ? result.reviews : [];
      return rows.filter(row => row?.source === 'bk_public_migration');
    },
    migrateBkAll: async (onProgress) => {
      const list = await api.refreshCatalog();
      const seen = await existingReviewFingerprints();
      let found = 0, imported = 0, skipped = 0, productsWithReviews = 0;
      for (let index = 0; index < list.length; index++) {
        const product = list[index];
        let rows = [];
        try { rows = await api.scanBkProduct(product); } catch {}
        if (rows.length) productsWithReviews++;
        found += rows.length;
        for (const payload of rows) {
          const key = fingerprint(payload);
          if (seen.has(key)) { skipped++; continue; }
          try {
            await createShopifyItem({kind:'review',payload:{...payload,status:'approved',source:'bk_public_migration'}});
            seen.add(key);
            imported++;
          } catch { skipped++; }
        }
        if (typeof onProgress === 'function') onProgress({current:index+1,total:list.length,product,found,imported,skipped});
      }
      const result = {productsScanned:list.length,productsWithReviews,found,imported,skipped,finishedAt:new Date().toISOString()};
      await shopify.storage.set(BK_AUTO_KEY,result);
      return result;
    },
    lastBkMigration: () => shopify.storage.get(BK_AUTO_KEY),
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
  section.setAttribute('heading','Extensão importadora');
  section.setAttribute('data-aruna-native-bridge','true');
  const stack = el('s-stack');
  stack.setAttribute('direction','block');
  stack.setAttribute('gap','small');
  const intro = el('s-text','Conecte a Aruna Review Importer para Shopee, AliExpress, Amazon, Mercado Livre e outros. A migração do BK fica dentro do próprio app.');
  const actions = el('s-stack');
  actions.setAttribute('direction','inline');
  actions.setAttribute('gap','small');
  const pairButton = el('s-button','Gerar código da extensão');
  pairButton.setAttribute('variant','primary');
  const syncButton = el('s-button','Sincronizar caixa');
  const status = el('s-text','');
  pairButton.addEventListener('click', async () => {
    pairButton.disabled = true;
    status.textContent = 'Gerando código…';
    try {
      const pair = await api.createPair();
      const expiry = pair?.expires_at ? new Date(pair.expires_at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) : '';
      status.textContent = `Código: ${pair.code}${expiry ? ` · válido até ${expiry}` : ''}`;
    } catch { status.textContent = 'Não foi possível gerar o código agora.'; }
    finally { pairButton.disabled = false; }
  });
  syncButton.addEventListener('click', async () => {
    syncButton.disabled = true;
    status.textContent = 'Sincronizando…';
    try {
      const result = await api.syncNow();
      status.textContent = result.synced ? `${result.synced} item(ns) sincronizados.` : 'Tudo sincronizado.';
    } catch { status.textContent = 'Não foi possível sincronizar agora.'; }
    finally { syncButton.disabled = false; }
  });
  actions.append(pairButton,syncButton);
  stack.append(intro,actions,status);
  section.appendChild(stack);
  page.appendChild(section);
}

export default async function extension() {
  let api = null;
  try { api = await setupNativeBridge(); }
  catch (error) { console.error('Aruna Review native bridge unavailable', error); }
  const mounted = mountAppHome();
  if (api) queueMicrotask(() => mountBridgeControls(api));
  return mounted;
}

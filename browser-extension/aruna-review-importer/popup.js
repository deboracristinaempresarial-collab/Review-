const API = 'https://txqsqudkhyehxkwmmart.supabase.co/functions/v1/aruna-review-native-importer';
const $ = (id) => document.getElementById(id);
let token = '';
let catalog = [];
let scanned = [];
let source = 'pagina_publica';

function setStatus(message, pair = false) {
  $(pair ? 'pairStatus' : 'status').textContent = message || '';
}

async function storeGet(key) {
  return (await chrome.storage.local.get(key))[key];
}

async function api(body, auth = true) {
  const response = await fetch(API, {
    method: 'POST',
    headers: {
      'content-type':'application/json',
      ...(auth && token ? {'x-aruna-importer-token':token} : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
  return data;
}

function showPaired(paired) {
  $('pairView').hidden = paired;
  $('mainView').hidden = !paired;
}

function renderProducts() {
  const select = $('productSelect');
  select.innerHTML = '';
  if (!catalog.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'Nenhum produto recebido';
    select.appendChild(option);
    return;
  }
  for (const product of catalog) {
    const option = document.createElement('option');
    option.value = product.id;
    option.dataset.handle = product.handle;
    option.dataset.title = product.title;
    option.textContent = product.title;
    select.appendChild(option);
  }
}

function renderPreview() {
  const preview = $('preview');
  preview.innerHTML = '';
  $('countBadge').textContent = String(scanned.length);
  $('sendButton').disabled = !scanned.length || !$('productSelect').value;
  for (const review of scanned.slice(0, 8)) {
    const card = document.createElement('article');
    card.className = 'review';
    const stars = document.createElement('div');
    stars.className = 'stars';
    stars.textContent = '★'.repeat(Math.max(1,Math.min(5,Number(review.rating)||5)));
    const author = document.createElement('strong');
    author.textContent = review.customer_name || 'Cliente';
    const body = document.createElement('p');
    body.textContent = review.body || review.title || 'Sem texto';
    card.append(stars,author,body);
    preview.appendChild(card);
  }
  if (scanned.length > 8) {
    const more = document.createElement('p');
    more.textContent = `+ ${scanned.length - 8} avaliações na fila`;
    preview.appendChild(more);
  }
}

async function loadCatalog() {
  setStatus('Atualizando produtos…');
  const data = await api({action:'catalog'});
  catalog = Array.isArray(data.products) ? data.products : [];
  $('shopDomain').textContent = data.shop_domain || '';
  renderProducts();
  setStatus(catalog.length ? `${catalog.length} produto(s) disponíveis.` : 'Abra o Aruna Review na Shopify e toque em Atualizar produtos.');
}

async function pair() {
  const code = $('pairCode').value.replace(/\s+/g,'').toUpperCase();
  if (code.length !== 8) { setStatus('Digite o código de 8 caracteres.', true); return; }
  $('pairButton').disabled = true;
  setStatus('Conectando…', true);
  try {
    const data = await api({action:'claim',code,device_name:'Aruna Review Importer'}, false);
    token = data.importer_token || '';
    if (!token) throw new Error('token_missing');
    await chrome.storage.local.set({arunaImporterToken:token});
    showPaired(true);
    await loadCatalog();
  } catch (error) {
    setStatus(error.message === 'code_expired_or_invalid' ? 'Código inválido ou expirado. Gere outro no painel.' : 'Não foi possível conectar agora.', true);
  } finally {
    $('pairButton').disabled = false;
  }
}

async function scanPage() {
  $('scanButton').disabled = true;
  setStatus('Lendo a página aberta…');
  try {
    const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
    if (!tab?.id) throw new Error('tab_missing');
    let result;
    try {
      result = await chrome.tabs.sendMessage(tab.id,{type:'ARUNA_REVIEW_SCAN'});
    } catch {
      await chrome.scripting.executeScript({target:{tabId:tab.id},files:['content.js']});
      result = await chrome.tabs.sendMessage(tab.id,{type:'ARUNA_REVIEW_SCAN'});
    }
    if (!result?.ok) throw new Error(result?.error || 'scan_failed');
    scanned = Array.isArray(result.rows) ? result.rows : [];
    source = result.source || 'pagina_publica';
    $('sourceLabel').textContent = `${source} · ${result.title || ''}`;
    renderPreview();
    setStatus(scanned.length ? `${scanned.length} avaliação(ões) encontradas.` : 'Não encontrei avaliações públicas nesta página. Role até a área de avaliações e tente novamente.');
  } catch {
    setStatus('Não consegui ler esta página. Abra a página do produto e tente novamente.');
  } finally {
    $('scanButton').disabled = false;
  }
}

async function sendRows() {
  const select = $('productSelect');
  const option = select.selectedOptions[0];
  if (!option || !select.value || !scanned.length) return;
  const target = {product_id:select.value,product_handle:option.dataset.handle || '',product_title:option.dataset.title || option.textContent || ''};
  const rows = scanned.map((row) => ({
    ...row,
    ...target,
    source: row.source || source,
    origin: row.origin || source,
    imported:true,
    imported_by_extension:true,
    import_batch:`aruna-ext-${Date.now()}`,
  }));
  $('sendButton').disabled = true;
  setStatus(`Enviando ${rows.length} avaliações…`);
  try {
    const data = await api({action:'submit',rows,imported_only:$('importedOnly').checked});
    setStatus(`${data.inserted || 0} enviada(s) para o Aruna Review. ${data.skipped ? `${data.skipped} ignorada(s).` : ''} Abra o painel para sincronizar/moderar.`);
    scanned = [];
    renderPreview();
  } catch {
    setStatus('Não foi possível enviar o lote agora.');
  } finally {
    $('sendButton').disabled = !scanned.length;
  }
}

async function disconnect() {
  await chrome.storage.local.remove('arunaImporterToken');
  token = '';
  catalog = [];
  scanned = [];
  showPaired(false);
  $('pairCode').value = '';
  setStatus('', true);
}

$('pairCode').addEventListener('input', (event) => { event.target.value = event.target.value.toUpperCase().replace(/[^A-Z2-9]/g,''); });
$('pairButton').addEventListener('click', pair);
$('refreshCatalogButton').addEventListener('click', () => loadCatalog().catch(() => setStatus('Não foi possível atualizar produtos.')));
$('scanButton').addEventListener('click', scanPage);
$('sendButton').addEventListener('click', sendRows);
$('disconnectButton').addEventListener('click', disconnect);

(async () => {
  token = await storeGet('arunaImporterToken') || '';
  if (!token) { showPaired(false); return; }
  showPaired(true);
  try { await loadCatalog(); }
  catch { await disconnect(); setStatus('A conexão expirou ou foi revogada. Gere outro código.', true); }
})();

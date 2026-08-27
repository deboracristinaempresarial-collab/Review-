const API = 'https://txqsqudkhyehxkwmmart.supabase.co/functions/v1/aruna-review-native-importer';
const $ = (id) => document.getElementById(id);
let token = '';
let catalog = [];
let scanned = [];
let selected = new Set();
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

function filteredRows() {
  const rating = $('ratingFilter').value;
  const mediaOnly = $('mediaOnly').checked;
  return scanned.map((review,index) => ({review,index})).filter(({review}) => {
    if (rating !== 'all' && Number(review.rating || 0) < Number(rating)) return false;
    if (mediaOnly && !(Array.isArray(review.media_urls) && review.media_urls.length)) return false;
    return true;
  });
}

function updateSelectionText() {
  $('selectedCount').textContent = `${selected.size} selecionada${selected.size === 1 ? '' : 's'}`;
  $('sendButton').disabled = !selected.size || !$('productSelect').value;
  $('sendButton').textContent = selected.size ? `Importar ${selected.size} selecionada${selected.size === 1 ? '' : 's'}` : 'Importar selecionadas';
}

function renderPreview() {
  const preview = $('preview');
  preview.innerHTML = '';
  $('countBadge').textContent = String(scanned.length);
  $('filterBar').hidden = !scanned.length;
  $('selectionBar').hidden = !scanned.length;
  const rows = filteredRows();

  for (const {review,index} of rows.slice(0, 60)) {
    const card = document.createElement('article');
    card.className = 'review';

    const check = document.createElement('input');
    check.type = 'checkbox';
    check.className = 'review-check';
    check.checked = selected.has(index);
    check.addEventListener('change', () => {
      if (check.checked) selected.add(index); else selected.delete(index);
      updateSelectionText();
    });

    const main = document.createElement('div');
    main.className = 'review-main';
    const head = document.createElement('div');
    head.className = 'review-head';
    const author = document.createElement('strong');
    author.className = 'review-author';
    author.textContent = review.customer_name || 'Cliente';
    const star = document.createElement('span');
    star.className = 'stars';
    star.textContent = '★'.repeat(Math.max(1,Math.min(5,Number(review.rating)||5)));
    head.append(author,star);

    const body = document.createElement('p');
    body.className = 'review-body';
    body.textContent = review.body || review.title || 'Sem texto';

    const meta = document.createElement('div');
    meta.className = 'review-meta';
    const sourceTag = document.createElement('span');
    sourceTag.textContent = review.source || source;
    meta.appendChild(sourceTag);
    if (review.created_at || review.review_date) {
      const date = document.createElement('span');
      const raw = review.created_at || review.review_date;
      const parsed = new Date(raw);
      date.textContent = Number.isNaN(parsed.getTime()) ? String(raw).slice(0,24) : parsed.toLocaleDateString('pt-BR');
      meta.appendChild(date);
    }

    main.append(head,body,meta);

    const media = Array.isArray(review.media_urls) ? review.media_urls.filter(Boolean).slice(0,4) : [];
    if (media.length) {
      const thumbs = document.createElement('div');
      thumbs.className = 'thumbs';
      media.forEach((url) => {
        if (!/^https:\/\//i.test(url)) return;
        const img = document.createElement('img');
        img.className = 'thumb';
        img.src = url;
        img.alt = '';
        img.referrerPolicy = 'no-referrer';
        thumbs.appendChild(img);
      });
      main.appendChild(thumbs);
    }

    card.append(check,main);
    preview.appendChild(card);
  }

  if (!rows.length && scanned.length) {
    const empty = document.createElement('p');
    empty.className = 'more';
    empty.textContent = 'Nenhuma avaliação corresponde aos filtros.';
    preview.appendChild(empty);
  } else if (rows.length > 60) {
    const more = document.createElement('p');
    more.className = 'more';
    more.textContent = `Mostrando 60 de ${rows.length}. As demais continuam disponíveis para seleção.`;
    preview.appendChild(more);
  }
  updateSelectionText();
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
    const data = await api({action:'claim',code,device_name:'Aruna Review Importer 1.1'}, false);
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
  setStatus('Lendo avaliações públicas da página…');
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
    selected = new Set(scanned.map((_,index) => index));
    source = result.source || 'pagina_publica';
    $('sourceLabel').textContent = `${source.replaceAll('_',' ')} · ${result.title || ''}`;
    renderPreview();
    setStatus(scanned.length ? `${scanned.length} avaliação(ões) encontradas. Revise a prévia antes de importar.` : 'Não encontrei avaliações visíveis nesta página. Role até a área de avaliações, carregue mais comentários e tente novamente.');
  } catch {
    scanned = [];
    selected = new Set();
    renderPreview();
    setStatus('Não consegui ler esta página. Abra a página do produto e deixe as avaliações visíveis antes de tentar novamente.');
  } finally {
    $('scanButton').disabled = false;
  }
}

async function sendRows() {
  const select = $('productSelect');
  const option = select.selectedOptions[0];
  if (!option || !select.value || !selected.size) return;
  const target = {product_id:select.value,product_handle:option.dataset.handle || '',product_title:option.dataset.title || option.textContent || ''};
  const picked = scanned.filter((_,index) => selected.has(index));
  const batch = `aruna-ext-${Date.now()}`;
  const rows = picked.map((row) => ({
    ...row,
    ...target,
    source: row.source || source,
    origin: row.origin || source,
    imported:true,
    imported_by_extension:true,
    import_batch:batch,
  }));
  $('sendButton').disabled = true;
  setStatus(`Enviando ${rows.length} avaliações para o Aruna Review…`);
  try {
    const data = await api({action:'submit',rows,imported_only:$('importedOnly').checked});
    const inserted = Number(data.inserted || 0);
    const skipped = Number(data.skipped || 0);
    setStatus(`${inserted} enviada(s) para o Aruna Review.${skipped ? ` ${skipped} ignorada(s).` : ''} Abra o painel para sincronizar/moderar.`);
    const history = {count:inserted,when:new Date().toISOString(),source,product:target.product_title};
    await chrome.storage.local.set({arunaImporterLastImport:history});
    renderHistory(history);
    scanned = [];
    selected = new Set();
    renderPreview();
  } catch {
    setStatus('Não foi possível enviar o lote agora.');
  } finally {
    updateSelectionText();
  }
}

function renderHistory(history) {
  if (!history?.when) { $('historyPanel').hidden = true; return; }
  $('historyPanel').hidden = false;
  $('historyCount').textContent = `${history.count || 0} avaliação${Number(history.count) === 1 ? '' : 'ões'} · ${history.product || ''}`;
  const date = new Date(history.when);
  $('historyWhen').textContent = Number.isNaN(date.getTime()) ? '' : date.toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'});
}

async function disconnect() {
  await chrome.storage.local.remove('arunaImporterToken');
  token = '';
  catalog = [];
  scanned = [];
  selected = new Set();
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
$('ratingFilter').addEventListener('change', renderPreview);
$('mediaOnly').addEventListener('change', renderPreview);
$('selectAllButton').addEventListener('click', () => { selected = new Set(scanned.map((_,index)=>index)); renderPreview(); });
$('clearSelectionButton').addEventListener('click', () => { selected = new Set(); renderPreview(); });

(async () => {
  renderHistory(await storeGet('arunaImporterLastImport'));
  token = await storeGet('arunaImporterToken') || '';
  if (!token) { showPaired(false); return; }
  showPaired(true);
  try { await loadCatalog(); }
  catch { await disconnect(); setStatus('A conexão expirou ou foi revogada. Gere outro código.', true); }
})();

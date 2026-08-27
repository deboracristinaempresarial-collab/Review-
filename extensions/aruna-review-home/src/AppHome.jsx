/** @jsxImportSource preact */
import '@shopify/ui-extensions/preact';
import {render} from 'preact';
import {useEffect, useMemo, useState} from 'preact/hooks';

const REVIEW_TYPE = '$app:review';
const QUESTION_TYPE = '$app:question';
const SETTINGS_TYPE = '$app:settings';
const REQUEST_TYPE = '$app:review_request';

const PRESETS = [
  {value:'compat-01',label:'Compatibilidade 01 — Clássico'},
  {value:'compat-02',label:'Compatibilidade 02 — Moderno'},
  {value:'compat-03',label:'Compatibilidade 03 — Marketplace'},
  {value:'compat-04',label:'Compatibilidade 04 — Galeria'},
  {value:'compat-05',label:'Compatibilidade 05 — Cards'},
  {value:'compat-06',label:'Compatibilidade 06 — Minimal'},
  {value:'compat-07',label:'Compatibilidade 07 — Centralizado'},
  {value:'compat-08',label:'Compatibilidade 08 — Social'},
  {value:'compat-09',label:'Compatibilidade 09 — Lista'},
  {value:'compat-10',label:'Compatibilidade 10 — Amplo'},
  {value:'compat-11',label:'Compatibilidade 11 — Escuro'},
  {value:'aruna-premium',label:'ARUNA — Premium'},
  {value:'aruna-compact',label:'ARUNA — Compacto'},
  {value:'aruna-media',label:'ARUNA — Fotos & Vídeos'},
  {value:'aruna-lux',label:'ARUNA — Lux'},
];

const DEFAULT_SETTINGS = {
  name:'Global',
  moderation_mode:'manual',
  show_verified:'true',
  show_source:'true',
  show_helpful:'true',
  show_qa:'true',
  heading:'Avaliações de clientes',
  accent_color:'#0B4FA3',
  star_color:'#F5B301',
  visual_theme:'aruna-premium',
  reviews_per_page:'20',
  request_delay_days:'7',
  request_subject:'Como foi sua experiência?',
  request_message:'Oi! Queremos saber como foi sua experiência com {{produto}}. Sua avaliação ajuda muito. Avalie aqui: {{link}}',
};

const LIST_METAOBJECTS = `query ArunaMetaobjects($type: String!) {
  metaobjects(type: $type, first: 250, sortKey: "updated_at", reverse: true) {
    nodes { id handle createdAt updatedAt fields { key value } }
  }
}`;

const LIST_PRODUCTS = `query ArunaProducts {
  shop { primaryDomain { url } }
  products(first: 100, sortKey: UPDATED_AT, reverse: true) {
    nodes { id title handle }
  }
}`;

const CREATE_METAOBJECT = `mutation CreateArunaMetaobject($metaobject: MetaobjectCreateInput!) {
  metaobjectCreate(metaobject: $metaobject) {
    metaobject { id handle }
    userErrors { field message code }
  }
}`;

const UPDATE_METAOBJECT = `mutation UpdateArunaMetaobject($id: ID!, $metaobject: MetaobjectUpdateInput!) {
  metaobjectUpdate(id: $id, metaobject: $metaobject) {
    metaobject { id handle }
    userErrors { field message code }
  }
}`;

const DELETE_METAOBJECT = `mutation DeleteArunaMetaobject($id: ID!) {
  metaobjectDelete(id: $id) {
    deletedId
    userErrors { field message code }
  }
}`;

const UPSERT_METAOBJECT = `mutation UpsertArunaMetaobject($handle: MetaobjectHandleInput!, $metaobject: MetaobjectUpsertInput!) {
  metaobjectUpsert(handle: $handle, metaobject: $metaobject) {
    metaobject { id handle }
    userErrors { field message code }
  }
}`;

async function gql(query, variables = {}) {
  const response = await fetch('shopify:admin/api/2026-07/graphql.json', {
    method: 'POST',
    body: JSON.stringify({query, variables}),
  });
  const json = await response.json();
  if (!response.ok || json.errors?.length) {
    throw new Error(json.errors?.[0]?.message || 'Falha ao comunicar com a Shopify.');
  }
  return json.data;
}

function firstError(payload) {
  const errors = payload?.userErrors || [];
  if (errors.length) throw new Error(errors[0].message);
  return payload;
}

const f = (key, value) => value === undefined || value === null ? null : ({key, value: String(value)});

function boolValue(value) {
  return value === true || value === 'true';
}

function mediaValue(value) {
  if (!value) return '[]';
  if (Array.isArray(value)) return JSON.stringify(value.filter(Boolean));
  const text = String(value).trim();
  if (!text) return '[]';
  if (text.startsWith('[')) {
    try {
      const parsed = JSON.parse(text);
      return JSON.stringify(Array.isArray(parsed) ? parsed.filter(Boolean) : []);
    } catch {}
  }
  return JSON.stringify(text.split(/[\n,]+/).map(v => v.trim()).filter(Boolean));
}

function mediaText(value) {
  if (!value) return '';
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.join('\n') : '';
  } catch {
    return String(value);
  }
}

function reviewFields(data) {
  return [
    f('product_id', data.product_id),
    f('product_handle', data.product_handle),
    f('product_title', data.product_title),
    f('customer_name', data.customer_name || 'Cliente'),
    f('customer_email', data.customer_email || ''),
    f('rating', Math.max(1, Math.min(5, Number(data.rating) || 5))),
    f('title', data.title || ''),
    f('body', data.body || ''),
    f('status', data.status || 'pending'),
    f('verified', boolValue(data.verified) ? 'true' : 'false'),
    f('verification_status', boolValue(data.verified) ? 'verified' : 'unverified'),
    f('merchant_reply', data.merchant_reply || ''),
    f('featured', boolValue(data.featured) ? 'true' : 'false'),
    f('source', data.source || 'manual'),
    f('external_id', data.external_id || ''),
    f('review_date', data.review_date || new Date().toISOString()),
    f('media_urls', mediaValue(data.media_urls)),
    f('helpful_count', Number(data.helpful_count) || 0),
    f('language', data.language || 'pt-BR'),
    f('order_id', data.order_id || ''),
    f('import_batch', data.import_batch || ''),
  ].filter(Boolean);
}

function questionFields(data) {
  return [
    f('product_id', data.product_id),
    f('product_handle', data.product_handle),
    f('product_title', data.product_title),
    f('customer_name', data.customer_name || 'Cliente'),
    f('customer_email', data.customer_email || ''),
    f('question', data.question || ''),
    f('status', data.status || 'pending'),
    f('merchant_answer', data.merchant_answer || ''),
    f('submitted_at', data.submitted_at || new Date().toISOString()),
    f('source', data.source || 'manual'),
  ].filter(Boolean);
}

function requestFields(data) {
  return [
    f('product_id', data.product_id),
    f('product_handle', data.product_handle),
    f('product_title', data.product_title),
    f('recipient_name', data.recipient_name || 'Cliente'),
    f('recipient_contact', data.recipient_contact || ''),
    f('channel', data.channel || 'whatsapp'),
    f('status', data.status || 'draft'),
    f('review_link', data.review_link || ''),
    f('created_at', data.created_at || new Date().toISOString()),
    f('sent_at', data.sent_at || ''),
  ].filter(Boolean);
}

function settingsFields(data) {
  return [
    f('name', 'Global'),
    f('moderation_mode', data.moderation_mode || 'manual'),
    f('show_verified', boolValue(data.show_verified) ? 'true' : 'false'),
    f('show_source', boolValue(data.show_source) ? 'true' : 'false'),
    f('show_helpful', boolValue(data.show_helpful) ? 'true' : 'false'),
    f('show_qa', boolValue(data.show_qa) ? 'true' : 'false'),
    f('heading', data.heading || 'Avaliações de clientes'),
    f('accent_color', data.accent_color || '#0B4FA3'),
    f('star_color', data.star_color || '#F5B301'),
    f('visual_theme', data.visual_theme || 'aruna-premium'),
    f('reviews_per_page', Number(data.reviews_per_page) || 20),
    f('request_delay_days', Number(data.request_delay_days) || 7),
    f('request_subject', data.request_subject || DEFAULT_SETTINGS.request_subject),
    f('request_message', data.request_message || DEFAULT_SETTINGS.request_message),
  ].filter(Boolean);
}

function normalize(node) {
  const obj = {id: node.id, handle: node.handle, createdAt: node.createdAt, updatedAt: node.updatedAt};
  for (const item of node.fields || []) obj[item.key] = item.value;
  return obj;
}

function stars(value) {
  const n = Math.max(0, Math.min(5, Number(value) || 0));
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}

function labelStatus(value) {
  if (value === 'approved') return 'Aprovada';
  if (value === 'rejected') return 'Rejeitada';
  if (value === 'hidden') return 'Oculta';
  return 'Pendente';
}

function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (ch === ',' && !quoted) {
      row.push(cell); cell = '';
    } else if ((ch === '\n' || ch === '\r') && !quoted) {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some(v => v.trim())) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some(v => v.trim())) rows.push(row);
  if (rows.length < 2) return [];
  const headers = rows[0].map(v => v.trim());
  return rows.slice(1).map(values => Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ''])));
}

function parseImport(text) {
  const source = text.trim();
  if (!source) return [];
  if (source.startsWith('[') || source.startsWith('{')) {
    const parsed = JSON.parse(source);
    return Array.isArray(parsed) ? parsed : Array.isArray(parsed.reviews) ? parsed.reviews : [parsed];
  }
  return parseCsv(source);
}

function importedSignal(row) {
  const truthyKeys = ['imported','is_imported','was_imported','imported_by_extension','source_imported','isImported'];
  if (truthyKeys.some(key => row[key] === true || String(row[key] || '').toLowerCase() === 'true' || String(row[key] || '') === '1')) return true;
  if (row.imported_at || row.import_batch_id || row.import_batch || row.batch_id) return true;
  const origin = [row.origin,row.source,row.migration_source,row.review_source,row.import_source,row.platform,row.marketplace].filter(Boolean).join(' ').toLowerCase();
  if (!origin) return false;
  if (/(native|organic|customer|storefront|manual customer|bk native)/.test(origin)) return false;
  return /(import|extension|aliexpress|ali express|shopee|shein|temu|amazon|mercado livre|ebay|alibaba)/.test(origin);
}

function sourceFromRow(row, fallback) {
  return row.source || row.origin || row.platform || row.marketplace || row.import_source || fallback || 'importado';
}

function statusFromRow(row) {
  const raw = String(row.status || row.source_status || row.review_status || '').toLowerCase();
  if (['approved','published','active','publicado','aprovado'].includes(raw) || row.approved === true || row.approved === 'true') return 'approved';
  if (['rejected','rejeitado','declined'].includes(raw)) return 'rejected';
  if (['hidden','oculto','archived','arquivado'].includes(raw)) return 'hidden';
  return 'pending';
}

function normalizedImportReview(row, product, fallbackSource, batch) {
  const rating = Number(row.rating ?? row.stars ?? row.rate ?? row.score ?? 5);
  return {
    product_id: product.id,
    product_handle: product.handle,
    product_title: product.title,
    customer_name: row.customer_name || row.author || row.name || row.reviewer_name || 'Cliente',
    customer_email: row.customer_email || row.email || '',
    rating: Math.max(1, Math.min(5, Number.isFinite(rating) ? rating : 5)),
    title: row.title || row.review_title || '',
    body: row.body || row.comment || row.content || row.review || row.text || '',
    status: statusFromRow(row),
    verified: false,
    featured: false,
    merchant_reply: row.merchant_reply || row.reply || '',
    source: sourceFromRow(row, fallbackSource),
    external_id: row.external_id || row.id || row.review_id || '',
    review_date: row.review_date || row.date || row.created_at || row.createdAt || new Date().toISOString(),
    media_urls: row.media_urls || row.images || row.photos || row.media || [],
    helpful_count: row.helpful_count || row.helpful || 0,
    language: row.language || 'pt-BR',
    order_id: '',
    import_batch: batch,
  };
}

function csvCell(value) {
  const text = Array.isArray(value) ? JSON.stringify(value) : String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

function exportRows(reviews) {
  const keys = ['product_id','product_handle','product_title','customer_name','customer_email','rating','title','body','status','verified','featured','merchant_reply','source','external_id','review_date','media_urls','helpful_count','language','order_id','import_batch'];
  return {keys, rows: reviews.map(review => Object.fromEntries(keys.map(key => [key, review[key] ?? ''])))};
}

function makeCsv(reviews) {
  const {keys, rows} = exportRows(reviews);
  return [keys.join(','), ...rows.map(row => keys.map(key => csvCell(row[key])).join(','))].join('\n');
}

function pickCounts(items, key, limit = 5) {
  const counts = {};
  for (const item of items) {
    const value = String(item[key] || 'Sem informação');
    counts[value] = (counts[value] || 0) + 1;
  }
  return Object.entries(counts).sort((a,b) => b[1] - a[1]).slice(0, limit);
}

export default function extension() {
  render(<App />, document.body);
}

function App() {
  const [page, setPage] = useState('dashboard');
  const [reviews, setReviews] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [requests, setRequests] = useState([]);
  const [products, setProducts] = useState([]);
  const [shopUrl, setShopUrl] = useState('');
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [selected, setSelected] = useState([]);
  const [filters, setFilters] = useState({status:'all',rating:'all',source:'all',product:'all',verified:'all',search:''});
  const [reply, setReply] = useState({});
  const [editId, setEditId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  async function reload() {
    setLoading(true);
    try {
      const [r,q,s,req,p] = await Promise.all([
        gql(LIST_METAOBJECTS,{type:REVIEW_TYPE}),
        gql(LIST_METAOBJECTS,{type:QUESTION_TYPE}),
        gql(LIST_METAOBJECTS,{type:SETTINGS_TYPE}),
        gql(LIST_METAOBJECTS,{type:REQUEST_TYPE}),
        gql(LIST_PRODUCTS),
      ]);
      setReviews(r.metaobjects.nodes.map(normalize));
      setQuestions(q.metaobjects.nodes.map(normalize));
      setRequests(req.metaobjects.nodes.map(normalize));
      const currentSettings = s.metaobjects.nodes[0] ? {...DEFAULT_SETTINGS,...normalize(s.metaobjects.nodes[0])} : DEFAULT_SETTINGS;
      setSettings(currentSettings);
      setProducts(p.products.nodes);
      setShopUrl(p.shop?.primaryDomain?.url || '');
      setSelected([]);
    } catch (error) {
      setNotice(error.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { reload(); }, []);

  const stats = useMemo(() => {
    const approved = reviews.filter(r => r.status === 'approved');
    const pending = reviews.filter(r => (r.status || 'pending') === 'pending');
    const rejected = reviews.filter(r => r.status === 'rejected').length;
    const hidden = reviews.filter(r => r.status === 'hidden').length;
    const verified = reviews.filter(r => boolValue(r.verified)).length;
    const featured = reviews.filter(r => boolValue(r.featured)).length;
    const average = approved.length ? approved.reduce((sum,r) => sum + Number(r.rating || 0),0) / approved.length : 0;
    return {total:reviews.length,approved:approved.length,pending:pending.length,rejected,hidden,verified,featured,average};
  }, [reviews]);

  const sources = useMemo(() => [...new Set(reviews.map(r => r.source).filter(Boolean))].sort(), [reviews]);

  const visibleReviews = useMemo(() => reviews.filter(review => {
    if (filters.status !== 'all' && (review.status || 'pending') !== filters.status) return false;
    if (filters.rating !== 'all' && String(review.rating || '') !== filters.rating) return false;
    if (filters.source !== 'all' && String(review.source || '') !== filters.source) return false;
    if (filters.product !== 'all' && String(review.product_handle || '') !== filters.product) return false;
    if (filters.verified === 'yes' && !boolValue(review.verified)) return false;
    if (filters.verified === 'no' && boolValue(review.verified)) return false;
    const query = filters.search.trim().toLowerCase();
    if (!query) return true;
    return [review.customer_name,review.customer_email,review.product_title,review.title,review.body,review.source,review.external_id].some(value => String(value || '').toLowerCase().includes(query));
  }), [reviews, filters]);

  async function patchReview(review, patch, quiet = false) {
    if (!quiet) setNotice('Salvando…');
    const fields = Object.entries(patch).map(([key,value]) => f(key, value)).filter(Boolean);
    const input = {fields};
    if (patch.status) input.capabilities = {publishable:{status:patch.status === 'approved' ? 'ACTIVE' : 'DRAFT'}};
    const data = await gql(UPDATE_METAOBJECT,{id:review.id,metaobject:input});
    firstError(data.metaobjectUpdate);
    if (!quiet) {
      setNotice('Alteração salva.');
      await reload();
    }
  }

  async function bulkPatch(patch) {
    const targets = reviews.filter(review => selected.includes(review.id));
    if (!targets.length) { setNotice('Selecione pelo menos uma avaliação.'); return; }
    setNotice(`Atualizando ${targets.length} avaliações…`);
    try {
      for (const review of targets) await patchReview(review, patch, true);
      setNotice(`${targets.length} avaliações atualizadas.`);
      await reload();
    } catch (error) {
      setNotice(error.message);
    }
  }

  async function createReview(data, quiet = false) {
    if (!quiet) setNotice('Criando avaliação…');
    try {
      const input = {type:REVIEW_TYPE,fields:reviewFields(data),capabilities:{publishable:{status:data.status === 'approved' ? 'ACTIVE' : 'DRAFT'}}};
      firstError((await gql(CREATE_METAOBJECT,{metaobject:input})).metaobjectCreate);
      if (!quiet) {
        setNotice('Avaliação criada.');
        await reload();
        setPage('reviews');
      }
    } catch (error) {
      if (!quiet) setNotice(error.message);
      throw error;
    }
  }

  async function saveReview(review, data) {
    try {
      await patchReview(review, {
        customer_name:data.customer_name,customer_email:data.customer_email,rating:data.rating,title:data.title,body:data.body,
        status:data.status,source:data.source,external_id:data.external_id,review_date:data.review_date,
        media_urls:mediaValue(data.media_urls),helpful_count:Number(data.helpful_count) || 0,
      });
      setEditId(null);
    } catch (error) { setNotice(error.message); }
  }

  async function deleteReview(review) {
    setNotice('Excluindo avaliação…');
    try {
      firstError((await gql(DELETE_METAOBJECT,{id:review.id})).metaobjectDelete);
      setConfirmDelete(null);
      setNotice('Avaliação excluída.');
      await reload();
    } catch (error) { setNotice(error.message); }
  }

  async function createQuestion(data) {
    setNotice('Criando pergunta…');
    try {
      const input = {type:QUESTION_TYPE,fields:questionFields(data),capabilities:{publishable:{status:data.status === 'approved' ? 'ACTIVE' : 'DRAFT'}}};
      firstError((await gql(CREATE_METAOBJECT,{metaobject:input})).metaobjectCreate);
      setNotice('Pergunta criada.');
      await reload();
    } catch (error) { setNotice(error.message); }
  }

  async function patchQuestion(question, patch, quiet = false) {
    if (!quiet) setNotice('Salvando pergunta…');
    const input = {fields:Object.entries(patch).map(([key,value]) => f(key,value)).filter(Boolean)};
    if (patch.status) input.capabilities = {publishable:{status:patch.status === 'approved' ? 'ACTIVE' : 'DRAFT'}};
    try {
      firstError((await gql(UPDATE_METAOBJECT,{id:question.id,metaobject:input})).metaobjectUpdate);
      if (!quiet) { setNotice('Pergunta atualizada.'); await reload(); }
    } catch (error) { setNotice(error.message); }
  }

  async function deleteQuestion(question) {
    try {
      firstError((await gql(DELETE_METAOBJECT,{id:question.id})).metaobjectDelete);
      setNotice('Pergunta excluída.');
      await reload();
    } catch (error) { setNotice(error.message); }
  }

  async function saveSettings(nextSettings) {
    setNotice('Salvando configurações…');
    try {
      const metaobject = {fields:settingsFields(nextSettings),capabilities:{publishable:{status:'ACTIVE'}}};
      firstError((await gql(UPSERT_METAOBJECT,{handle:{type:SETTINGS_TYPE,handle:'global'},metaobject})).metaobjectUpsert);
      setNotice('Configurações salvas e sincronizadas com o widget.');
      await reload();
    } catch (error) { setNotice(error.message); }
  }

  async function createRequest(data) {
    setNotice('Criando solicitação…');
    try {
      firstError((await gql(CREATE_METAOBJECT,{metaobject:{type:REQUEST_TYPE,fields:requestFields(data)}})).metaobjectCreate);
      setNotice('Solicitação criada.');
      await reload();
    } catch (error) { setNotice(error.message); }
  }

  async function markRequestSent(request) {
    setNotice('Atualizando solicitação…');
    try {
      firstError((await gql(UPDATE_METAOBJECT,{id:request.id,metaobject:{fields:[f('status','sent'),f('sent_at',new Date().toISOString())]}})).metaobjectUpdate);
      setNotice('Solicitação marcada como enviada.');
      await reload();
    } catch (error) { setNotice(error.message); }
  }

  function toggleSelected(id) {
    setSelected(current => current.includes(id) ? current.filter(value => value !== id) : [...current,id]);
  }

  function selectVisible() {
    const ids = visibleReviews.map(review => review.id);
    const allSelected = ids.length && ids.every(id => selected.includes(id));
    setSelected(allSelected ? selected.filter(id => !ids.includes(id)) : [...new Set([...selected,...ids])]);
  }

  return (
    <s-page heading="Aruna Review">
      <s-stack direction="block" gap="base">
        <s-section>
          <s-stack direction="inline" gap="small">
            <NavButton page={page} current="dashboard" setPage={setPage}>Visão geral</NavButton>
            <NavButton page={page} current="reviews" setPage={setPage}>Avaliações</NavButton>
            <NavButton page={page} current="transfer" setPage={setPage}>Importar / Exportar</NavButton>
            <NavButton page={page} current="requests" setPage={setPage}>Solicitações</NavButton>
            <NavButton page={page} current="themes" setPage={setPage}>Temas</NavButton>
            <NavButton page={page} current="questions" setPage={setPage}>Perguntas</NavButton>
            <NavButton page={page} current="settings" setPage={setPage}>Configurações</NavButton>
          </s-stack>
        </s-section>

        {notice && <s-banner>{notice}</s-banner>}
        {loading && <s-section><s-text>Carregando Aruna Review…</s-text></s-section>}
        {!loading && page === 'dashboard' && <Dashboard stats={stats} reviews={reviews} questions={questions} requests={requests} setPage={setPage} reload={reload} />}
        {!loading && page === 'reviews' && <ReviewsPage reviews={visibleReviews} products={products} sources={sources} filters={filters} setFilters={setFilters} selected={selected} toggleSelected={toggleSelected} selectVisible={selectVisible} bulkPatch={bulkPatch} patchReview={patchReview} reply={reply} setReply={setReply} editId={editId} setEditId={setEditId} saveReview={saveReview} confirmDelete={confirmDelete} setConfirmDelete={setConfirmDelete} deleteReview={deleteReview} createReview={createReview} settings={settings} />}
        {!loading && page === 'transfer' && <TransferPage products={products} reviews={reviews} createReview={createReview} reload={reload} setNotice={setNotice} />}
        {!loading && page === 'requests' && <RequestsPage products={products} requests={requests} shopUrl={shopUrl} settings={settings} createRequest={createRequest} markRequestSent={markRequestSent} />}
        {!loading && page === 'themes' && <ThemesPage settings={settings} saveSettings={saveSettings} />}
        {!loading && page === 'questions' && <QuestionsPage products={products} questions={questions} createQuestion={createQuestion} patchQuestion={patchQuestion} deleteQuestion={deleteQuestion} />}
        {!loading && page === 'settings' && <SettingsPage settings={settings} saveSettings={saveSettings} />}
      </s-stack>
    </s-page>
  );
}

function NavButton({page,current,setPage,children}) {
  return <s-button variant={page === current ? 'primary' : 'secondary'} onClick={() => setPage(current)}>{children}</s-button>;
}

function Dashboard({stats,reviews,questions,requests,setPage,reload}) {
  const approved = reviews.filter(r => r.status === 'approved');
  const ratingCounts = [5,4,3,2,1].map(rating => [rating, approved.filter(r => Number(r.rating) === rating).length]);
  const sourceCounts = pickCounts(reviews,'source');
  const productCounts = pickCounts(reviews,'product_title');
  const unanswered = questions.filter(q => !q.merchant_answer).length;
  const requestSent = requests.filter(r => r.status === 'sent').length;
  return <>
    <s-section heading="Visão geral"><s-stack direction="inline" gap="base"><Metric title="Total" value={stats.total} detail="Avaliações armazenadas" /><Metric title="Aprovadas" value={stats.approved} detail="Visíveis na loja" /><Metric title="Pendentes" value={stats.pending} detail="Aguardando moderação" /><Metric title="Nota média" value={stats.average.toFixed(1)} detail="Média das aprovadas" /></s-stack></s-section>
    <s-section heading="Saúde da reputação"><s-stack direction="inline" gap="base"><Metric title="Verificadas" value={stats.verified} detail="Marcadas como compra verificada" /><Metric title="Em destaque" value={stats.featured} detail="Avaliações destacadas" /><Metric title="Rejeitadas / ocultas" value={stats.rejected + stats.hidden} detail="Fora da vitrine" /><Metric title="Perguntas sem resposta" value={unanswered} detail={`${requestSent} solicitações marcadas enviadas`} /></s-stack></s-section>
    <s-section heading="Distribuição das notas"><s-stack direction="block" gap="small">{ratingCounts.map(([rating,count]) => <s-text key={rating}>{rating} estrelas — {count}</s-text>)}</s-stack></s-section>
    <s-section heading="Principais origens"><s-stack direction="block" gap="small">{sourceCounts.length ? sourceCounts.map(([name,count]) => <s-text key={name}>{name} — {count}</s-text>) : <s-text>Nenhuma origem registrada.</s-text>}</s-stack></s-section>
    <s-section heading="Produtos com mais avaliações"><s-stack direction="block" gap="small">{productCounts.length ? productCounts.map(([name,count]) => <s-text key={name}>{name} — {count}</s-text>) : <s-text>Nenhum produto avaliado.</s-text>}</s-stack></s-section>
    <s-section heading="Atalhos"><s-stack direction="inline" gap="small"><s-button variant="primary" onClick={() => setPage('reviews')}>Moderar avaliações</s-button><s-button onClick={() => setPage('transfer')}>Importar avaliações</s-button><s-button onClick={() => setPage('questions')}>Responder perguntas</s-button><s-button onClick={() => setPage('themes')}>Personalizar widget</s-button><s-button onClick={reload}>Atualizar dados</s-button></s-stack></s-section>
  </>;
}

function Metric({title,value,detail}) {
  return <s-section heading={title}><s-heading>{value}</s-heading><s-text>{detail}</s-text></s-section>;
}

function ReviewsPage({reviews,products,sources,filters,setFilters,selected,toggleSelected,selectVisible,bulkPatch,patchReview,reply,setReply,editId,setEditId,saveReview,confirmDelete,setConfirmDelete,deleteReview,createReview,settings}) {
  const [showCreate,setShowCreate] = useState(false);
  const updateFilter = (key,value) => setFilters(current => ({...current,[key]:value}));
  return <s-stack direction="block" gap="base">
    <s-section heading="Gerenciar avaliações"><s-stack direction="block" gap="base">
      <s-stack direction="inline" gap="small"><s-text-field label="Buscar" value={filters.search} onInput={e => updateFilter('search',e.currentTarget.value)} placeholder="Cliente, produto, texto, e-mail ou ID" /><s-select label="Status" value={filters.status} onChange={e => updateFilter('status',e.currentTarget.value)}><s-option value="all">Todas</s-option><s-option value="pending">Pendentes</s-option><s-option value="approved">Aprovadas</s-option><s-option value="rejected">Rejeitadas</s-option><s-option value="hidden">Ocultas</s-option></s-select><s-select label="Nota" value={filters.rating} onChange={e => updateFilter('rating',e.currentTarget.value)}><s-option value="all">Todas</s-option>{[5,4,3,2,1].map(value => <s-option key={value} value={String(value)}>{value} estrelas</s-option>)}</s-select></s-stack>
      <s-stack direction="inline" gap="small"><s-select label="Origem" value={filters.source} onChange={e => updateFilter('source',e.currentTarget.value)}><s-option value="all">Todas as origens</s-option>{sources.map(source => <s-option key={source} value={source}>{source}</s-option>)}</s-select><s-select label="Produto" value={filters.product} onChange={e => updateFilter('product',e.currentTarget.value)}><s-option value="all">Todos os produtos</s-option>{products.map(product => <s-option key={product.id} value={product.handle}>{product.title}</s-option>)}</s-select><s-select label="Compra verificada" value={filters.verified} onChange={e => updateFilter('verified',e.currentTarget.value)}><s-option value="all">Todas</s-option><s-option value="yes">Verificadas</s-option><s-option value="no">Não verificadas</s-option></s-select></s-stack>
      <s-stack direction="inline" gap="small"><s-button variant="primary" onClick={() => setShowCreate(!showCreate)}>{showCreate ? 'Fechar criação' : 'Nova avaliação'}</s-button><s-button onClick={selectVisible}>{selected.length ? `Selecionadas: ${selected.length}` : 'Selecionar resultados'}</s-button></s-stack>
    </s-stack></s-section>
    {showCreate && <ManualReviewForm products={products} settings={settings} createReview={async data => { await createReview(data); setShowCreate(false); }} />}
    {selected.length > 0 && <s-section heading={`Ações em massa · ${selected.length} selecionadas`}><s-stack direction="inline" gap="small"><s-button variant="primary" onClick={() => bulkPatch({status:'approved'})}>Aprovar</s-button><s-button onClick={() => bulkPatch({status:'hidden'})}>Ocultar</s-button><s-button onClick={() => bulkPatch({status:'rejected'})}>Rejeitar</s-button><s-button onClick={() => bulkPatch({featured:'true'})}>Destacar</s-button><s-button onClick={() => bulkPatch({featured:'false'})}>Remover destaque</s-button><s-button onClick={() => bulkPatch({verified:'true',verification_status:'verified'})}>Marcar verificadas</s-button><s-button onClick={() => bulkPatch({verified:'false',verification_status:'unverified'})}>Remover verificação</s-button></s-stack></s-section>}
    <s-section heading={`Resultados · ${reviews.length}`}><s-stack direction="block" gap="base">{!reviews.length && <s-banner>Nenhuma avaliação encontrada.</s-banner>}{reviews.map(review => <s-section key={review.id}><s-stack direction="block" gap="small">
      <s-stack direction="inline" gap="small"><s-button variant={selected.includes(review.id) ? 'primary' : 'secondary'} onClick={() => toggleSelected(review.id)}>{selected.includes(review.id) ? 'Selecionada' : 'Selecionar'}</s-button><s-badge>{labelStatus(review.status)}</s-badge>{boolValue(review.verified) && <s-badge>✓ Compra verificada</s-badge>}{boolValue(review.featured) && <s-badge>Destaque</s-badge>}<s-text>{stars(review.rating)}</s-text></s-stack>
      <s-heading>{review.customer_name || 'Cliente'} · {review.product_title || 'Produto'}</s-heading>{review.title && <s-text>{review.title}</s-text>}<s-text>{review.body || 'Sem comentário.'}</s-text><s-text>Origem: {review.source || 'manual'} · ID externo: {review.external_id || '—'} · {review.review_date ? new Date(review.review_date).toLocaleDateString('pt-BR') : ''}</s-text>
      <s-stack direction="inline" gap="small"><s-button variant="primary" onClick={() => patchReview(review,{status:'approved'})}>Aprovar</s-button><s-button onClick={() => patchReview(review,{status:'hidden'})}>Ocultar</s-button><s-button onClick={() => patchReview(review,{status:'rejected'})}>Rejeitar</s-button><s-button onClick={() => patchReview(review,{featured:boolValue(review.featured)?'false':'true'})}>{boolValue(review.featured)?'Remover destaque':'Destacar'}</s-button><s-button onClick={() => patchReview(review,{verified:boolValue(review.verified)?'false':'true',verification_status:boolValue(review.verified)?'unverified':'verified'})}>{boolValue(review.verified)?'Remover verificação':'Marcar verificada'}</s-button><s-button onClick={() => setEditId(editId === review.id ? null : review.id)}>{editId === review.id ? 'Fechar edição' : 'Editar'}</s-button></s-stack>
      {editId === review.id && <ReviewEditor review={review} onSave={data => saveReview(review,data)} onCancel={() => setEditId(null)} />}
      <s-stack direction="inline" gap="small"><s-text-field label="Resposta da loja" value={reply[review.id] ?? review.merchant_reply ?? ''} onInput={event => setReply(current => ({...current,[review.id]:event.currentTarget.value}))} placeholder="Escreva a resposta pública" /><s-button onClick={() => patchReview(review,{merchant_reply:reply[review.id] ?? review.merchant_reply ?? ''})}>Salvar resposta</s-button></s-stack>
      {confirmDelete === review.id ? <s-stack direction="inline" gap="small"><s-banner>Excluir esta avaliação definitivamente?</s-banner><s-button variant="primary" onClick={() => deleteReview(review)}>Confirmar exclusão</s-button><s-button onClick={() => setConfirmDelete(null)}>Cancelar</s-button></s-stack> : <s-button onClick={() => setConfirmDelete(review.id)}>Excluir avaliação</s-button>}
    </s-stack></s-section>)}</s-stack></s-section>
  </s-stack>;
}

function ManualReviewForm({products,settings,createReview}) {
  const [productHandle,setProductHandle] = useState(products[0]?.handle || '');
  const [form,setForm] = useState({customer_name:'',customer_email:'',rating:'5',title:'',body:'',source:'manual',media_urls:'',status:settings.moderation_mode === 'auto' ? 'approved' : 'pending'});
  const product = products.find(item => item.handle === productHandle);
  const set = (key,value) => setForm(current => ({...current,[key]:value}));
  return <s-section heading="Criar avaliação manual"><s-stack direction="block" gap="small"><s-select label="Produto" value={productHandle} onChange={e => setProductHandle(e.currentTarget.value)}>{products.map(item => <s-option key={item.id} value={item.handle}>{item.title}</s-option>)}</s-select><s-stack direction="inline" gap="small"><s-text-field label="Cliente" value={form.customer_name} onInput={e => set('customer_name',e.currentTarget.value)} /><s-text-field label="E-mail opcional" value={form.customer_email} onInput={e => set('customer_email',e.currentTarget.value)} /><s-select label="Nota" value={form.rating} onChange={e => set('rating',e.currentTarget.value)}>{[5,4,3,2,1].map(value => <s-option key={value} value={String(value)}>{value}</s-option>)}</s-select><s-select label="Status" value={form.status} onChange={e => set('status',e.currentTarget.value)}><s-option value="pending">Pendente</s-option><s-option value="approved">Aprovada</s-option><s-option value="hidden">Oculta</s-option><s-option value="rejected">Rejeitada</s-option></s-select></s-stack><s-text-field label="Título" value={form.title} onInput={e => set('title',e.currentTarget.value)} /><s-text-area label="Avaliação" value={form.body} onInput={e => set('body',e.currentTarget.value)} /><s-stack direction="inline" gap="small"><s-text-field label="Origem" value={form.source} onInput={e => set('source',e.currentTarget.value)} /><s-text-area label="Fotos/vídeos — uma URL por linha" value={form.media_urls} onInput={e => set('media_urls',e.currentTarget.value)} /></s-stack><s-button variant="primary" onClick={() => product && createReview({...form,product_id:product.id,product_handle:product.handle,product_title:product.title,verified:false,featured:false})}>Criar avaliação</s-button></s-stack></s-section>;
}

function ReviewEditor({review,onSave,onCancel}) {
  const [form,setForm] = useState({customer_name:review.customer_name || '',customer_email:review.customer_email || '',rating:String(review.rating || 5),title:review.title || '',body:review.body || '',status:review.status || 'pending',source:review.source || 'manual',external_id:review.external_id || '',review_date:review.review_date || new Date().toISOString(),media_urls:mediaText(review.media_urls),helpful_count:String(review.helpful_count || 0)});
  const set = (key,value) => setForm(current => ({...current,[key]:value}));
  return <s-section heading="Editar avaliação"><s-stack direction="block" gap="small"><s-stack direction="inline" gap="small"><s-text-field label="Cliente" value={form.customer_name} onInput={e => set('customer_name',e.currentTarget.value)} /><s-text-field label="E-mail" value={form.customer_email} onInput={e => set('customer_email',e.currentTarget.value)} /><s-select label="Nota" value={form.rating} onChange={e => set('rating',e.currentTarget.value)}>{[5,4,3,2,1].map(value => <s-option key={value} value={String(value)}>{value}</s-option>)}</s-select><s-select label="Status" value={form.status} onChange={e => set('status',e.currentTarget.value)}><s-option value="pending">Pendente</s-option><s-option value="approved">Aprovada</s-option><s-option value="hidden">Oculta</s-option><s-option value="rejected">Rejeitada</s-option></s-select></s-stack><s-text-field label="Título" value={form.title} onInput={e => set('title',e.currentTarget.value)} /><s-text-area label="Texto" value={form.body} onInput={e => set('body',e.currentTarget.value)} /><s-stack direction="inline" gap="small"><s-text-field label="Origem" value={form.source} onInput={e => set('source',e.currentTarget.value)} /><s-text-field label="ID externo" value={form.external_id} onInput={e => set('external_id',e.currentTarget.value)} /><s-text-field label="Data ISO" value={form.review_date} onInput={e => set('review_date',e.currentTarget.value)} /><s-text-field label="Votos úteis" value={form.helpful_count} onInput={e => set('helpful_count',e.currentTarget.value)} /></s-stack><s-text-area label="Fotos/vídeos — uma URL por linha" value={form.media_urls} onInput={e => set('media_urls',e.currentTarget.value)} /><s-stack direction="inline" gap="small"><s-button variant="primary" onClick={() => onSave(form)}>Salvar edição</s-button><s-button onClick={onCancel}>Cancelar</s-button></s-stack></s-stack></s-section>;
}

function TransferPage({products,reviews,createReview,setNotice}) {
  const [mode,setMode] = useState('generic');
  const [productHandle,setProductHandle] = useState(products[0]?.handle || '');
  const [source,setSource] = useState('importado');
  const [raw,setRaw] = useState('');
  const [exportType,setExportType] = useState('csv');
  const [exportText,setExportText] = useState('');
  const [busy,setBusy] = useState(false);
  async function runImport() {
    const product = products.find(item => item.handle === productHandle);
    if (!product) { setNotice('Selecione um produto.'); return; }
    let rows;
    try { rows = parseImport(raw); } catch { setNotice('Arquivo/JSON inválido.'); return; }
    if (mode === 'bk_imported_only') rows = rows.filter(importedSignal);
    if (!rows.length) { setNotice(mode === 'bk_imported_only' ? 'Nenhuma linha marcada como importada foi encontrada.' : 'Nenhuma avaliação válida encontrada.'); return; }
    if (rows.length > 250) { setNotice('Importe no máximo 250 avaliações por lote.'); return; }
    setBusy(true);
    const batch = `aruna-${Date.now()}`;
    let created = 0;
    try {
      for (const row of rows) {
        const review = normalizedImportReview(row,product,source,batch);
        if (!review.body && !review.title) continue;
        await createReview(review,true);
        created++;
      }
      setNotice(`${created} avaliações importadas. ${mode === 'bk_imported_only' ? 'Somente registros confirmados como importados foram aceitos.' : ''}`);
      setRaw('');
    } catch (error) { setNotice(error.message); }
    finally { setBusy(false); }
  }
  function generateExport() { setExportText(exportType === 'json' ? JSON.stringify(exportRows(reviews).rows,null,2) : makeCsv(reviews)); }
  return <s-stack direction="block" gap="base"><s-section heading="Importar avaliações"><s-stack direction="block" gap="small"><s-select label="Modo de importação" value={mode} onChange={e => setMode(e.currentTarget.value)}><s-option value="generic">CSV/JSON genérico</s-option><s-option value="bk_imported_only">Migração BK — somente avaliações já importadas</s-option></s-select><s-select label="Produto de destino" value={productHandle} onChange={e => setProductHandle(e.currentTarget.value)}>{products.map(item => <s-option key={item.id} value={item.handle}>{item.title}</s-option>)}</s-select><s-text-field label="Origem padrão" value={source} onInput={e => setSource(e.currentTarget.value)} placeholder="shopee, aliexpress, importado…" /><s-text-area label="Cole aqui o CSV ou JSON" value={raw} onInput={e => setRaw(e.currentTarget.value)} />{mode === 'bk_imported_only' && <s-banner>Este modo ignora registros nativos/orgânicos do BK e aceita apenas linhas com sinal de importação ou origem de marketplace/importador.</s-banner>}<s-button variant="primary" disabled={busy} onClick={runImport}>{busy ? 'Importando…' : 'Importar agora'}</s-button></s-stack></s-section><s-section heading="Exportar avaliações"><s-stack direction="block" gap="small"><s-select label="Formato" value={exportType} onChange={e => setExportType(e.currentTarget.value)}><s-option value="csv">CSV</s-option><s-option value="json">JSON</s-option></s-select><s-button variant="primary" onClick={generateExport}>Gerar exportação</s-button>{exportText && <s-text-area label="Conteúdo para copiar/salvar" value={exportText} onInput={() => {}} />}</s-stack></s-section></s-stack>;
}

function RequestsPage({products,requests,shopUrl,settings,createRequest,markRequestSent}) {
  const [productHandle,setProductHandle] = useState(products[0]?.handle || '');
  const [recipientName,setRecipientName] = useState('');
  const [recipientContact,setRecipientContact] = useState('');
  const [channel,setChannel] = useState('whatsapp');
  const product = products.find(item => item.handle === productHandle);
  const link = product ? `${shopUrl}/products/${product.handle}#aruna-reviews` : '';
  const message = (settings.request_message || DEFAULT_SETTINGS.request_message).replaceAll('{{produto}}',product?.title || 'seu produto').replaceAll('{{link}}',link);
  return <s-stack direction="block" gap="base"><s-section heading="Criar solicitação de avaliação"><s-stack direction="block" gap="small"><s-banner>Fluxo manual pronto: gere a solicitação, envie pelo canal escolhido e marque como enviada. O histórico fica salvo dentro do Aruna Review.</s-banner><s-select label="Produto" value={productHandle} onChange={e => setProductHandle(e.currentTarget.value)}>{products.map(item => <s-option key={item.id} value={item.handle}>{item.title}</s-option>)}</s-select><s-stack direction="inline" gap="small"><s-text-field label="Nome do cliente" value={recipientName} onInput={e => setRecipientName(e.currentTarget.value)} /><s-text-field label="Contato" value={recipientContact} onInput={e => setRecipientContact(e.currentTarget.value)} /><s-select label="Canal" value={channel} onChange={e => setChannel(e.currentTarget.value)}><s-option value="whatsapp">WhatsApp</s-option><s-option value="email">E-mail</s-option><s-option value="sms">SMS</s-option><s-option value="manual">Outro</s-option></s-select></s-stack><s-text-field label="Link de avaliação" value={link} onInput={() => {}} /><s-text-area label="Mensagem pronta" value={message} onInput={() => {}} /><s-button variant="primary" onClick={() => product && createRequest({product_id:product.id,product_handle:product.handle,product_title:product.title,recipient_name:recipientName || 'Cliente',recipient_contact:recipientContact,channel,status:'draft',review_link:link})}>Salvar solicitação</s-button></s-stack></s-section><s-section heading={`Histórico · ${requests.length}`}><s-stack direction="block" gap="small">{!requests.length && <s-text>Nenhuma solicitação criada.</s-text>}{requests.map(request => <s-section key={request.id}><s-stack direction="block" gap="small"><s-heading>{request.recipient_name || 'Cliente'} · {request.product_title || 'Produto'}</s-heading><s-text>{request.channel || 'manual'} · {request.status === 'sent' ? 'Enviada' : 'Rascunho'}</s-text><s-text>{request.recipient_contact || 'Sem contato informado'}</s-text>{request.status !== 'sent' && <s-button variant="primary" onClick={() => markRequestSent(request)}>Marcar como enviada</s-button>}</s-stack></s-section>)}</s-stack></s-section></s-stack>;
}

function ThemesPage({settings,saveSettings}) {
  return <s-section heading="Temas do widget"><s-stack direction="block" gap="base"><s-banner>Tema global atual: {PRESETS.find(item => item.value === settings.visual_theme)?.label || settings.visual_theme}. A escolha abaixo é salva na Shopify e passa a ser usada pelo bloco do Aruna Review.</s-banner>{PRESETS.map(preset => <s-section key={preset.value}><s-stack direction="inline" gap="small"><s-heading>{preset.label}</s-heading>{settings.visual_theme === preset.value ? <s-badge>Ativo</s-badge> : <s-button onClick={() => saveSettings({...settings,visual_theme:preset.value})}>Usar tema</s-button>}</s-stack></s-section>)}</s-stack></s-section>;
}

function QuestionsPage({products,questions,createQuestion,patchQuestion,deleteQuestion}) {
  const [productHandle,setProductHandle] = useState(products[0]?.handle || '');
  const [customerName,setCustomerName] = useState('');
  const [questionText,setQuestionText] = useState('');
  const [answers,setAnswers] = useState({});
  const product = products.find(item => item.handle === productHandle);
  return <s-stack direction="block" gap="base"><s-section heading="Nova pergunta"><s-stack direction="block" gap="small"><s-select label="Produto" value={productHandle} onChange={e => setProductHandle(e.currentTarget.value)}>{products.map(item => <s-option key={item.id} value={item.handle}>{item.title}</s-option>)}</s-select><s-text-field label="Cliente" value={customerName} onInput={e => setCustomerName(e.currentTarget.value)} /><s-text-area label="Pergunta" value={questionText} onInput={e => setQuestionText(e.currentTarget.value)} /><s-button variant="primary" onClick={() => {if (!product || !questionText.trim()) return;createQuestion({product_id:product.id,product_handle:product.handle,product_title:product.title,customer_name:customerName || 'Cliente',question:questionText,status:'pending',source:'manual'});setQuestionText('');}}>Criar pergunta</s-button></s-stack></s-section><s-section heading={`Perguntas · ${questions.length}`}><s-stack direction="block" gap="base">{!questions.length && <s-text>Nenhuma pergunta ainda.</s-text>}{questions.map(question => <s-section key={question.id}><s-stack direction="block" gap="small"><s-stack direction="inline" gap="small"><s-badge>{labelStatus(question.status)}</s-badge>{question.merchant_answer && <s-badge>Respondida</s-badge>}</s-stack><s-heading>{question.customer_name || 'Cliente'} · {question.product_title || 'Produto'}</s-heading><s-text>{question.question}</s-text>{question.merchant_answer && <s-text>Resposta atual: {question.merchant_answer}</s-text>}<s-text-area label="Resposta da loja" value={answers[question.id] ?? question.merchant_answer ?? ''} onInput={e => setAnswers(current => ({...current,[question.id]:e.currentTarget.value}))} /><s-stack direction="inline" gap="small"><s-button variant="primary" onClick={() => patchQuestion(question,{merchant_answer:answers[question.id] ?? question.merchant_answer ?? '',status:'approved'})}>Responder e publicar</s-button><s-button onClick={() => patchQuestion(question,{status:'hidden'})}>Ocultar</s-button><s-button onClick={() => patchQuestion(question,{status:'rejected'})}>Rejeitar</s-button><s-button onClick={() => deleteQuestion(question)}>Excluir</s-button></s-stack></s-stack></s-section>)}</s-stack></s-section></s-stack>;
}

function SettingsPage({settings,saveSettings}) {
  const [form,setForm] = useState(settings);
  useEffect(() => setForm(settings), [settings]);
  const set = (key,value) => setForm(current => ({...current,[key]:value}));
  return <s-section heading="Configurações globais"><s-stack direction="block" gap="base"><s-stack direction="inline" gap="small"><s-select label="Moderação padrão" value={form.moderation_mode} onChange={e => set('moderation_mode',e.currentTarget.value)}><s-option value="manual">Manual — novas ficam pendentes</s-option><s-option value="auto">Automática — novas entram aprovadas</s-option></s-select><YesNo label="Mostrar selo verificado" value={form.show_verified} onChange={value => set('show_verified',value)} /><YesNo label="Mostrar origem" value={form.show_source} onChange={value => set('show_source',value)} /><YesNo label="Mostrar votos úteis" value={form.show_helpful} onChange={value => set('show_helpful',value)} /><YesNo label="Mostrar perguntas e respostas" value={form.show_qa} onChange={value => set('show_qa',value)} /></s-stack><s-stack direction="inline" gap="small"><s-text-field label="Título das avaliações" value={form.heading} onInput={e => set('heading',e.currentTarget.value)} /><s-text-field label="Cor principal" value={form.accent_color} onInput={e => set('accent_color',e.currentTarget.value)} /><s-text-field label="Cor das estrelas" value={form.star_color} onInput={e => set('star_color',e.currentTarget.value)} /><s-select label="Tema visual" value={form.visual_theme} onChange={e => set('visual_theme',e.currentTarget.value)}>{PRESETS.map(item => <s-option key={item.value} value={item.value}>{item.label}</s-option>)}</s-select></s-stack><s-stack direction="inline" gap="small"><s-select label="Avaliações por página" value={String(form.reviews_per_page)} onChange={e => set('reviews_per_page',e.currentTarget.value)}>{[10,20,30,50].map(value => <s-option key={value} value={String(value)}>{value}</s-option>)}</s-select><s-select label="Dias para pedir avaliação" value={String(form.request_delay_days)} onChange={e => set('request_delay_days',e.currentTarget.value)}>{[1,3,5,7,10,14,21,30].map(value => <s-option key={value} value={String(value)}>{value} dias</s-option>)}</s-select></s-stack><s-text-field label="Assunto da solicitação" value={form.request_subject} onInput={e => set('request_subject',e.currentTarget.value)} /><s-text-area label="Mensagem da solicitação" value={form.request_message} onInput={e => set('request_message',e.currentTarget.value)} /><s-text>Variáveis disponíveis: {'{{produto}}'} e {'{{link}}'}.</s-text><s-button variant="primary" onClick={() => saveSettings(form)}>Salvar configurações</s-button></s-stack></s-section>;
}

function YesNo({label,value,onChange}) {
  return <s-select label={label} value={boolValue(value) ? 'true' : 'false'} onChange={e => onChange(e.currentTarget.value)}><s-option value="true">Sim</s-option><s-option value="false">Não</s-option></s-select>;
}

import '@shopify/ui-extensions/preact';
import {render} from 'preact';
import {useEffect, useMemo, useState} from 'preact/hooks';

const REVIEW_TYPE = '$app:review';
const PRESETS = [
  'Compatibilidade 01 — Clássico','Compatibilidade 02 — Moderno','Compatibilidade 03 — Marketplace',
  'Compatibilidade 04 — Galeria','Compatibilidade 05 — Cards','Compatibilidade 06 — Minimal',
  'Compatibilidade 07 — Centralizado','Compatibilidade 08 — Social','Compatibilidade 09 — Lista',
  'Compatibilidade 10 — Amplo','Compatibilidade 11 — Escuro','ARUNA — Premium','ARUNA — Compacto',
  'ARUNA — Fotos & Vídeos','ARUNA — Lux'
];

const LIST_REVIEWS = `
query ArunaReviews($type: String!) {
  metaobjects(type: $type, first: 100, sortKey: "updated_at", reverse: true) {
    nodes { id handle createdAt updatedAt fields { key value } }
  }
}`;

const LIST_PRODUCTS = `
query ArunaProducts {
  products(first: 50, sortKey: UPDATED_AT, reverse: true) {
    nodes { id title handle }
  }
}`;

const CREATE_REVIEW = `
mutation CreateArunaReview($metaobject: MetaobjectCreateInput!) {
  metaobjectCreate(metaobject: $metaobject) {
    metaobject { id }
    userErrors { field message code }
  }
}`;

const UPDATE_REVIEW = `
mutation UpdateArunaReview($id: ID!, $metaobject: MetaobjectUpdateInput!) {
  metaobjectUpdate(id: $id, metaobject: $metaobject) {
    metaobject { id }
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

function fieldsToObject(review) {
  return review.fields.reduce((acc, item) => {
    acc[item.key] = item.value;
    return acc;
  }, {id: review.id, handle: review.handle, createdAt: review.createdAt, updatedAt: review.updatedAt});
}

function field(key, value) {
  if (value === undefined || value === null) return null;
  return {key, value: String(value)};
}

function makeFields(data) {
  return [
    field('product_id', data.product_id), field('product_handle', data.product_handle), field('product_title', data.product_title),
    field('customer_name', data.customer_name || 'Cliente'), field('customer_email', data.customer_email || ''),
    field('rating', Math.max(1, Math.min(5, Number(data.rating) || 5))), field('title', data.title || ''),
    field('body', data.body || ''), field('status', data.status || 'pending'),
    field('verified', data.verified === true || data.verified === 'true' ? 'true' : 'false'),
    field('verification_status', data.verification_status || (data.verified ? 'verified' : 'unverified')),
    field('merchant_reply', data.merchant_reply || ''), field('featured', data.featured === true || data.featured === 'true' ? 'true' : 'false'),
    field('source', data.source || 'manual'), field('external_id', data.external_id || ''),
    field('review_date', data.review_date || new Date().toISOString()),
    field('media_urls', typeof data.media_urls === 'string' ? data.media_urls : JSON.stringify(data.media_urls || [])),
    field('helpful_count', Number(data.helpful_count) || 0), field('language', data.language || 'pt-BR'),
    field('order_id', data.order_id || ''), field('import_batch', data.import_batch || '')
  ].filter(Boolean);
}

function statusBadge(status) {
  const value = status || 'pending';
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
    } else if (ch === ',' && !quoted) { row.push(cell); cell = ''; }
    else if ((ch === '\n' || ch === '\r') && !quoted) {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some(v => v.trim() !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell); if (row.some(v => v.trim() !== '')) rows.push(row);
  if (rows.length < 2) return [];
  const headers = rows[0].map(h => h.trim());
  return rows.slice(1).map(values => Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ''])));
}

function parseImport(text) {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : (Array.isArray(parsed.reviews) ? parsed.reviews : [parsed]);
  }
  return parseCsv(trimmed);
}

export default function extension() {
  render(<App />, document.body);
}

function App() {
  const [page, setPage] = useState('dashboard');
  const [reviews, setReviews] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [replyDrafts, setReplyDrafts] = useState({});

  const reload = async () => {
    setLoading(true); setMessage('');
    try {
      const [reviewData, productData] = await Promise.all([
        gql(LIST_REVIEWS, {type: REVIEW_TYPE}), gql(LIST_PRODUCTS)
      ]);
      setReviews(reviewData.metaobjects.nodes.map(fieldsToObject));
      setProducts(productData.products.nodes);
    } catch (error) { setMessage(error.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { reload(); }, []);

  const stats = useMemo(() => {
    const approved = reviews.filter(r => r.status === 'approved');
    const pending = reviews.filter(r => !r.status || r.status === 'pending');
    const average = approved.length ? approved.reduce((sum, r) => sum + Number(r.rating || 0), 0) / approved.length : 0;
    return {total: reviews.length, approved: approved.length, pending: pending.length, average};
  }, [reviews]);

  const filtered = useMemo(() => reviews.filter(r => {
    if (filterStatus !== 'all' && (r.status || 'pending') !== filterStatus) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [r.customer_name, r.product_title, r.title, r.body, r.source].some(v => String(v || '').toLowerCase().includes(q));
  }), [reviews, filterStatus, search]);

  async function patchReview(review, patch) {
    setMessage('Salvando…');
    const status = patch.status;
    const input = {fields: Object.entries(patch).map(([key, value]) => field(key, value)).filter(Boolean)};
    if (status) input.capabilities = {publishable: {status: status === 'approved' ? 'ACTIVE' : 'DRAFT'}};
    try {
      const data = await gql(UPDATE_REVIEW, {id: review.id, metaobject: input});
      const errors = data.metaobjectUpdate.userErrors;
      if (errors?.length) throw new Error(errors[0].message);
      setMessage('Alteração salva.');
      await reload();
    } catch (error) { setMessage(error.message); }
  }

  return (
    <s-page heading="Aruna Review">
      <s-stack direction="block" gap="base">
        <s-section>
          <s-stack direction="inline" gap="small">
            <s-button variant={page === 'dashboard' ? 'primary' : 'secondary'} onClick={() => setPage('dashboard')}>Visão geral</s-button>
            <s-button variant={page === 'reviews' ? 'primary' : 'secondary'} onClick={() => setPage('reviews')}>Avaliações</s-button>
            <s-button variant={page === 'import' ? 'primary' : 'secondary'} onClick={() => setPage('import')}>Importar</s-button>
            <s-button variant={page === 'themes' ? 'primary' : 'secondary'} onClick={() => setPage('themes')}>Temas</s-button>
            <s-button variant={page === 'questions' ? 'primary' : 'secondary'} onClick={() => setPage('questions')}>Perguntas e respostas</s-button>
            <s-button variant={page === 'settings' ? 'primary' : 'secondary'} onClick={() => setPage('settings')}>Configurações</s-button>
          </s-stack>
        </s-section>

        {message && <s-banner>{message}</s-banner>}
        {loading ? <s-section><s-text>Carregando Aruna Review…</s-text></s-section> : null}
        {!loading && page === 'dashboard' && <Dashboard stats={stats} reviews={reviews} setPage={setPage} reload={reload} />}
        {!loading && page === 'reviews' && <ReviewsPage reviews={filtered} filterStatus={filterStatus} setFilterStatus={setFilterStatus} search={search} setSearch={setSearch} patchReview={patchReview} replyDrafts={replyDrafts} setReplyDrafts={setReplyDrafts} />}
        {!loading && page === 'import' && <ImportPage products={products} reload={reload} setMessage={setMessage} />}
        {!loading && page === 'themes' && <ThemesPage />}
        {!loading && page === 'questions' && <QuestionsPage />}
        {!loading && page === 'settings' && <SettingsPage />}
      </s-stack>
    </s-page>
  );
}

function Dashboard({stats, reviews, setPage, reload}) {
  const recent = reviews.slice(0, 5);
  return <>
    <s-section heading="Visão geral">
      <s-stack direction="inline" gap="base">
        <s-section heading="Total"><s-heading>{stats.total}</s-heading><s-text>Avaliações armazenadas</s-text></s-section>
        <s-section heading="Aprovadas"><s-heading>{stats.approved}</s-heading><s-text>Visíveis na loja</s-text></s-section>
        <s-section heading="Pendentes"><s-heading>{stats.pending}</s-heading><s-text>Aguardando moderação</s-text></s-section>
        <s-section heading="Nota média"><s-heading>{stats.average.toFixed(1)}</s-heading><s-text>★★★★★</s-text></s-section>
      </s-stack>
    </s-section>
    <s-section heading="Atalhos">
      <s-stack direction="inline" gap="small">
        <s-button variant="primary" onClick={() => setPage('reviews')}>Moderar avaliações</s-button>
        <s-button onClick={() => setPage('import')}>Importar avaliações</s-button>
        <s-button onClick={() => setPage('themes')}>Personalizar widget</s-button>
        <s-button onClick={reload}>Atualizar dados</s-button>
      </s-stack>
    </s-section>
    <s-section heading="Avaliações recentes">
      {recent.length === 0 ? <s-text>Nenhuma avaliação ainda.</s-text> : recent.map(r => <s-stack key={r.id} direction="block" gap="small">
        <s-stack direction="inline" gap="small"><s-badge>{statusBadge(r.status)}</s-badge><s-text>{'★'.repeat(Number(r.rating || 0))}{'☆'.repeat(5 - Number(r.rating || 0))}</s-text></s-stack>
        <s-heading>{r.customer_name || 'Cliente'} · {r.product_title || 'Produto'}</s-heading>
        <s-text>{r.body || r.title || 'Sem comentário'}</s-text>
        <s-divider />
      </s-stack>)}
    </s-section>
  </>;
}

function ReviewsPage({reviews, filterStatus, setFilterStatus, search, setSearch, patchReview, replyDrafts, setReplyDrafts}) {
  return <s-section heading="Gerenciar avaliações">
    <s-stack direction="block" gap="base">
      <s-stack direction="inline" gap="small">
        <s-text-field label="Buscar" value={search} onInput={e => setSearch(e.currentTarget.value)} placeholder="Cliente, produto, texto ou origem" />
        <s-select label="Status" value={filterStatus} onChange={e => setFilterStatus(e.currentTarget.value)}>
          <s-option value="all">Todas</s-option><s-option value="pending">Pendentes</s-option><s-option value="approved">Aprovadas</s-option><s-option value="rejected">Rejeitadas</s-option><s-option value="hidden">Ocultas</s-option>
        </s-select>
      </s-stack>
      {reviews.length === 0 ? <s-banner>Nenhuma avaliação encontrada.</s-banner> : reviews.map(review => <ReviewCard key={review.id} review={review} patchReview={patchReview} replyDrafts={replyDrafts} setReplyDrafts={setReplyDrafts} />)}
    </s-stack>
  </s-section>;
}

function ReviewCard({review, patchReview, replyDrafts, setReplyDrafts}) {
  const rating = Math.max(0, Math.min(5, Number(review.rating || 0)));
  const reply = replyDrafts[review.id] ?? review.merchant_reply ?? '';
  return <s-section>
    <s-stack direction="block" gap="small">
      <s-stack direction="inline" gap="small">
        <s-badge>{statusBadge(review.status)}</s-badge>
        {review.verified === 'true' && <s-badge>✓ Compra verificada</s-badge>}
        {review.featured === 'true' && <s-badge>Destaque</s-badge>}
        <s-text>{'★'.repeat(rating)}{'☆'.repeat(5 - rating)}</s-text>
      </s-stack>
      <s-heading>{review.customer_name || 'Cliente'} · {review.product_title || 'Produto'}</s-heading>
      {review.title && <s-text>{review.title}</s-text>}
      <s-text>{review.body || 'Sem comentário.'}</s-text>
      <s-text>Origem: {review.source || 'manual'} · {review.review_date ? new Date(review.review_date).toLocaleDateString('pt-BR') : ''}</s-text>
      <s-stack direction="inline" gap="small">
        <s-button variant="primary" onClick={() => patchReview(review, {status: 'approved'})}>Aprovar</s-button>
        <s-button onClick={() => patchReview(review, {status: 'hidden'})}>Ocultar</s-button>
        <s-button onClick={() => patchReview(review, {status: 'rejected'})}>Rejeitar</s-button>
        <s-button onClick={() => patchReview(review, {featured: review.featured === 'true' ? 'false' : 'true'})}>{review.featured === 'true' ? 'Remover destaque' : 'Destacar'}</s-button>
        <s-button onClick={() => patchReview(review, {verified: review.verified === 'true' ? 'false' : 'true', verification_status: review.verified === 'true' ? 'unverified' : 'verified'})}>{review.verified === 'true' ? 'Remover verificação' : 'Marcar verificada'}</s-button>
      </s-stack>
      <s-stack direction="inline" gap="small">
        <s-text-field label="Resposta da loja" value={reply} onInput={e => setReplyDrafts({...replyDrafts, [review.id]: e.currentTarget.value})} />
        <s-button onClick={() => patchReview(review, {merchant_reply: reply})}>Salvar resposta</s-button>
      </s-stack>
    </s-stack>
  </s-section>;
}

function ImportPage({products, reload, setMessage}) {
  const [text, setText] = useState('');
  const [productId, setProductId] = useState(products[0]?.id || '');
  const [running, setRunning] = useState(false);

  async function runImport() {
    let rows;
    try { rows = parseImport(text); } catch { setMessage('Arquivo/texto inválido. Use CSV ou JSON.'); return; }
    if (!rows.length) { setMessage('Nenhuma avaliação válida encontrada.'); return; }
    const selected = products.find(p => p.id === productId);
    setRunning(true); setMessage(`Importando ${rows.length} avaliações…`);
    let ok = 0, failed = 0;
    const batch = `aruna-${Date.now()}`;
    for (const raw of rows.slice(0, 250)) {
      const data = {
        product_id: raw.product_id || raw.shopify_product_id || productId,
        product_handle: raw.product_handle || selected?.handle || '',
        product_title: raw.product_title || selected?.title || '',
        customer_name: raw.customer_name || raw.author || raw.name || 'Cliente',
        customer_email: raw.customer_email || raw.email || '',
        rating: raw.rating || raw.stars || 5,
        title: raw.title || '', body: raw.body || raw.comment || raw.review || '',
        status: raw.status || 'pending', verified: raw.verified === true || raw.verified === 'true',
        merchant_reply: raw.merchant_reply || '', featured: false,
        source: raw.source || raw.origin || 'import', external_id: raw.external_id || raw.id || '',
        review_date: raw.review_date || raw.date || raw.created_at || new Date().toISOString(),
        media_urls: raw.media_urls || raw.images || [], helpful_count: raw.helpful_count || 0,
        language: raw.language || 'pt-BR', order_id: raw.order_id || '', import_batch: batch
      };
      try {
        const result = await gql(CREATE_REVIEW, {metaobject: {type: REVIEW_TYPE, fields: makeFields(data), capabilities: {publishable: {status: data.status === 'approved' ? 'ACTIVE' : 'DRAFT'}}}});
        if (result.metaobjectCreate.userErrors?.length) throw new Error(result.metaobjectCreate.userErrors[0].message);
        ok++;
      } catch { failed++; }
    }
    setRunning(false); setMessage(`Importação concluída: ${ok} adicionadas${failed ? `, ${failed} com erro` : ''}.`); await reload();
  }

  return <s-section heading="Importar avaliações">
    <s-stack direction="block" gap="base">
      <s-banner>Cole CSV ou JSON exportado de uma fonte que você tem autorização para usar. Avaliações importadas entram como pendentes por padrão e não recebem selo de compra verificada sem comprovação.</s-banner>
      <s-select label="Produto de destino padrão" value={productId} onChange={e => setProductId(e.currentTarget.value)}>
        {products.map(p => <s-option key={p.id} value={p.id}>{p.title}</s-option>)}
      </s-select>
      <s-text-area label="CSV ou JSON" value={text} onInput={e => setText(e.currentTarget.value)} rows="12" placeholder="customer_name,rating,body,source..." />
      <s-button variant="primary" disabled={running} onClick={runImport}>{running ? 'Importando…' : 'Importar avaliações'}</s-button>
    </s-stack>
  </s-section>;
}

function ThemesPage() {
  return <s-section heading="Temas do widget">
    <s-stack direction="block" gap="base">
      <s-text>Os estilos ficam separados para você escolher no bloco Aruna Reviews dentro do editor da loja.</s-text>
      {PRESETS.map(name => <s-stack key={name} direction="inline" gap="small"><s-badge>Disponível</s-badge><s-text>{name}</s-text></s-stack>)}
    </s-stack>
  </s-section>;
}

function QuestionsPage() {
  return <s-section heading="Perguntas e respostas">
    <s-stack direction="block" gap="small">
      <s-text>Área preparada para perguntas de clientes, respostas da loja, moderação e publicação por produto.</s-text>
      <s-banner>Nenhuma pergunta recebida ainda.</s-banner>
    </s-stack>
  </s-section>;
}

function SettingsPage() {
  return <s-section heading="Configurações">
    <s-stack direction="block" gap="small">
      <s-heading>Moderação</s-heading><s-text>Novas avaliações entram como pendentes até serem aprovadas.</s-text>
      <s-heading>Selo verificado</s-heading><s-text>O selo deve ser usado somente quando houver comprovação da compra.</s-text>
      <s-heading>Dados</s-heading><s-text>O painel usa dados próprios do Aruna Review dentro da Shopify e não pede outro login.</s-text>
      <s-heading>Loja</s-heading><s-text>O widget é entregue por Theme App Extension; nenhum arquivo do tema precisa ser editado diretamente.</s-text>
    </s-stack>
  </s-section>;
}

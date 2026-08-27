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

const LIST_REVIEWS = `query ArunaReviews($type: String!) {
  metaobjects(type: $type, first: 100, sortKey: "updated_at", reverse: true) {
    nodes { id handle createdAt updatedAt fields { key value } }
  }
}`;
const LIST_PRODUCTS = `query ArunaProducts {
  products(first: 50, sortKey: UPDATED_AT, reverse: true) { nodes { id title handle } }
}`;
const CREATE_REVIEW = `mutation CreateArunaReview($metaobject: MetaobjectCreateInput!) {
  metaobjectCreate(metaobject: $metaobject) { metaobject { id } userErrors { field message code } }
}`;
const UPDATE_REVIEW = `mutation UpdateArunaReview($id: ID!, $metaobject: MetaobjectUpdateInput!) {
  metaobjectUpdate(id: $id, metaobject: $metaobject) { metaobject { id } userErrors { field message code } }
}`;

async function gql(query, variables = {}) {
  const response = await fetch('shopify:admin/api/2026-07/graphql.json', {
    method: 'POST',
    body: JSON.stringify({query, variables}),
  });
  const json = await response.json();
  if (!response.ok || json.errors?.length) throw new Error(json.errors?.[0]?.message || 'Falha ao comunicar com a Shopify.');
  return json.data;
}

const f = (key, value) => value === undefined || value === null ? null : ({key, value: String(value)});
const mediaValue = value => {
  if (!value) return '[]';
  if (Array.isArray(value)) return JSON.stringify(value.filter(Boolean));
  const text = String(value).trim();
  if (!text) return '[]';
  if (text.startsWith('[')) {
    try { const parsed = JSON.parse(text); return JSON.stringify(Array.isArray(parsed) ? parsed.filter(Boolean) : []); } catch {}
  }
  return JSON.stringify(text.split(/[\n,]+/).map(v => v.trim()).filter(Boolean));
};

function makeFields(data) {
  return [
    f('product_id', data.product_id), f('product_handle', data.product_handle), f('product_title', data.product_title),
    f('customer_name', data.customer_name || 'Cliente'), f('customer_email', data.customer_email || ''),
    f('rating', Math.max(1, Math.min(5, Number(data.rating) || 5))), f('title', data.title || ''), f('body', data.body || ''),
    f('status', data.status || 'pending'), f('verified', data.verified ? 'true' : 'false'),
    f('verification_status', data.verified ? 'verified' : 'unverified'), f('merchant_reply', data.merchant_reply || ''),
    f('featured', data.featured ? 'true' : 'false'), f('source', data.source || 'manual'), f('external_id', data.external_id || ''),
    f('review_date', data.review_date || new Date().toISOString()), f('media_urls', mediaValue(data.media_urls)),
    f('helpful_count', Number(data.helpful_count) || 0), f('language', data.language || 'pt-BR'),
    f('order_id', data.order_id || ''), f('import_batch', data.import_batch || '')
  ].filter(Boolean);
}

function normalize(node) {
  const obj = {id: node.id, handle: node.handle, createdAt: node.createdAt, updatedAt: node.updatedAt};
  for (const item of node.fields) obj[item.key] = item.value;
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
  const rows=[]; let row=[], cell='', quoted=false;
  for (let i=0;i<text.length;i++) {
    const ch=text[i];
    if (ch==='"') { if (quoted && text[i+1]==='"') {cell+='"';i++;} else quoted=!quoted; }
    else if (ch===',' && !quoted) {row.push(cell);cell='';}
    else if ((ch==='\n'||ch==='\r') && !quoted) {if(ch==='\r'&&text[i+1]==='\n')i++;row.push(cell);cell='';if(row.some(v=>v.trim()))rows.push(row);row=[];}
    else cell+=ch;
  }
  row.push(cell); if(row.some(v=>v.trim()))rows.push(row);
  if(rows.length<2)return[];
  const headers=rows[0].map(v=>v.trim());
  return rows.slice(1).map(values=>Object.fromEntries(headers.map((h,i)=>[h,values[i]??''])));
}
function parseImport(text) {
  const source=text.trim(); if(!source)return[];
  if(source.startsWith('[')||source.startsWith('{')) {
    const parsed=JSON.parse(source);
    return Array.isArray(parsed)?parsed:Array.isArray(parsed.reviews)?parsed.reviews:[parsed];
  }
  return parseCsv(source);
}

export default function extension() { render(<App />, document.body); }

function App() {
  const [page,setPage]=useState('dashboard');
  const [reviews,setReviews]=useState([]);
  const [products,setProducts]=useState([]);
  const [loading,setLoading]=useState(true);
  const [notice,setNotice]=useState('');
  const [status,setStatus]=useState('all');
  const [search,setSearch]=useState('');
  const [reply,setReply]=useState({});

  async function reload() {
    setLoading(true);
    try {
      const [r,p]=await Promise.all([gql(LIST_REVIEWS,{type:REVIEW_TYPE}),gql(LIST_PRODUCTS)]);
      setReviews(r.metaobjects.nodes.map(normalize));
      setProducts(p.products.nodes);
    } catch(error) { setNotice(error.message); }
    finally { setLoading(false); }
  }
  useEffect(()=>{reload();},[]);

  const stats=useMemo(()=>{
    const approved=reviews.filter(r=>r.status==='approved');
    const pending=reviews.filter(r=>(r.status||'pending')==='pending');
    const rejected=reviews.filter(r=>r.status==='rejected').length;
    const average=approved.length?approved.reduce((s,r)=>s+Number(r.rating||0),0)/approved.length:0;
    return {total:reviews.length,approved:approved.length,pending:pending.length,rejected,average};
  },[reviews]);

  const visible=useMemo(()=>reviews.filter(r=>{
    if(status!=='all'&&(r.status||'pending')!==status)return false;
    const q=search.trim().toLowerCase();
    if(!q)return true;
    return [r.customer_name,r.product_title,r.title,r.body,r.source].some(v=>String(v||'').toLowerCase().includes(q));
  }),[reviews,status,search]);

  async function patchReview(review,patch) {
    setNotice('Salvando…');
    const input={fields:Object.entries(patch).map(([k,v])=>f(k,v)).filter(Boolean)};
    if(patch.status) input.capabilities={publishable:{status:patch.status==='approved'?'ACTIVE':'DRAFT'}};
    try {
      const data=await gql(UPDATE_REVIEW,{id:review.id,metaobject:input});
      const errors=data.metaobjectUpdate.userErrors||[];
      if(errors.length)throw new Error(errors[0].message);
      setNotice('Salvo.'); await reload();
    } catch(error){setNotice(error.message);}
  }

  return <s-page heading="Aruna Review">
    <s-stack direction="block" gap="base">
      <s-section>
        <s-stack direction="inline" gap="small">
          <Nav active={page==='dashboard'} onClick={()=>setPage('dashboard')}>Visão geral</Nav>
          <Nav active={page==='reviews'} onClick={()=>setPage('reviews')}>Avaliações</Nav>
          <Nav active={page==='import'} onClick={()=>setPage('import')}>Importar</Nav>
          <Nav active={page==='themes'} onClick={()=>setPage('themes')}>Temas</Nav>
          <Nav active={page==='questions'} onClick={()=>setPage('questions')}>Perguntas</Nav>
          <Nav active={page==='settings'} onClick={()=>setPage('settings')}>Configurações</Nav>
        </s-stack>
      </s-section>
      {notice && <s-banner>{notice}</s-banner>}
      {loading && <s-section><s-text>Carregando avaliações…</s-text></s-section>}
      {!loading&&page==='dashboard'&&<Dashboard stats={stats} reviews={reviews} go={setPage} reload={reload}/>} 
      {!loading&&page==='reviews'&&<Reviews reviews={visible} status={status} setStatus={setStatus} search={search} setSearch={setSearch} patch={patchReview} reply={reply} setReply={setReply}/>} 
      {!loading&&page==='import'&&<Importer products={products} reload={reload} notice={setNotice}/>} 
      {!loading&&page==='themes'&&<Themes/>}
      {!loading&&page==='questions'&&<Questions/>}
      {!loading&&page==='settings'&&<Settings/>}
    </s-stack>
  </s-page>;
}

function Nav({active,onClick,children}) { return <s-button variant={active?'primary':'secondary'} onClick={onClick}>{children}</s-button>; }

function Dashboard({stats,reviews,go,reload}) {
  return <>
    <s-section heading="Resumo da loja">
      <s-stack direction="inline" gap="base">
        <Metric title="Total" value={stats.total} text="Avaliações"/>
        <Metric title="Aprovadas" value={stats.approved} text="Publicadas"/>
        <Metric title="Pendentes" value={stats.pending} text="Para moderar"/>
        <Metric title="Nota média" value={stats.average.toFixed(1)} text={stars(Math.round(stats.average))}/>
      </s-stack>
    </s-section>
    <s-section heading="Ações rápidas">
      <s-stack direction="inline" gap="small">
        <s-button variant="primary" onClick={()=>go('reviews')}>Moderar avaliações</s-button>
        <s-button onClick={()=>go('import')}>Importar avaliações</s-button>
        <s-button onClick={()=>go('themes')}>Escolher tema</s-button>
        <s-button onClick={reload}>Atualizar</s-button>
      </s-stack>
    </s-section>
    <s-section heading="Mais recentes">
      {reviews.length===0?<s-text>Nenhuma avaliação cadastrada.</s-text>:reviews.slice(0,5).map(r=><s-stack key={r.id} direction="block" gap="small">
        <s-stack direction="inline" gap="small"><s-badge>{labelStatus(r.status)}</s-badge>{r.verified==='true'&&<s-badge>✓ Verificada</s-badge>}<s-text>{stars(r.rating)}</s-text></s-stack>
        <s-heading>{r.customer_name||'Cliente'} · {r.product_title||'Produto'}</s-heading>
        <s-text>{r.body||r.title||'Sem comentário.'}</s-text><s-divider/>
      </s-stack>)}
    </s-section>
  </>;
}
function Metric({title,value,text}) { return <s-section heading={title}><s-heading>{value}</s-heading><s-text>{text}</s-text></s-section>; }

function Reviews({reviews,status,setStatus,search,setSearch,patch,reply,setReply}) {
  return <s-section heading="Gerenciar avaliações">
    <s-stack direction="block" gap="base">
      <s-stack direction="inline" gap="small">
        <s-text-field label="Buscar" value={search} placeholder="Cliente, produto, texto ou origem" onInput={e=>setSearch(e.currentTarget.value)}/>
        <s-select label="Status" value={status} onChange={e=>setStatus(e.currentTarget.value)}>
          <s-option value="all">Todas</s-option><s-option value="pending">Pendentes</s-option><s-option value="approved">Aprovadas</s-option><s-option value="hidden">Ocultas</s-option><s-option value="rejected">Rejeitadas</s-option>
        </s-select>
      </s-stack>
      {reviews.length===0?<s-banner>Nenhuma avaliação encontrada.</s-banner>:reviews.map(r=><ReviewCard key={r.id} review={r} patch={patch} reply={reply} setReply={setReply}/>) }
    </s-stack>
  </s-section>;
}

function ReviewCard({review,patch,reply,setReply}) {
  const text=reply[review.id]??review.merchant_reply??'';
  return <s-section>
    <s-stack direction="block" gap="small">
      <s-stack direction="inline" gap="small">
        <s-badge>{labelStatus(review.status)}</s-badge>
        {review.verified==='true'&&<s-badge>✓ Compra verificada</s-badge>}
        {review.featured==='true'&&<s-badge>Destaque</s-badge>}
        <s-text>{stars(review.rating)}</s-text>
      </s-stack>
      <s-heading>{review.customer_name||'Cliente'} · {review.product_title||'Produto'}</s-heading>
      {review.title&&<s-text>{review.title}</s-text>}
      <s-text>{review.body||'Sem comentário.'}</s-text>
      <s-text>Origem: {review.source||'manual'}{review.review_date?` · ${new Date(review.review_date).toLocaleDateString('pt-BR')}`:''}</s-text>
      <s-stack direction="inline" gap="small">
        <s-button variant="primary" onClick={()=>patch(review,{status:'approved'})}>Aprovar</s-button>
        <s-button onClick={()=>patch(review,{status:'hidden'})}>Ocultar</s-button>
        <s-button onClick={()=>patch(review,{status:'rejected'})}>Rejeitar</s-button>
        <s-button onClick={()=>patch(review,{featured:review.featured==='true'?'false':'true'})}>{review.featured==='true'?'Remover destaque':'Destacar'}</s-button>
        <s-button onClick={()=>patch(review,{verified:review.verified==='true'?'false':'true',verification_status:review.verified==='true'?'unverified':'verified'})}>{review.verified==='true'?'Remover verificação':'Marcar verificada'}</s-button>
      </s-stack>
      <s-stack direction="inline" gap="small">
        <s-text-field label="Resposta da loja" value={text} onInput={e=>setReply({...reply,[review.id]:e.currentTarget.value})}/>
        <s-button onClick={()=>patch(review,{merchant_reply:text})}>Salvar resposta</s-button>
      </s-stack>
    </s-stack>
  </s-section>;
}

function Importer({products,reload,notice}) {
  const [text,setText]=useState('');
  const [productId,setProductId]=useState(products[0]?.id||'');
  const [running,setRunning]=useState(false);
  async function run() {
    let rows=[]; try{rows=parseImport(text);}catch{notice('Conteúdo inválido. Use CSV ou JSON.');return;}
    if(!rows.length){notice('Nenhuma avaliação encontrada.');return;}
    const product=products.find(p=>p.id===productId); const batch=`aruna-${Date.now()}`;
    let ok=0,failed=0;setRunning(true);notice(`Importando ${Math.min(rows.length,250)} avaliações…`);
    for(const raw of rows.slice(0,250)) {
      const data={
        product_id:raw.product_id||raw.shopify_product_id||productId,
        product_handle:raw.product_handle||product?.handle||'', product_title:raw.product_title||product?.title||'',
        customer_name:raw.customer_name||raw.author||raw.name||'Cliente', customer_email:raw.customer_email||raw.email||'',
        rating:raw.rating||raw.stars||5, title:raw.title||'', body:raw.body||raw.comment||raw.review||'',
        status:raw.status==='approved'?'approved':'pending', verified:false, merchant_reply:raw.merchant_reply||'', featured:false,
        source:raw.source||raw.origin||'import', external_id:raw.external_id||raw.id||'',
        review_date:raw.review_date||raw.date||raw.created_at||new Date().toISOString(), media_urls:raw.media_urls||raw.images||[],
        helpful_count:raw.helpful_count||0, language:raw.language||'pt-BR', order_id:raw.order_id||'', import_batch:batch
      };
      try{
        const result=await gql(CREATE_REVIEW,{metaobject:{type:REVIEW_TYPE,fields:makeFields(data),capabilities:{publishable:{status:data.status==='approved'?'ACTIVE':'DRAFT'}}}});
        if(result.metaobjectCreate.userErrors?.length)throw new Error(result.metaobjectCreate.userErrors[0].message);ok++;
      }catch{failed++;}
    }
    setRunning(false);notice(`Importação concluída: ${ok} adicionadas${failed?`, ${failed} com erro`:''}.`);await reload();
  }
  return <s-section heading="Importar avaliações">
    <s-stack direction="block" gap="base">
      <s-banner>Cole CSV ou JSON de uma fonte que você tem autorização para usar. Importações não recebem automaticamente selo de compra verificada.</s-banner>
      <s-select label="Produto padrão" value={productId} onChange={e=>setProductId(e.currentTarget.value)}>{products.map(p=><s-option key={p.id} value={p.id}>{p.title}</s-option>)}</s-select>
      <s-text-area label="CSV ou JSON" rows="12" value={text} placeholder="customer_name,rating,body,source..." onInput={e=>setText(e.currentTarget.value)}/>
      <s-button variant="primary" disabled={running} onClick={run}>{running?'Importando…':'Importar avaliações'}</s-button>
    </s-stack>
  </s-section>;
}

function Themes() { return <s-section heading="Temas do widget"><s-stack direction="block" gap="small"><s-text>Escolha o visual no bloco Aruna Reviews do editor da loja. Os presets são separados e não alteram os arquivos do tema.</s-text>{PRESETS.map(name=><s-stack key={name} direction="inline" gap="small"><s-badge>Disponível</s-badge><s-text>{name}</s-text></s-stack>)}</s-stack></s-section>; }
function Questions() { return <s-section heading="Perguntas e respostas"><s-stack direction="block" gap="small"><s-text>Área reservada para perguntas por produto, moderação e respostas da loja.</s-text><s-banner>Nenhuma pergunta recebida ainda.</s-banner></s-stack></s-section>; }
function Settings() { return <s-section heading="Configurações"><s-stack direction="block" gap="base"><s-heading>Moderação</s-heading><s-text>Importações entram como pendentes, salvo quando o arquivo traz status aprovado. Aprovação publica a avaliação no widget.</s-text><s-heading>Compra verificada</s-heading><s-text>O selo é controlado separadamente e não é aplicado automaticamente em avaliações externas.</s-text><s-heading>Acesso</s-heading><s-text>O Aruna Review usa a sessão da própria Shopify. Não existe segundo login dentro do aplicativo.</s-text><s-heading>Integração com a loja</s-heading><s-text>Os blocos entram por Theme App Extension, sem edição direta dos arquivos do tema.</s-text></s-stack></s-section>; }

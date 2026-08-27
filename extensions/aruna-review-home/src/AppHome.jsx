/** @jsxImportSource preact */
import '@shopify/ui-extensions/preact';
import {render} from 'preact';
import {useEffect, useMemo, useState} from 'preact/hooks';

const REVIEW_TYPE = '$app:review';
const QUESTION_TYPE = '$app:question';
const SETTINGS_TYPE = '$app:settings';
const REQUEST_TYPE = '$app:review_request';

const PRESETS = [
  ['compat-01','Clássico','Limpo, tradicional e fácil de ler'],
  ['compat-02','Moderno','Espaçamento amplo e visual contemporâneo'],
  ['compat-03','Marketplace','Resumo forte de nota e distribuição'],
  ['compat-04','Galeria','Fotos e vídeos em evidência'],
  ['compat-05','Cards','Avaliações separadas em cartões'],
  ['compat-06','Minimal','Poucos elementos e foco no texto'],
  ['compat-07','Centralizado','Nota e CTA centralizados'],
  ['compat-08','Social','Visual próximo de feed social'],
  ['compat-09','Lista','Alta densidade e leitura rápida'],
  ['compat-10','Amplo','Uso de toda a largura do produto'],
  ['compat-11','Escuro','Fundo escuro e contraste elevado'],
  ['aruna-premium','Aruna Premium','Visual premium equilibrado'],
  ['aruna-compact','Aruna Compacto','Ocupa menos espaço na página'],
  ['aruna-media','Aruna Mídia','Fotos e vídeos em primeiro plano'],
  ['aruna-lux','Aruna Lux','Apresentação refinada e elegante'],
];

const DEFAULT_SETTINGS = {
  moderation_mode:'manual',show_verified:'true',show_source:'true',show_helpful:'true',show_qa:'true',
  heading:'Avaliações de clientes',accent_color:'#0B4FA3',star_color:'#F5B301',visual_theme:'aruna-premium',
  reviews_per_page:'20',request_delay_days:'7',request_subject:'Como foi sua experiência?',
  request_message:'Oi! Queremos saber como foi sua experiência com {{produto}}. Avalie aqui: {{link}}',
};

const LIST_METAOBJECTS = `query ArunaMetaobjects($type: String!) {
  metaobjects(type: $type, first: 250, sortKey: "updated_at", reverse: true) {
    nodes { id handle createdAt updatedAt fields { key value } }
  }
}`;
const LIST_PRODUCTS = `query ArunaProducts {
  shop { primaryDomain { url } }
  products(first: 100, sortKey: UPDATED_AT, reverse: true) { nodes { id title handle } }
}`;
const CREATE_METAOBJECT = `mutation CreateArunaMetaobject($metaobject: MetaobjectCreateInput!) {
  metaobjectCreate(metaobject: $metaobject) { metaobject { id handle } userErrors { field message code } }
}`;
const UPDATE_METAOBJECT = `mutation UpdateArunaMetaobject($id: ID!, $metaobject: MetaobjectUpdateInput!) {
  metaobjectUpdate(id: $id, metaobject: $metaobject) { metaobject { id handle } userErrors { field message code } }
}`;
const DELETE_METAOBJECT = `mutation DeleteArunaMetaobject($id: ID!) {
  metaobjectDelete(id: $id) { deletedId userErrors { field message code } }
}`;
const UPSERT_METAOBJECT = `mutation UpsertArunaMetaobject($handle: MetaobjectHandleInput!, $metaobject: MetaobjectUpsertInput!) {
  metaobjectUpsert(handle: $handle, metaobject: $metaobject) { metaobject { id handle } userErrors { field message code } }
}`;

async function gql(query, variables={}) {
  const response = await fetch('shopify:admin/api/2026-07/graphql.json',{method:'POST',body:JSON.stringify({query,variables})});
  const json = await response.json();
  if (!response.ok || json.errors?.length) throw new Error(json.errors?.[0]?.message || 'Falha ao comunicar com a Shopify.');
  return json.data;
}
function firstError(payload){const errors=payload?.userErrors||[];if(errors.length)throw new Error(errors[0].message);return payload;}
const f=(key,value)=>value===undefined||value===null?null:{key,value:String(value)};
const bool=(value)=>value===true||value==='true';
function normalize(node){const obj={id:node.id,handle:node.handle,createdAt:node.createdAt,updatedAt:node.updatedAt};for(const item of node.fields||[])obj[item.key]=item.value;return obj;}
function stars(value){const n=Math.max(0,Math.min(5,Number(value)||0));return '★'.repeat(n)+'☆'.repeat(5-n);}
function statusLabel(value){return value==='approved'?'Aprovada':value==='hidden'?'Oculta':value==='rejected'?'Rejeitada':'Pendente';}
function reviewFields(data){return [f('product_id',data.product_id),f('product_handle',data.product_handle),f('product_title',data.product_title),f('customer_name',data.customer_name||'Cliente'),f('customer_email',data.customer_email||''),f('rating',Math.max(1,Math.min(5,Number(data.rating)||5))),f('title',data.title||''),f('body',data.body||''),f('status',data.status||'pending'),f('verified',bool(data.verified)?'true':'false'),f('verification_status',bool(data.verified)?'verified':'unverified'),f('merchant_reply',data.merchant_reply||''),f('featured',bool(data.featured)?'true':'false'),f('source',data.source||'manual'),f('external_id',data.external_id||''),f('review_date',data.review_date||new Date().toISOString()),f('media_urls',Array.isArray(data.media_urls)?JSON.stringify(data.media_urls):String(data.media_urls||'[]')),f('helpful_count',Number(data.helpful_count)||0),f('language',data.language||'pt-BR'),f('order_id',data.order_id||''),f('import_batch',data.import_batch||'')].filter(Boolean);}
function questionFields(data){return [f('product_id',data.product_id),f('product_handle',data.product_handle),f('product_title',data.product_title),f('customer_name',data.customer_name||'Cliente'),f('customer_email',data.customer_email||''),f('question',data.question||''),f('status',data.status||'pending'),f('merchant_answer',data.merchant_answer||''),f('submitted_at',data.submitted_at||new Date().toISOString()),f('source',data.source||'manual')].filter(Boolean);}
function settingsFields(data){return [f('name','Global'),f('moderation_mode',data.moderation_mode||'manual'),f('show_verified',bool(data.show_verified)?'true':'false'),f('show_source',bool(data.show_source)?'true':'false'),f('show_helpful',bool(data.show_helpful)?'true':'false'),f('show_qa',bool(data.show_qa)?'true':'false'),f('heading',data.heading||DEFAULT_SETTINGS.heading),f('accent_color',data.accent_color||DEFAULT_SETTINGS.accent_color),f('star_color',data.star_color||DEFAULT_SETTINGS.star_color),f('visual_theme',data.visual_theme||'aruna-premium'),f('reviews_per_page',Number(data.reviews_per_page)||20),f('request_delay_days',Number(data.request_delay_days)||7),f('request_subject',data.request_subject||DEFAULT_SETTINGS.request_subject),f('request_message',data.request_message||DEFAULT_SETTINGS.request_message)].filter(Boolean);}
function requestFields(data){return [f('product_id',data.product_id),f('product_handle',data.product_handle),f('product_title',data.product_title),f('recipient_name',data.recipient_name||'Cliente'),f('recipient_contact',data.recipient_contact||''),f('channel',data.channel||'whatsapp'),f('status',data.status||'draft'),f('review_link',data.review_link||''),f('created_at',new Date().toISOString()),f('sent_at',data.sent_at||'')].filter(Boolean);}
function parseImport(text){const source=text.trim();if(!source)return[];if(source.startsWith('[')||source.startsWith('{')){const parsed=JSON.parse(source);return Array.isArray(parsed)?parsed:Array.isArray(parsed.reviews)?parsed.reviews:[parsed];}const lines=source.split(/\r?\n/).filter(Boolean);if(lines.length<2)return[];const headers=lines[0].split(',').map(v=>v.trim());return lines.slice(1).map(line=>{const cols=line.split(',');return Object.fromEntries(headers.map((h,i)=>[h,(cols[i]||'').replace(/^"|"$/g,'')]));});}

export default function extension(){render(<App/>,document.body);}

function App(){
  const [page,setPage]=useState('reviews');
  const [reviews,setReviews]=useState([]);const [questions,setQuestions]=useState([]);const [requests,setRequests]=useState([]);const [products,setProducts]=useState([]);const [settings,setSettings]=useState(DEFAULT_SETTINGS);
  const [loading,setLoading]=useState(true);const [notice,setNotice]=useState('');
  async function reload(){setLoading(true);try{const [r,q,s,req,p]=await Promise.all([gql(LIST_METAOBJECTS,{type:REVIEW_TYPE}),gql(LIST_METAOBJECTS,{type:QUESTION_TYPE}),gql(LIST_METAOBJECTS,{type:SETTINGS_TYPE}),gql(LIST_METAOBJECTS,{type:REQUEST_TYPE}),gql(LIST_PRODUCTS)]);setReviews(r.metaobjects.nodes.map(normalize));setQuestions(q.metaobjects.nodes.map(normalize));setRequests(req.metaobjects.nodes.map(normalize));setProducts(p.products.nodes);setSettings(s.metaobjects.nodes[0]?{...DEFAULT_SETTINGS,...normalize(s.metaobjects.nodes[0])}:DEFAULT_SETTINGS);}catch(error){setNotice(error.message);}finally{setLoading(false);}}
  useEffect(()=>{reload();},[]);
  const stats=useMemo(()=>{const approved=reviews.filter(r=>r.status==='approved');const pending=reviews.filter(r=>(r.status||'pending')==='pending').length;const average=approved.length?approved.reduce((sum,r)=>sum+Number(r.rating||0),0)/approved.length:0;return{total:reviews.length,approved:approved.length,pending,average};},[reviews]);

  async function patchReview(review,patch){setNotice('Salvando…');try{const input={fields:Object.entries(patch).map(([k,v])=>f(k,v)).filter(Boolean)};if(patch.status)input.capabilities={publishable:{status:patch.status==='approved'?'ACTIVE':'DRAFT'}};firstError((await gql(UPDATE_METAOBJECT,{id:review.id,metaobject:input})).metaobjectUpdate);setNotice('Salvo.');await reload();}catch(error){setNotice(error.message);}}
  async function deleteReview(review){setNotice('Excluindo…');try{firstError((await gql(DELETE_METAOBJECT,{id:review.id})).metaobjectDelete);setNotice('Avaliação excluída.');await reload();}catch(error){setNotice(error.message);}}
  async function createReview(data,quiet=false){try{firstError((await gql(CREATE_METAOBJECT,{metaobject:{type:REVIEW_TYPE,fields:reviewFields(data),capabilities:{publishable:{status:data.status==='approved'?'ACTIVE':'DRAFT'}}}})).metaobjectCreate);if(!quiet){setNotice('Avaliação criada.');await reload();}}catch(error){if(!quiet)setNotice(error.message);throw error;}}
  async function saveSettings(next){setNotice('Salvando configurações…');try{firstError((await gql(UPSERT_METAOBJECT,{handle:{type:SETTINGS_TYPE,handle:'global'},metaobject:{fields:settingsFields(next),capabilities:{publishable:{status:'ACTIVE'}}}})).metaobjectUpsert);setNotice('Configurações salvas.');await reload();}catch(error){setNotice(error.message);}}
  async function patchQuestion(question,patch){setNotice('Salvando…');try{const input={fields:Object.entries(patch).map(([k,v])=>f(k,v)).filter(Boolean)};if(patch.status)input.capabilities={publishable:{status:patch.status==='approved'?'ACTIVE':'DRAFT'}};firstError((await gql(UPDATE_METAOBJECT,{id:question.id,metaobject:input})).metaobjectUpdate);setNotice('Pergunta atualizada.');await reload();}catch(error){setNotice(error.message);}}
  async function createRequest(data){setNotice('Criando solicitação…');try{firstError((await gql(CREATE_METAOBJECT,{metaobject:{type:REQUEST_TYPE,fields:requestFields(data)}})).metaobjectCreate);setNotice('Solicitação criada.');await reload();}catch(error){setNotice(error.message);}}

  return <s-page heading="Aruna Review">
    <s-stack direction="block" gap="base">
      <s-section>
        <s-stack direction="block" gap="small">
          <s-stack direction="inline" gap="small"><s-heading>Reputação da sua loja</s-heading><s-badge>{stats.average.toFixed(1)} ★</s-badge><s-badge>{stats.total} avaliações</s-badge><s-badge>{stats.pending} pendentes</s-badge></s-stack>
          <s-text>Gerencie avaliações, migre o que já está no BK e escolha exatamente como o widget aparece na loja.</s-text>
          <s-stack direction="inline" gap="small">
            <Nav current={page} value="reviews" setPage={setPage}>Avaliações</Nav>
            <Nav current={page} value="migration" setPage={setPage}>Migrar do BK</Nav>
            <Nav current={page} value="themes" setPage={setPage}>Temas</Nav>
            <Nav current={page} value="questions" setPage={setPage}>Perguntas</Nav>
            <Nav current={page} value="requests" setPage={setPage}>Solicitações</Nav>
            <Nav current={page} value="settings" setPage={setPage}>Configurações</Nav>
          </s-stack>
        </s-stack>
      </s-section>
      {notice&&<s-banner>{notice}</s-banner>}
      {loading?<s-section><s-text>Carregando Aruna Review…</s-text></s-section>:<>
        {page==='reviews'&&<ReviewsPage reviews={reviews} products={products} patchReview={patchReview} deleteReview={deleteReview} createReview={createReview}/>} 
        {page==='migration'&&<MigrationPage products={products} reviews={reviews} createReview={createReview} reload={reload} setNotice={setNotice}/>} 
        {page==='themes'&&<ThemesPage settings={settings} saveSettings={saveSettings}/>} 
        {page==='questions'&&<QuestionsPage questions={questions} patchQuestion={patchQuestion}/>} 
        {page==='requests'&&<RequestsPage products={products} requests={requests} createRequest={createRequest}/>} 
        {page==='settings'&&<SettingsPage settings={settings} saveSettings={saveSettings}/>} 
      </>}
    </s-stack>
  </s-page>;
}

function Nav({current,value,setPage,children}){return <s-button variant={current===value?'primary':'secondary'} onClick={()=>setPage(value)}>{children}</s-button>;}

function ReviewsPage({reviews,products,patchReview,deleteReview,createReview}){
  const [search,setSearch]=useState('');const [status,setStatus]=useState('all');const [showCreate,setShowCreate]=useState(false);const [reply,setReply]=useState({});
  const visible=useMemo(()=>reviews.filter(r=>{if(status!=='all'&&(r.status||'pending')!==status)return false;const q=search.trim().toLowerCase();if(!q)return true;return[r.customer_name,r.product_title,r.body,r.title,r.source].some(v=>String(v||'').toLowerCase().includes(q));}),[reviews,search,status]);
  return <s-stack direction="block" gap="base">
    <s-section heading="Avaliações">
      <s-stack direction="block" gap="small">
        <s-stack direction="inline" gap="small"><s-text-field label="Buscar" value={search} onInput={e=>setSearch(e.currentTarget.value)} placeholder="Cliente, produto ou comentário"/><s-select label="Status" value={status} onChange={e=>setStatus(e.currentTarget.value)}><s-option value="all">Todas</s-option><s-option value="pending">Pendentes</s-option><s-option value="approved">Aprovadas</s-option><s-option value="hidden">Ocultas</s-option><s-option value="rejected">Rejeitadas</s-option></s-select><s-button variant="primary" onClick={()=>setShowCreate(!showCreate)}>{showCreate?'Fechar':'Nova avaliação'}</s-button></s-stack>
        <s-text>{visible.length} resultado(s)</s-text>
      </s-stack>
    </s-section>
    {showCreate&&<ManualReview products={products} createReview={async data=>{await createReview(data);setShowCreate(false);}}/>}
    {visible.length===0&&<s-section><s-text>Nenhuma avaliação encontrada.</s-text></s-section>}
    {visible.map(review=><s-section key={review.id}>
      <s-stack direction="block" gap="small">
        <s-stack direction="inline" gap="small"><s-badge>{statusLabel(review.status)}</s-badge>{bool(review.verified)&&<s-badge>✓ Compra verificada</s-badge>}<s-text>{stars(review.rating)}</s-text><s-text>{review.source||'manual'}</s-text></s-stack>
        <s-heading>{review.customer_name||'Cliente'} · {review.product_title||'Produto'}</s-heading>
        {review.title&&<s-text>{review.title}</s-text>}<s-text>{review.body||'Sem comentário.'}</s-text>
        <s-stack direction="inline" gap="small"><s-button variant="primary" onClick={()=>patchReview(review,{status:'approved'})}>Aprovar</s-button><s-button onClick={()=>patchReview(review,{status:'hidden'})}>Ocultar</s-button><s-button onClick={()=>patchReview(review,{status:'rejected'})}>Rejeitar</s-button><s-button onClick={()=>patchReview(review,{verified:bool(review.verified)?'false':'true',verification_status:bool(review.verified)?'unverified':'verified'})}>{bool(review.verified)?'Remover verificação':'Compra verificada'}</s-button><s-button onClick={()=>deleteReview(review)}>Excluir</s-button></s-stack>
        <s-stack direction="inline" gap="small"><s-text-field label="Resposta pública" value={reply[review.id]??review.merchant_reply??''} onInput={e=>setReply(current=>({...current,[review.id]:e.currentTarget.value}))} placeholder="Responder cliente"/><s-button onClick={()=>patchReview(review,{merchant_reply:reply[review.id]??review.merchant_reply??''})}>Salvar resposta</s-button></s-stack>
      </s-stack>
    </s-section>)}
  </s-stack>;
}

function ManualReview({products,createReview}){
  const [handle,setHandle]=useState(products[0]?.handle||'');const [form,setForm]=useState({customer_name:'',rating:'5',body:'',title:'',status:'approved'});const product=products.find(p=>p.handle===handle);const set=(k,v)=>setForm(c=>({...c,[k]:v}));
  return <s-section heading="Nova avaliação"><s-stack direction="block" gap="small"><s-select label="Produto" value={handle} onChange={e=>setHandle(e.currentTarget.value)}>{products.map(p=><s-option key={p.id} value={p.handle}>{p.title}</s-option>)}</s-select><s-stack direction="inline" gap="small"><s-text-field label="Cliente" value={form.customer_name} onInput={e=>set('customer_name',e.currentTarget.value)}/><s-select label="Nota" value={form.rating} onChange={e=>set('rating',e.currentTarget.value)}>{[5,4,3,2,1].map(n=><s-option key={n} value={String(n)}>{n} estrelas</s-option>)}</s-select></s-stack><s-text-field label="Título" value={form.title} onInput={e=>set('title',e.currentTarget.value)}/><s-text-area label="Comentário" value={form.body} onInput={e=>set('body',e.currentTarget.value)}/><s-button variant="primary" onClick={()=>product&&createReview({...form,product_id:product.id,product_handle:product.handle,product_title:product.title,source:'manual'})}>Salvar avaliação</s-button></s-stack></s-section>;
}

function MigrationPage({products,reviews,createReview,reload,setNotice}){
  const [running,setRunning]=useState(false);const [progress,setProgress]=useState(null);const [last,setLast]=useState(null);const [importText,setImportText]=useState('');const [productHandle,setProductHandle]=useState(products[0]?.handle||'');
  useEffect(()=>{globalThis.arunaReviewNative?.lastBkMigration?.().then(setLast).catch(()=>{});},[]);
  async function migrateBk(){const bridge=globalThis.arunaReviewNative;if(!bridge){setNotice('A migração do BK ainda não conectou ao bridge. Reabra o app e tente novamente.');return;}setRunning(true);setProgress({current:0,total:products.length,found:0,imported:0,skipped:0});try{const result=await bridge.migrateBkAll(next=>setProgress(next));setLast(result);setNotice(`${result.imported} avaliação(ões) do BK migradas para o Aruna Review.`);await reload();}catch(error){setNotice(`Migração BK: ${error.message}`);}finally{setRunning(false);}}
  async function importManual(){const product=products.find(p=>p.handle===productHandle);if(!product)return;let rows;try{rows=parseImport(importText);}catch{setNotice('Arquivo/texto de importação inválido.');return;}if(!rows.length){setNotice('Nenhuma avaliação encontrada nesse conteúdo.');return;}setRunning(true);let imported=0;try{for(const row of rows.slice(0,250)){const rating=Number(row.rating||row.stars||5);await createReview({product_id:product.id,product_handle:product.handle,product_title:product.title,customer_name:row.customer_name||row.author||row.name||'Cliente',rating:Math.max(1,Math.min(5,rating||5)),title:row.title||'',body:row.body||row.comment||row.content||row.review||'',status:'approved',source:row.source||row.origin||'importado',external_id:row.external_id||row.id||'',review_date:row.review_date||row.created_at||new Date().toISOString(),media_urls:row.media_urls||row.images||[]},true);imported++;}setNotice(`${imported} avaliação(ões) importadas.`);setImportText('');await reload();}catch(error){setNotice(error.message);}finally{setRunning(false);}}
  return <s-stack direction="block" gap="base">
    <s-section heading="Migrar avaliações do BK Reviews">
      <s-stack direction="block" gap="small">
        <s-heading>Traga para o Aruna o que já está no BK</s-heading>
        <s-text>O Aruna percorre seus produtos, busca somente as avaliações públicas que o BK já exibe, ignora duplicadas e grava cada uma no produto correto.</s-text>
        <s-stack direction="inline" gap="small"><s-badge>{products.length} produtos no catálogo</s-badge><s-badge>{reviews.length} avaliações já no Aruna</s-badge>{last?.imported!==undefined&&<s-badge>Última migração: {last.imported}</s-badge>}</s-stack>
        <s-button variant="primary" disabled={running} onClick={migrateBk}>{running?'Migrando do BK…':'Migrar tudo do BK agora'}</s-button>
        {progress&&<s-stack direction="block" gap="small"><s-text>Produto {progress.current||0} de {progress.total||0}</s-text><s-text>Encontradas: {progress.found||0} · Importadas: {progress.imported||0} · Duplicadas/ignoradas: {progress.skipped||0}</s-text></s-stack>}
        {last?.finishedAt&&<s-text>Última execução: {new Date(last.finishedAt).toLocaleString('pt-BR')} · {last.productsWithReviews||0} produto(s) tinham avaliações BK.</s-text>}
      </s-stack>
    </s-section>
    <s-section heading="Importar CSV / JSON">
      <s-stack direction="block" gap="small"><s-select label="Produto de destino" value={productHandle} onChange={e=>setProductHandle(e.currentTarget.value)}>{products.map(p=><s-option key={p.id} value={p.handle}>{p.title}</s-option>)}</s-select><s-text-area label="Cole o CSV ou JSON" value={importText} onInput={e=>setImportText(e.currentTarget.value)} placeholder="customer_name,rating,body..."/><s-button disabled={running} onClick={importManual}>Importar conteúdo</s-button></s-stack>
    </s-section>
  </s-stack>;
}

function ThemesPage({settings,saveSettings}){
  const [selected,setSelected]=useState(settings.visual_theme||'aruna-premium');
  return <s-stack direction="block" gap="base"><s-section heading="Temas do widget"><s-stack direction="block" gap="small"><s-heading>Escolha vendo o modelo</s-heading><s-text>Cada tema abaixo mostra a organização básica que o cliente verá na página de produto.</s-text></s-stack></s-section>{PRESETS.map(([value,label,detail])=><s-section key={value} heading={label}><s-stack direction="block" gap="small"><s-stack direction="inline" gap="small"><s-badge>{selected===value?'Selecionado':'Prévia'}</s-badge><s-text>★★★★★ 4,9 · 328 avaliações</s-text></s-stack><s-heading>Avaliações de clientes</s-heading><s-text>{detail}</s-text><s-text>★★★★★ Maria S. · Compra verificada</s-text><s-text>Produto excelente, chegou certinho e ficou ótimo no carro.</s-text><s-button variant={selected===value?'primary':'secondary'} onClick={async()=>{setSelected(value);await saveSettings({...settings,visual_theme:value});}}>{selected===value?'Tema ativo':'Usar este tema'}</s-button></s-stack></s-section>)}</s-stack>;
}

function QuestionsPage({questions,patchQuestion}){
  const [answer,setAnswer]=useState({});
  return <s-stack direction="block" gap="base"><s-section heading="Perguntas e respostas"><s-text>{questions.length} pergunta(s)</s-text></s-section>{questions.length===0&&<s-section><s-text>Nenhuma pergunta recebida.</s-text></s-section>}{questions.map(q=><s-section key={q.id}><s-stack direction="block" gap="small"><s-stack direction="inline" gap="small"><s-badge>{statusLabel(q.status)}</s-badge><s-text>{q.product_title||'Produto'}</s-text></s-stack><s-heading>{q.customer_name||'Cliente'}</s-heading><s-text>{q.question}</s-text><s-text-area label="Resposta da loja" value={answer[q.id]??q.merchant_answer??''} onInput={e=>setAnswer(c=>({...c,[q.id]:e.currentTarget.value}))}/><s-stack direction="inline" gap="small"><s-button variant="primary" onClick={()=>patchQuestion(q,{merchant_answer:answer[q.id]??q.merchant_answer??'',status:'approved'})}>Responder e publicar</s-button><s-button onClick={()=>patchQuestion(q,{status:'hidden'})}>Ocultar</s-button></s-stack></s-stack></s-section>)}</s-stack>;
}

function RequestsPage({products,requests,createRequest}){
  const [handle,setHandle]=useState(products[0]?.handle||'');const [name,setName]=useState('');const [contact,setContact]=useState('');const product=products.find(p=>p.handle===handle);
  return <s-stack direction="block" gap="base"><s-section heading="Solicitar avaliação"><s-stack direction="block" gap="small"><s-select label="Produto" value={handle} onChange={e=>setHandle(e.currentTarget.value)}>{products.map(p=><s-option key={p.id} value={p.handle}>{p.title}</s-option>)}</s-select><s-stack direction="inline" gap="small"><s-text-field label="Cliente" value={name} onInput={e=>setName(e.currentTarget.value)}/><s-text-field label="WhatsApp ou e-mail" value={contact} onInput={e=>setContact(e.currentTarget.value)}/></s-stack><s-button variant="primary" onClick={()=>product&&createRequest({product_id:product.id,product_handle:product.handle,product_title:product.title,recipient_name:name,recipient_contact:contact,channel:contact.includes('@')?'email':'whatsapp',status:'draft'})}>Criar solicitação</s-button></s-stack></s-section><s-section heading={`Solicitações · ${requests.length}`}><s-stack direction="block" gap="small">{requests.length?requests.slice(0,50).map(r=><s-text key={r.id}>{r.recipient_name||'Cliente'} · {r.product_title||'Produto'} · {r.status||'draft'}</s-text>):<s-text>Nenhuma solicitação criada.</s-text>}</s-stack></s-section></s-stack>;
}

function SettingsPage({settings,saveSettings}){
  const [form,setForm]=useState(settings);const set=(k,v)=>setForm(c=>({...c,[k]:v}));
  return <s-section heading="Configurações"><s-stack direction="block" gap="base"><s-stack direction="inline" gap="small"><s-text-field label="Título do widget" value={form.heading} onInput={e=>set('heading',e.currentTarget.value)}/><s-select label="Moderação" value={form.moderation_mode} onChange={e=>set('moderation_mode',e.currentTarget.value)}><s-option value="manual">Manual</s-option><s-option value="auto">Automática</s-option></s-select><s-text-field label="Avaliações por página" value={form.reviews_per_page} onInput={e=>set('reviews_per_page',e.currentTarget.value)}/></s-stack><s-stack direction="inline" gap="small"><s-checkbox checked={bool(form.show_verified)} onChange={e=>set('show_verified',e.currentTarget.checked)}>Mostrar compra verificada</s-checkbox><s-checkbox checked={bool(form.show_source)} onChange={e=>set('show_source',e.currentTarget.checked)}>Mostrar origem</s-checkbox><s-checkbox checked={bool(form.show_helpful)} onChange={e=>set('show_helpful',e.currentTarget.checked)}>Mostrar útil</s-checkbox><s-checkbox checked={bool(form.show_qa)} onChange={e=>set('show_qa',e.currentTarget.checked)}>Mostrar perguntas</s-checkbox></s-stack><s-stack direction="inline" gap="small"><s-text-field label="Cor principal" value={form.accent_color} onInput={e=>set('accent_color',e.currentTarget.value)}/><s-text-field label="Cor das estrelas" value={form.star_color} onInput={e=>set('star_color',e.currentTarget.value)}/></s-stack><s-button variant="primary" onClick={()=>saveSettings(form)}>Salvar configurações</s-button></s-stack></s-section>;
}

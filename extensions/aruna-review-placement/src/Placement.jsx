/** @jsxImportSource preact */
import '@shopify/ui-extensions/preact';
import {render} from 'preact';
import {useEffect,useState} from 'preact/hooks';

const OPTIONS = [
  ['','Usar tema global'],
  ['compat-01','Compatibilidade 01 — Clássico'],['compat-02','Compatibilidade 02 — Moderno'],['compat-03','Compatibilidade 03 — Marketplace'],
  ['compat-04','Compatibilidade 04 — Galeria'],['compat-05','Compatibilidade 05 — Cards'],['compat-06','Compatibilidade 06 — Minimal'],
  ['compat-07','Compatibilidade 07 — Centralizado'],['compat-08','Compatibilidade 08 — Social'],['compat-09','Compatibilidade 09 — Lista'],
  ['compat-10','Compatibilidade 10 — Amplo'],['compat-11','Compatibilidade 11 — Escuro'],['aruna-premium','ARUNA — Premium'],
  ['aruna-compact','ARUNA — Compacto'],['aruna-media','ARUNA — Fotos & Vídeos'],['aruna-lux','ARUNA — Lux'],
];

const GET = `query ArunaThemeResource($id: ID!) {
  node(id: $id) {
    id
    ... on Product { title metafield(namespace: "$app", key: "review_theme") { value } }
    ... on Collection { title metafield(namespace: "$app", key: "review_theme") { value } }
  }
}`;
const SET = `mutation ArunaSetTheme($metafields: [MetafieldsSetInput!]!) {
  metafieldsSet(metafields: $metafields) { metafields { id value } userErrors { field message code } }
}`;

export default function extension(){render(<Placement/>,document.body);}

function Placement(){
  const resourceId = shopify.data?.selected?.[0]?.id || '';
  const [value,setValue]=useState('');
  const [title,setTitle]=useState('');
  const [status,setStatus]=useState('');
  const [loading,setLoading]=useState(true);

  useEffect(()=>{(async()=>{
    if(!resourceId){setStatus('Nenhum recurso selecionado.');setLoading(false);return;}
    try{
      const result=await shopify.query(GET,{variables:{id:resourceId}});
      setTitle(result?.data?.node?.title || 'Recurso');
      setValue(result?.data?.node?.metafield?.value || '');
    }catch{setStatus('Não foi possível carregar o tema atual.');}
    finally{setLoading(false);}
  })();},[resourceId]);

  async function save(){
    setStatus('Salvando…');
    try{
      const result=await shopify.query(SET,{variables:{metafields:[{ownerId:resourceId,namespace:'$app',key:'review_theme',type:'single_line_text_field',value}]}});
      const errors=result?.data?.metafieldsSet?.userErrors || result?.errors || [];
      if(errors.length) throw new Error(errors[0]?.message || 'Falha ao salvar');
      setStatus(value ? 'Tema específico salvo.' : 'Tema global restaurado.');
      try{shopify.toast.show('Tema do Aruna Review salvo');}catch{}
    }catch(error){setStatus(error?.message || 'Não foi possível salvar.');}
  }

  if(loading) return <s-admin-block heading="Aruna Review"><s-text>Carregando…</s-text></s-admin-block>;
  return <s-admin-block heading="Aruna Review">
    <s-stack direction="block" gap="small">
      <s-text>{title}</s-text>
      <s-select label="Tema das avaliações neste recurso" value={value} onChange={event=>setValue(event.currentTarget.value)}>
        {OPTIONS.map(([v,label])=><s-option key={v || 'global'} value={v}>{label}</s-option>)}
      </s-select>
      <s-button variant="primary" onClick={save}>Salvar tema</s-button>
      {status && <s-text>{status}</s-text>}
    </s-stack>
  </s-admin-block>;
}

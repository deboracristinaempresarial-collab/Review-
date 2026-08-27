(() => {
  if (globalThis.__ARUNA_REVIEW_IMPORTER_CONTENT_V12__) return;
  globalThis.__ARUNA_REVIEW_IMPORTER_CONTENT_V12__ = true;

  const hostname = location.hostname.toLowerCase();
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function platform() {
    if (hostname.includes('shopee')) return {slug:'shopee', name:'Shopee'};
    if (hostname.includes('aliexpress')) return {slug:'aliexpress', name:'AliExpress'};
    if (hostname.includes('amazon.')) return {slug:'amazon', name:'Amazon'};
    if (hostname.includes('mercadolivre')) return {slug:'mercado_livre', name:'Mercado Livre'};
    if (hostname.includes('shein')) return {slug:'shein', name:'Shein'};
    if (hostname.includes('temu')) return {slug:'temu', name:'Temu'};
    if (hostname.includes('ebay')) return {slug:'ebay', name:'eBay'};
    if (hostname.includes('alibaba')) return {slug:'alibaba', name:'Alibaba'};
    return {slug:'pagina_publica', name:'Página pública'};
  }

  const APP_DETECTORS = [
    {slug:'bk_reviews',name:'BK Reviews',roots:['[id*="bk-review" i]','[class*="bk-review" i]','[data-app*="bk" i]'],tokens:['bkreviews.com.br','bk-reviews','bkreviews']},
    {slug:'judge_me',name:'Judge.me',roots:['#judgeme_product_reviews','.jdgm-widget','.jdgm-review-widget','.jdgm-rev'],tokens:['judge.me','judgeme','jdgm']},
    {slug:'loox',name:'Loox',roots:['#looxReviews','.loox-reviews-default','.loox-rating','[data-loox-aggregate]'],tokens:['loox.io','looxreviews','loox-review']},
    {slug:'trustoo',name:'Trustoo',roots:['[id*="trustoo" i]','[class*="trustoo" i]','[data-app*="trustoo" i]'],tokens:['trustoo','trustoo.io']},
    {slug:'ryviu',name:'Ryviu',roots:['.ryviu-widget','[id*="ryviu" i]','[class*="ryviu" i]'],tokens:['ryviu.com','ryviu']},
    {slug:'ali_reviews',name:'Ali Reviews',roots:['[id*="alireview" i]','[class*="alireview" i]','[class*="ali-review" i]','[class*="lai-review" i]'],tokens:['alireviews','reviews.smartifyapps.com','lai-reviews']},
    {slug:'a_reviews',name:'AReviews',roots:['[id*="areviews" i]','[class*="areviews" i]'],tokens:['areviews','a-reviews']},
    {slug:'automizely',name:'Automizely / AfterShip Reviews',roots:['[id*="automizely" i]','[class*="automizely" i]','[class*="aftership" i]'],tokens:['automizely.com','aftership.com/reviews','aftership-reviews']},
    {slug:'zegsu',name:'Zegsu Reviews',roots:['[id*="zegsu" i]','[class*="zegsu" i]'],tokens:['zegsu']},
    {slug:'yotpo',name:'Yotpo',roots:['.yotpo','.yotpo-main-widget','[data-yotpo-element-id]'],tokens:['yotpo.com','yotpo']},
    {slug:'stamped',name:'Stamped',roots:['[id*="stamped" i]','[class*="stamped" i]'],tokens:['stamped.io','stamped-main-widget']},
    {slug:'opinew',name:'Opinew',roots:['[id*="opinew" i]','[class*="opinew" i]'],tokens:['opinew.com','opinew']},
    {slug:'vitals_reviews',name:'Vitals Reviews',roots:['[class*="vitals" i][class*="review" i]','[id*="vitals" i]'],tokens:['vitals.app','vitals-reviews']},
  ];

  function resourceText() {
    const urls = [];
    for (const el of document.querySelectorAll('script[src],iframe[src],link[href]')) {
      const value = el.getAttribute('src') || el.getAttribute('href') || '';
      if (value) urls.push(value.toLowerCase());
    }
    return urls.join(' ');
  }

  function detectReviewApp() {
    const resources = resourceText();
    for (const app of APP_DETECTORS) {
      for (const selector of app.roots) {
        try {
          if (document.querySelector(selector)) return {...app,confidence:'high',reason:'widget'};
        } catch {}
      }
      if (app.tokens.some((token) => resources.includes(token))) return {...app,confidence:'medium',reason:'resource'};
    }
    return {slug:'unknown',name:'App não identificado',roots:[],tokens:[],confidence:'low',reason:'none'};
  }

  function text(node) {
    return (node?.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function absoluteUrl(value) {
    if (!value) return '';
    try { return new URL(value, location.href).href; } catch { return ''; }
  }

  function ratingFromText(value) {
    const raw = String(value || '').replace(',', '.');
    const explicit = raw.match(/(?:^|\s)([1-5](?:\.\d+)?)\s*(?:de|\/|out of)?\s*5?/i) || raw.match(/([1-5](?:\.\d+)?)\s*(?:estrela|star)/i);
    const match = explicit || raw.match(/([1-5](?:\.\d+)?)/);
    if (!match) return null;
    const n = Number(match[1]);
    return Number.isFinite(n) ? Math.max(1, Math.min(5, Math.round(n))) : null;
  }

  function mediaFromCard(card) {
    const urls = [];
    const push = (value) => {
      const url = absoluteUrl(value);
      if (!url || !/^https:\/\//i.test(url)) return;
      if (/avatar|profile|sprite|logo|icon/i.test(url)) return;
      if (!urls.includes(url)) urls.push(url);
    };
    for (const img of card.querySelectorAll('img')) {
      const width = Number(img.getAttribute('width') || img.clientWidth || 0);
      const height = Number(img.getAttribute('height') || img.clientHeight || 0);
      if ((width && width < 28) || (height && height < 28)) continue;
      push(img.currentSrc || img.src || img.getAttribute('data-src') || img.getAttribute('data-original'));
    }
    for (const video of card.querySelectorAll('video,video source')) push(video.currentSrc || video.src || video.getAttribute('src'));
    for (const link of card.querySelectorAll('a[href]')) {
      const href = link.href || '';
      if (/\.(?:jpe?g|png|webp|gif|mp4|webm)(?:\?|$)/i.test(href)) push(href);
    }
    return urls.slice(0, 8);
  }

  function unique(rows) {
    const seen = new Set();
    return rows.filter((row) => {
      if (!row.body && !row.title) return false;
      const key = `${row.external_id || ''}|${row.customer_name || ''}|${row.rating}|${row.body || row.title}`.replace(/\s+/g,' ').slice(0,1800).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 250);
  }

  function collectJsonReviews(value, rows) {
    if (!value) return;
    if (Array.isArray(value)) { for (const item of value) collectJsonReviews(item, rows); return; }
    if (typeof value !== 'object') return;
    const type = String(value['@type'] || '').toLowerCase();
    if (type === 'review' || value.reviewBody || (value.reviewRating && (value.author || value.name))) {
      const rating = Number(value?.reviewRating?.ratingValue || value?.ratingValue || value?.rating || 0);
      const author = typeof value?.author === 'string' ? value.author : value?.author?.name;
      const media = [];
      for (const item of Array.isArray(value?.image) ? value.image : value?.image ? [value.image] : []) media.push(typeof item === 'string' ? item : item?.url || item?.contentUrl || '');
      for (const item of Array.isArray(value?.video) ? value.video : value?.video ? [value.video] : []) media.push(typeof item === 'string' ? item : item?.contentUrl || item?.url || '');
      rows.push({
        customer_name: author || value?.customer_name || 'Cliente',
        rating: Math.max(1,Math.min(5,Math.round(rating || 5))),
        title: String(value?.name || value?.headline || '').trim(),
        body: String(value?.reviewBody || value?.description || value?.comment || '').trim(),
        external_id: String(value?.['@id'] || value?.id || value?.reviewId || ''),
        created_at: value?.datePublished || value?.dateCreated || value?.created_at || '',
        media_urls: media.map(absoluteUrl).filter(Boolean).slice(0,8),
      });
    }
    if (Array.isArray(value['@graph'])) collectJsonReviews(value['@graph'], rows);
    if (value.review) collectJsonReviews(value.review, rows);
    if (value.reviews) collectJsonReviews(value.reviews, rows);
    if (value.data?.reviews) collectJsonReviews(value.data.reviews, rows);
    if (value.results) collectJsonReviews(value.results, rows);
  }

  function fromJsonLd() {
    const rows = [];
    for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
      try { collectJsonReviews(JSON.parse(script.textContent || 'null'), rows); } catch {}
    }
    return rows;
  }

  function appSelectorSets(app) {
    const sets = {
      judge_me:[{card:'.jdgm-rev',author:'.jdgm-rev__author',body:'.jdgm-rev__body',title:'.jdgm-rev__title',rating:'.jdgm-rev__rating,[data-score]',date:'.jdgm-rev__timestamp'}],
      loox:[{card:'.grid-item-wrap,.loox-review,.review-item',author:'.title,.reviewer-name,[class*="author"]',body:'.main-text,.review-content,[class*="content"]',title:'.review-title',rating:'.stars[aria-label],.loox-rating,[aria-label*="star" i]',date:'time,.date'}],
      trustoo:[{card:'[class*="trustoo"][class*="review"], [data-review-id]',author:'[class*="author"],[class*="name"]',body:'[class*="content"],[class*="comment"]',title:'[class*="title"]',rating:'[aria-label*="star" i],[class*="star"]',date:'time,[class*="date"]'}],
      ryviu:[{card:'.r--review-item,[class*="ryviu"][class*="review"]',author:'.r--author,[class*="author"]',body:'.r--content,[class*="content"]',title:'[class*="title"]',rating:'[class*="star"],[aria-label*="star" i]',date:'time,[class*="date"]'}],
      ali_reviews:[{card:'[class*="alireview"][class*="review"],[class*="ali-review"],[class*="lai-review"],[data-review-id]',author:'[class*="author"],[class*="name"]',body:'[class*="content"],[class*="comment"]',title:'[class*="title"]',rating:'[class*="star"],[aria-label*="star" i]',date:'time,[class*="date"]'}],
      a_reviews:[{card:'[class*="areviews"][class*="review"],[class*="a-review-item"]',author:'[class*="author"],[class*="name"]',body:'[class*="content"],[class*="comment"]',title:'[class*="title"]',rating:'[class*="star"],[aria-label*="star" i]',date:'time,[class*="date"]'}],
      automizely:[{card:'[class*="automizely"][class*="review"],[class*="aftership"][class*="review"]',author:'[class*="author"],[class*="name"]',body:'[class*="content"],[class*="comment"]',title:'[class*="title"]',rating:'[class*="star"],[aria-label*="star" i]',date:'time,[class*="date"]'}],
      yotpo:[{card:'.yotpo-review,.yotpo-review-item',author:'.yotpo-user-name,.yotpo-header-element .y-label-with-tooltip',body:'.content-review,.yotpo-review-content',title:'.content-title',rating:'.yotpo-review-stars,[aria-label*="star" i]',date:'.yotpo-review-date,time'}],
      stamped:[{card:'.stamped-review,[data-review-id]',author:'.author,.stamped-review-header-byline',body:'.stamped-review-content-body,[class*="review-content"]',title:'.stamped-review-header-title',rating:'[data-rating],[class*="star"]',date:'time,.created'}],
      opinew:[{card:'[class*="opinew"][class*="review"],[data-review-id]',author:'[class*="author"],[class*="name"]',body:'[class*="content"],[class*="comment"]',title:'[class*="title"]',rating:'[class*="star"],[aria-label*="star" i]',date:'time,[class*="date"]'}],
      bk_reviews:[{card:'[data-review-id],[class*="bk-review" i],[class*="review-card" i],[class*="review-item" i]',author:'[class*="author"],[class*="customer"],[class*="name"]',body:'[class*="comment"],[class*="content"],[class*="body"]',title:'[class*="title"]',rating:'[class*="star"],[aria-label*="star" i],[aria-label*="estrela" i]',date:'time,[class*="date"]'}],
    };
    return sets[app.slug] || [];
  }

  function marketplaceSelectorSets(p) {
    if (p.slug === 'amazon') return [{card:'[data-hook="review"]',author:'.a-profile-name',body:'[data-hook="review-body"]',title:'[data-hook="review-title"]',rating:'[data-hook="review-star-rating"],[data-hook="cmps-review-star-rating"]',date:'[data-hook="review-date"]'}];
    if (p.slug === 'shopee') return [{card:'[class*="product-rating"],[class*="ProductRating"],[data-testid*="rating"]',author:'[class*="author"],[class*="username"],[class*="user-name"],a',body:'[class*="comment"],[class*="content"],[class*="review"]',title:'[class*="title"]',rating:'[aria-label*="estrela" i],[aria-label*="star" i],[class*="star"]',date:'time,[class*="time"],[class*="date"]'}];
    if (p.slug === 'aliexpress') return [{card:'[class*="review-item"],[class*="feedback-item"],[class*="review"],[class*="feedback"]',author:'[class*="user"],[class*="author"],[class*="name"]',body:'[class*="content"],[class*="feedback"] p,[class*="review"] p',title:'[class*="title"]',rating:'[class*="star"],[aria-label*="star" i]',date:'time,[class*="date"],[class*="time"]'}];
    if (p.slug === 'mercado_livre') return [{card:'article[class*="review"],[class*="ui-review"],[class*="review"]',author:'[class*="user"],[class*="author"]',body:'p[class*="comment"],p[class*="review"],[class*="content"]',title:'[class*="title"]',rating:'[aria-label*="estrela" i],[class*="rating"],[class*="star"]',date:'time,[class*="date"]'}];
    return [];
  }

  function genericSelectorSets() {
    return [{card:'[itemprop="review"],[data-review-id],[data-testid*="review"],article[class*="review"],div[class*="review-card"],li[class*="review"],div[class*="feedback"]',author:'[itemprop="author"],[class*="author"],[class*="user-name"],[class*="username"]',body:'[itemprop="reviewBody"],[class*="review-content"],[class*="comment"],[class*="feedback-content"]',title:'[itemprop="name"],[class*="review-title"],[class*="title"]',rating:'[itemprop="ratingValue"],[aria-label*="star" i],[aria-label*="estrela" i],[class*="rating"]',date:'[itemprop="datePublished"],time,[class*="date"]'}];
  }

  function ratingFromCard(card, selector) {
    const node = selector ? card.querySelector(selector) : null;
    let rating = ratingFromText(node?.getAttribute('data-score') || node?.getAttribute('data-rating') || node?.getAttribute('content') || node?.getAttribute('aria-label') || node?.getAttribute('title') || text(node));
    if (rating) return rating;
    for (const candidate of card.querySelectorAll('[aria-label*="star" i],[aria-label*="estrela" i],[title*="star" i],[title*="estrela" i]')) {
      rating = ratingFromText(candidate.getAttribute('aria-label') || candidate.getAttribute('title'));
      if (rating) return rating;
    }
    const filled = card.querySelectorAll('svg[class*="filled"], [class*="star"][class*="active"], [class*="star"][class*="filled"]').length;
    return filled >= 1 && filled <= 5 ? filled : 5;
  }

  function rowsFromSets(sets, source) {
    const rows = [];
    for (const set of sets) {
      let cards=[];
      try { cards=[...document.querySelectorAll(set.card)]; } catch { continue; }
      for (const card of cards) {
        if (rows.length >= 250) break;
        const body = text(card.querySelector(set.body));
        const title = set.title ? text(card.querySelector(set.title)) : '';
        if ((!body && !title) || (body.length < 3 && title.length < 3)) continue;
        const dateNode = set.date ? card.querySelector(set.date) : null;
        const date = dateNode?.getAttribute('datetime') || dateNode?.getAttribute('content') || text(dateNode);
        rows.push({
          customer_name:text(card.querySelector(set.author)) || 'Cliente',
          rating:ratingFromCard(card,set.rating),
          title,
          body,
          created_at:date || '',
          external_id:card.id || card.getAttribute('data-review-id') || card.getAttribute('data-testid') || '',
          media_urls:mediaFromCard(card),
          source,
        });
      }
      if (rows.length) break;
    }
    return rows;
  }

  function fromHeuristics(source) {
    const rows=[];
    const candidates=[...document.querySelectorAll('[class*="review" i],[class*="rating" i],[class*="feedback" i],[data-testid*="review" i]')];
    for (const card of candidates) {
      if (rows.length >= 80) break;
      const bodyText=text(card);
      if (bodyText.length < 25 || bodyText.length > 2500) continue;
      const rating=ratingFromCard(card,'[aria-label*="star" i],[aria-label*="estrela" i],[class*="star"]');
      if (!rating) continue;
      const paragraphs=[...card.querySelectorAll('p,span,div')].map(text).filter((value)=>value.length>=12&&value.length<=1200);
      const body=paragraphs.sort((a,b)=>b.length-a.length)[0] || '';
      if (!body) continue;
      const author=[...card.querySelectorAll('[class*="author" i],[class*="user" i],[class*="name" i],a')].map(text).find((value)=>value&&value.length<=80) || 'Cliente';
      rows.push({customer_name:author,rating,title:'',body,created_at:'',external_id:card.id||'',media_urls:mediaFromCard(card),source});
    }
    return rows;
  }

  function reviewRoots(app) {
    const roots=[];
    for (const selector of app.roots || []) {
      try { document.querySelectorAll(selector).forEach((node)=>roots.push(node)); } catch {}
    }
    if (!roots.length) {
      document.querySelectorAll('[id*="review" i],[class*="review" i],[id*="avali" i],[class*="avali" i]').forEach((node)=>{
        if (roots.length<20) roots.push(node);
      });
    }
    return roots;
  }

  async function autoLoadMore(app) {
    const roots=reviewRoots(app);
    const scopes=roots.length ? roots : [document];
    const label=/^(?:carregar|mostrar|ver)\s+mais(?:\s+(?:avaliações|reviews|comentários))?|mais\s+(?:avaliações|reviews)|load\s+more(?:\s+reviews)?|show\s+more(?:\s+reviews)?$/i;
    let clicks=0;
    for (let round=0; round<5 && clicks<5; round++) {
      let button=null;
      for (const scope of scopes) {
        const candidates=[...scope.querySelectorAll('button,a,[role="button"]')];
        button=candidates.find((el)=>{
          const value=text(el).replace(/\s+/g,' ').trim();
          if (!value || value.length>80 || !label.test(value)) return false;
          if (el.disabled || el.getAttribute('aria-disabled')==='true') return false;
          const rect=el.getBoundingClientRect();
          return rect.width>0 && rect.height>0;
        });
        if (button) break;
      }
      if (!button) break;
      try { button.click(); clicks++; await delay(450); } catch { break; }
    }
    return clicks;
  }

  function productHandle() {
    const match=location.pathname.match(/\/products\/([^/?#]+)/i);
    return match ? decodeURIComponent(match[1]) : '';
  }

  function productTitle() {
    const og=document.querySelector('meta[property="og:title"]')?.getAttribute('content');
    const h1=text(document.querySelector('h1'));
    return (og || h1 || document.title || '').trim();
  }

  async function extract() {
    const p=platform();
    const app=detectReviewApp();
    await autoLoadMore(app);
    const source=app.slug !== 'unknown' ? app.slug : p.slug;
    const sets=[...appSelectorSets(app),...marketplaceSelectorSets(p),...genericSelectorSets()];
    const rows=unique([
      ...fromJsonLd().map((row)=>({...row,source})),
      ...rowsFromSets(sets,source),
      ...fromHeuristics(source),
    ]).map((row)=>({
      ...row,
      source:row.source || source,
      origin:row.source || source,
      imported:true,
      imported_by_extension:true,
      media_urls:Array.isArray(row.media_urls)?row.media_urls.slice(0,8):[],
      page_url:location.href,
      detected_app:app.slug !== 'unknown' ? app.name : p.name,
    }));
    return {
      source,
      platform:p.slug,
      platform_name:p.name,
      app_slug:app.slug,
      app_name:app.slug !== 'unknown' ? app.name : (p.slug !== 'pagina_publica' ? p.name : 'App não identificado'),
      app_confidence:app.confidence,
      url:location.href,
      title:document.title,
      product_handle:productHandle(),
      product_title:productTitle(),
      rows,
    };
  }

  chrome.runtime.onMessage.addListener((message,_sender,sendResponse)=>{
    if (message?.type==='ARUNA_REVIEW_DETECT') {
      const app=detectReviewApp(); const p=platform();
      sendResponse({ok:true,app_slug:app.slug,app_name:app.slug!=='unknown'?app.name:(p.slug!=='pagina_publica'?p.name:'App não identificado'),platform:p.slug,platform_name:p.name,product_handle:productHandle(),product_title:productTitle(),url:location.href,title:document.title});
      return false;
    }
    if (message?.type==='ARUNA_REVIEW_SCAN') {
      extract().then((result)=>sendResponse({ok:true,...result})).catch((error)=>sendResponse({ok:false,error:String(error?.message||error)}));
      return true;
    }
    return false;
  });
})();

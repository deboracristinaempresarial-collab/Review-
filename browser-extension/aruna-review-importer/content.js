(() => {
  if (globalThis.__ARUNA_REVIEW_IMPORTER_CONTENT__) return;
  globalThis.__ARUNA_REVIEW_IMPORTER_CONTENT__ = true;

  const hostname = location.hostname.toLowerCase();

  function platform() {
    if (hostname.includes('shopee')) return 'shopee';
    if (hostname.includes('aliexpress')) return 'aliexpress';
    if (hostname.includes('amazon.')) return 'amazon';
    if (hostname.includes('mercadolivre')) return 'mercado_livre';
    if (hostname.includes('shein')) return 'shein';
    if (hostname.includes('temu')) return 'temu';
    if (hostname.includes('ebay')) return 'ebay';
    if (hostname.includes('alibaba')) return 'alibaba';
    return 'pagina_publica';
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
    for (const video of card.querySelectorAll('video,video source')) {
      push(video.currentSrc || video.src || video.getAttribute('src'));
    }
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
      const key = `${row.external_id || ''}|${row.customer_name || ''}|${row.rating}|${row.body || row.title}`.replace(/\s+/g,' ').slice(0, 1800).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 250);
  }

  function collectJsonReviews(value, rows) {
    if (!value) return;
    if (Array.isArray(value)) {
      for (const item of value) collectJsonReviews(item, rows);
      return;
    }
    if (typeof value !== 'object') return;
    const type = String(value['@type'] || '').toLowerCase();
    if (type === 'review' || value.reviewBody || (value.reviewRating && (value.author || value.name))) {
      const rating = Number(value?.reviewRating?.ratingValue || value?.ratingValue || value?.rating || 0);
      const author = typeof value?.author === 'string' ? value.author : value?.author?.name;
      const media = [];
      const image = value?.image;
      const video = value?.video;
      for (const item of Array.isArray(image) ? image : image ? [image] : []) media.push(typeof item === 'string' ? item : item?.url || item?.contentUrl || '');
      for (const item of Array.isArray(video) ? video : video ? [video] : []) media.push(typeof item === 'string' ? item : item?.contentUrl || item?.url || '');
      rows.push({
        customer_name: author || value?.customer_name || 'Cliente',
        rating: Math.max(1, Math.min(5, Math.round(rating || 5))),
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

  function selectorSets() {
    if (platform() === 'amazon') return [
      {card:'[data-hook="review"]',author:'.a-profile-name',body:'[data-hook="review-body"]',title:'[data-hook="review-title"]',rating:'[data-hook="review-star-rating"], [data-hook="cmps-review-star-rating"]',date:'[data-hook="review-date"]'},
    ];
    if (platform() === 'shopee') return [
      {card:'[class*="product-rating"], [class*="ProductRating"], [data-testid*="rating"]',author:'[class*="author"], [class*="username"], [class*="user-name"], a',body:'[class*="comment"], [class*="content"], [class*="review"]',title:'[class*="title"]',rating:'[aria-label*="estrela" i], [aria-label*="star" i], [class*="star"]',date:'time, [class*="time"], [class*="date"]'},
    ];
    if (platform() === 'aliexpress') return [
      {card:'[class*="review-item"], [class*="feedback-item"], [class*="review"], [class*="feedback"]',author:'[class*="user"], [class*="author"], [class*="name"]',body:'[class*="content"], [class*="feedback"] p, [class*="review"] p',title:'[class*="title"]',rating:'[class*="star"], [aria-label*="star" i]',date:'time, [class*="date"], [class*="time"]'},
    ];
    if (platform() === 'mercado_livre') return [
      {card:'article[class*="review"], [class*="ui-review"], [class*="review"]',author:'[class*="user"], [class*="author"]',body:'p[class*="comment"], p[class*="review"], [class*="content"]',title:'[class*="title"]',rating:'[aria-label*="estrela" i], [class*="rating"], [class*="star"]',date:'time, [class*="date"]'},
    ];
    if (platform() === 'ebay') return [
      {card:'[class*="reviews"] [class*="review"], [data-testid*="review"]',author:'[class*="author"], [class*="username"]',body:'[class*="content"], [class*="comment"]',title:'[class*="title"]',rating:'[aria-label*="star" i], [class*="star"]',date:'time, [class*="date"]'},
    ];
    return [
      {card:'[itemprop="review"], [data-review-id], [data-testid*="review"], article[class*="review"], div[class*="review-card"], li[class*="review"], div[class*="feedback"]',author:'[itemprop="author"], [class*="author"], [class*="user-name"], [class*="username"]',body:'[itemprop="reviewBody"], [class*="review-content"], [class*="comment"], [class*="feedback-content"]',title:'[itemprop="name"], [class*="review-title"], [class*="title"]',rating:'[itemprop="ratingValue"], [aria-label*="star" i], [aria-label*="estrela" i], [class*="rating"]',date:'[itemprop="datePublished"], time, [class*="date"]'},
    ];
  }

  function ratingFromCard(card, selector) {
    const node = selector ? card.querySelector(selector) : null;
    let rating = ratingFromText(node?.getAttribute('content') || node?.getAttribute('aria-label') || node?.getAttribute('title') || text(node));
    if (rating) return rating;
    for (const candidate of card.querySelectorAll('[aria-label*="star" i],[aria-label*="estrela" i],[title*="star" i],[title*="estrela" i]')) {
      rating = ratingFromText(candidate.getAttribute('aria-label') || candidate.getAttribute('title'));
      if (rating) return rating;
    }
    const filled = card.querySelectorAll('svg[class*="filled"], [class*="star"][class*="active"], [class*="star"][class*="filled"]').length;
    return filled >= 1 && filled <= 5 ? filled : 5;
  }

  function fromDom() {
    const rows = [];
    for (const set of selectorSets()) {
      const cards = [...document.querySelectorAll(set.card)];
      for (const card of cards) {
        if (rows.length >= 250) break;
        const body = text(card.querySelector(set.body));
        const title = set.title ? text(card.querySelector(set.title)) : '';
        if ((!body && !title) || (body.length < 3 && title.length < 3)) continue;
        const dateNode = set.date ? card.querySelector(set.date) : null;
        const date = dateNode?.getAttribute('datetime') || dateNode?.getAttribute('content') || text(dateNode);
        rows.push({
          customer_name: text(card.querySelector(set.author)) || 'Cliente',
          rating: ratingFromCard(card,set.rating),
          title,
          body,
          created_at: date || '',
          external_id: card.id || card.getAttribute('data-review-id') || card.getAttribute('data-testid') || '',
          media_urls: mediaFromCard(card),
        });
      }
      if (rows.length) break;
    }
    return rows;
  }

  function fromHeuristics() {
    const rows = [];
    const candidates = [...document.querySelectorAll('[class*="review" i],[class*="rating" i],[class*="feedback" i],[data-testid*="review" i]')];
    for (const card of candidates) {
      if (rows.length >= 80) break;
      const bodyText = text(card);
      if (bodyText.length < 25 || bodyText.length > 2500) continue;
      const rating = ratingFromCard(card,'[aria-label*="star" i],[aria-label*="estrela" i],[class*="star"]');
      if (!rating) continue;
      const paragraphs = [...card.querySelectorAll('p,span,div')].map(text).filter((value) => value.length >= 12 && value.length <= 1200);
      const body = paragraphs.sort((a,b)=>b.length-a.length)[0] || '';
      if (!body) continue;
      const author = [...card.querySelectorAll('[class*="author" i],[class*="user" i],[class*="name" i],a')].map(text).find((value)=>value && value.length <= 80) || 'Cliente';
      rows.push({customer_name:author,rating,title:'',body,created_at:'',external_id:card.id || '',media_urls:mediaFromCard(card)});
    }
    return rows;
  }

  function extract() {
    const source = platform();
    const rows = unique([...fromJsonLd(), ...fromDom(), ...fromHeuristics()]).map((row) => ({
      ...row,
      source,
      origin: source,
      imported: true,
      imported_by_extension: true,
      media_urls: Array.isArray(row.media_urls) ? row.media_urls.slice(0,8) : [],
      page_url: location.href,
    }));
    return {source, url:location.href, title:document.title, rows};
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'ARUNA_REVIEW_SCAN') {
      try { sendResponse({ok:true,...extract()}); }
      catch (error) { sendResponse({ok:false,error:String(error?.message || error)}); }
    }
    return true;
  });
})();

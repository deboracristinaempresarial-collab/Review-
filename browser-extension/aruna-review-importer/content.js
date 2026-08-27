(() => {
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

  function ratingFromText(value) {
    const match = String(value || '').replace(',', '.').match(/([1-5](?:\.\d+)?)/);
    if (!match) return null;
    const n = Number(match[1]);
    return Number.isFinite(n) ? Math.max(1, Math.min(5, Math.round(n))) : null;
  }

  function unique(rows) {
    const seen = new Set();
    return rows.filter((row) => {
      if (!row.body && !row.title) return false;
      const key = `${row.external_id || ''}|${row.customer_name || ''}|${row.rating}|${row.body || row.title}`.slice(0, 1500);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 250);
  }

  function fromJsonLd() {
    const rows = [];
    for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
      let data;
      try { data = JSON.parse(script.textContent || 'null'); } catch { continue; }
      const queue = Array.isArray(data) ? [...data] : [data];
      while (queue.length) {
        const item = queue.shift();
        if (!item || typeof item !== 'object') continue;
        if (Array.isArray(item['@graph'])) queue.push(...item['@graph']);
        const reviews = Array.isArray(item.review) ? item.review : item.review ? [item.review] : [];
        for (const review of reviews) {
          const rating = Number(review?.reviewRating?.ratingValue || review?.ratingValue || 0);
          const author = typeof review?.author === 'string' ? review.author : review?.author?.name;
          rows.push({
            customer_name: author || 'Cliente',
            rating: Math.max(1, Math.min(5, Math.round(rating || 5))),
            title: String(review?.name || '').trim(),
            body: String(review?.reviewBody || review?.description || '').trim(),
            external_id: String(review?.['@id'] || ''),
            created_at: review?.datePublished || '',
          });
        }
      }
    }
    return rows;
  }

  function selectorSets() {
    if (platform() === 'amazon') return [
      {card:'[data-hook="review"]',author:'.a-profile-name',body:'[data-hook="review-body"]',title:'[data-hook="review-title"]',rating:'[data-hook="review-star-rating"],date:'[data-hook="review-date"]'},
    ];
    if (platform() === 'shopee') return [
      {card:'div[class*="product-rating"], div[class*="rating"]',author:'a, div[class*="author"], div[class*="name"]',body:'div[class*="comment"], div[class*="content"]',rating:'div[class*="star"], svg'},
    ];
    if (platform() === 'aliexpress') return [
      {card:'div[class*="review"], div[class*="feedback"]',author:'div[class*="user"], span[class*="user"]',body:'div[class*="content"], span[class*="content"]',rating:'div[class*="star"], span[class*="star"]'},
    ];
    if (platform() === 'mercado_livre') return [
      {card:'article[class*="review"], div[class*="review"]',author:'span[class*="user"], p[class*="user"]',body:'p[class*="comment"], p[class*="review"]',rating:'span[class*="rating"], div[class*="star"]'},
    ];
    return [
      {card:'[itemprop="review"], article[class*="review"], div[class*="review-card"], li[class*="review"]',author:'[itemprop="author"], [class*="author"], [class*="user-name"]',body:'[itemprop="reviewBody"], [class*="review-content"], [class*="comment"]',title:'[itemprop="name"], [class*="review-title"]',rating:'[itemprop="ratingValue"], [aria-label*="star" i], [aria-label*="estrela" i]',date:'[itemprop="datePublished"], time'},
    ];
  }

  function fromDom() {
    const rows = [];
    for (const set of selectorSets()) {
      for (const card of document.querySelectorAll(set.card)) {
        if (rows.length >= 250) break;
        const body = text(card.querySelector(set.body));
        const title = set.title ? text(card.querySelector(set.title)) : '';
        if (!body && !title) continue;
        const ratingNode = card.querySelector(set.rating);
        const rating = ratingFromText(ratingNode?.getAttribute('content') || ratingNode?.getAttribute('aria-label') || text(ratingNode)) || 5;
        const dateNode = set.date ? card.querySelector(set.date) : null;
        const date = dateNode?.getAttribute('datetime') || dateNode?.getAttribute('content') || text(dateNode);
        rows.push({
          customer_name: text(card.querySelector(set.author)) || 'Cliente',
          rating,
          title,
          body,
          created_at: date || '',
          external_id: card.id || card.getAttribute('data-review-id') || '',
        });
      }
      if (rows.length) break;
    }
    return rows;
  }

  function imagesNearReviews() {
    return [];
  }

  function extract() {
    const source = platform();
    const rows = unique([...fromJsonLd(), ...fromDom()]).map((row) => ({
      ...row,
      source,
      origin: source,
      imported: true,
      imported_by_extension: true,
      media_urls: row.media_urls || imagesNearReviews(),
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

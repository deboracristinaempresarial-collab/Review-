package com.aruna.comparador;

import android.app.Activity;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;
import org.json.JSONTokener;

import java.net.HttpURLConnection;
import java.net.URL;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class MainActivity extends Activity {
    private FrameLayout root;
    private WebView mainWebView;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private String pendingSharedUrl = "";
    private boolean uiReady = false;

    private static final Pattern URL_PATTERN = Pattern.compile("https?://[^\\s]+", Pattern.CASE_INSENSITIVE);

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        root = new FrameLayout(this);
        setContentView(root);
        mainWebView = createWebView(false);
        mainWebView.addJavascriptInterface(new Bridge(), "Android");
        root.addView(mainWebView, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        mainWebView.loadUrl("file:///android_asset/index.html");
        handleIntent(getIntent());
        fetchUsdBrl();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIntent(intent);
    }

    private void fetchUsdBrl() {
        new Thread(() -> {
            HttpURLConnection c = null;
            try {
                URL u = new URL("https://economia.awesomeapi.com.br/json/last/USD-BRL");
                c = (HttpURLConnection) u.openConnection();
                c.setConnectTimeout(5000);
                c.setReadTimeout(5000);
                c.setRequestProperty("Accept", "application/json");
                BufferedReader br = new BufferedReader(new InputStreamReader(c.getInputStream()));
                StringBuilder sb = new StringBuilder();
                String line; while ((line = br.readLine()) != null) sb.append(line);
                JSONObject root = new JSONObject(sb.toString());
                JSONObject usd = root.optJSONObject("USDBRL");
                double bid = usd != null ? usd.optDouble("bid", 0) : 0;
                if (bid > 0) sendJs("window.APP && window.APP.setUsd(" + bid + ");");
            } catch (Exception ignored) {
            } finally { if (c != null) c.disconnect(); }
        }).start();
    }

    private void handleIntent(Intent intent) {
        if (intent == null) return;
        String candidate = "";
        if (Intent.ACTION_SEND.equals(intent.getAction()) && "text/plain".equals(intent.getType())) {
            candidate = intent.getStringExtra(Intent.EXTRA_TEXT);
        } else if (Intent.ACTION_VIEW.equals(intent.getAction()) && intent.getData() != null) {
            Uri data = intent.getData();
            String q = data.getQueryParameter("url");
            candidate = q != null ? q : data.toString();
        }
        String url = extractUrl(candidate);
        if (!url.isEmpty()) {
            pendingSharedUrl = url;
            deliverSharedUrlIfReady();
        }
    }

    private String extractUrl(String text) {
        if (text == null) return "";
        Matcher m = URL_PATTERN.matcher(text);
        if (m.find()) {
            return m.group().replaceAll("[)>,.;]+$", "");
        }
        return "";
    }

    private void deliverSharedUrlIfReady() {
        if (!uiReady || pendingSharedUrl.isEmpty()) return;
        String js = "window.APP && window.APP.receiveSharedUrl(" + JSONObject.quote(pendingSharedUrl) + ");";
        mainWebView.evaluateJavascript(js, null);
        pendingSharedUrl = "";
    }

    private WebView createWebView(boolean worker) {
        WebView web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setLoadsImagesAutomatically(true);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setUserAgentString(s.getUserAgentString().replace("; wv", "") + " ComparadorPRO/4.0");
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);
        web.setWebChromeClient(new WebChromeClient());
        if (!worker) {
            web.setWebViewClient(new WebViewClient() {
                @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                    Uri uri = request.getUrl();
                    if (uri != null && ("http".equals(uri.getScheme()) || "https".equals(uri.getScheme()))) {
                        openLink(uri.toString(), false);
                        return true;
                    }
                    return false;
                }
                @Override public void onPageFinished(WebView view, String url) {
                    if (url != null && url.startsWith("file:///android_asset/")) {
                        uiReady = true;
                        deliverSharedUrlIfReady();
                    }
                }
            });
            web.setDownloadListener((url, userAgent, contentDisposition, mimetype, contentLength) -> download(url, "ComparadorPRO"));
        }
        return web;
    }

    private void runWorker(String url, String script, long delayMs, WorkerCallback callback) {
        ui.post(() -> {
            final WebView worker = createWebView(true);
            FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(2, 2);
            worker.setAlpha(0.01f);
            root.addView(worker, lp);
            final boolean[] finished = {false};
            final Runnable timeout = () -> {
                if (finished[0]) return;
                finished[0] = true;
                cleanupWorker(worker);
                callback.done("", "Tempo limite ao carregar a página.");
            };
            ui.postDelayed(timeout, 18000);
            worker.setWebViewClient(new WebViewClient() {
                @Override public void onPageFinished(WebView view, String loaded) {
                    if (finished[0]) return;
                    ui.postDelayed(() -> {
                        if (finished[0]) return;
                        worker.evaluateJavascript(script, value -> {
                            if (finished[0]) return;
                            finished[0] = true;
                            ui.removeCallbacks(timeout);
                            String decoded = decodeJsValue(value);
                            cleanupWorker(worker);
                            callback.done(decoded, "");
                        });
                    }, delayMs);
                }
            });
            worker.loadUrl(url);
        });
    }

    private void cleanupWorker(WebView worker) {
        try {
            root.removeView(worker);
            worker.stopLoading();
            worker.loadUrl("about:blank");
            worker.removeAllViews();
            worker.destroy();
        } catch (Exception ignored) {}
    }

    private String decodeJsValue(String value) {
        if (value == null || "null".equals(value)) return "";
        try {
            Object parsed = new JSONTokener(value).nextValue();
            return parsed instanceof String ? (String) parsed : String.valueOf(parsed);
        } catch (Exception e) {
            return value;
        }
    }

    private interface WorkerCallback { void done(String json, String error); }

    private String sourceScript() {
        return "(function(){try{" +
            "const meta=(p,n)=>document.querySelector('meta['+p+'=\\\"'+n+'\\\"]')?.content||'';" +
            "let title=(document.querySelector('h1')?.innerText||meta('property','og:title')||document.title||'').trim();" +
            "let image=meta('property','og:image');" +
            "let brand='',model='',sku='',desc=meta('name','description');" +
            "for(const s of document.querySelectorAll('script[type=\\\"application/ld+json\\\"]')){try{let j=JSON.parse(s.textContent);let a=Array.isArray(j)?j:[j];for(const x of a){let p=x&&x['@type']==='Product'?x:null;if(!p&&x&&x['@graph'])p=x['@graph'].find(y=>y&&y['@type']==='Product');if(p){title=p.name||title;image=(Array.isArray(p.image)?p.image[0]:p.image)||image;brand=(typeof p.brand==='string'?p.brand:p.brand?.name)||brand;model=p.model||model;sku=p.sku||p.mpn||p.gtin13||p.gtin||sku;desc=p.description||desc;}}}catch(e){}}" +
            "return JSON.stringify({url:location.href,title,brand,model,sku,image,description:desc});" +
            "}catch(e){return JSON.stringify({error:String(e)});}})();";
    }

    private String searchScript(String market) {
        String m = JSONObject.quote(market);
        return "(function(){try{const market=" + m + ";" +
            "const abs=u=>{try{return new URL(u,location.href).href}catch(e){return ''}};" +
            "const txt=e=>(e?.innerText||e?.textContent||'').replace(/\\s+/g,' ').trim();" +
            "const isProduct=u=>market==='shopee'?(/\\/product\\/|[-/]i\\.\\d+\\.\\d+/i.test(u)):market==='aliexpress'?(/\\/item\\/\\d+\\.html|\\/i\\/\\d+\\.html/i.test(u)):(/mercadolivre\\.com\\.br\\/.+MLB[-_]?\\d+|produto\\.mercadolivre\\.com\\.br|\\/p\\/MLB/i.test(u));" +
            "const money=t=>{let mm=t.match(/R\\$\\s*([0-9.]+(?:,[0-9]{1,2})?)/i);if(mm)return {price:Number(mm[1].replace(/\\./g,'').replace(',','.')),currency:'BRL'};mm=t.match(/(?:US\\$|USD|\\$)\\s*([0-9,.]+)/i);if(mm)return {price:Number(mm[1].replace(/,/g,'')),currency:'USD'};return {price:0,currency:''}};" +
            "const rating=t=>{let r=t.match(/(?:nota|rating)?\\s*([1-5](?:[.,]\\d)?)\\s*(?:de\\s*5|estrelas?|★)/i)||t.match(/★\\s*([1-5](?:[.,]\\d)?)/);return r?Number(r[1].replace(',','.')):0};" +
            "const count=t=>{let r=t.match(/([0-9.,]+\\s*[km]?)\\s*(?:avalia[cç][oõ]es|opini[oõ]es|reviews)/i);if(!r)return 0;let v=r[1].toLowerCase().replace(/\\./g,'').replace(',','.');let n=parseFloat(v)||0;if(v.includes('k'))n*=1000;if(v.includes('m'))n*=1000000;return Math.round(n)};" +
            "const sold=t=>{let r=t.match(/([0-9.,]+\\s*[km]?)\\s*(?:vendidos?|vendas?)/i);if(!r)return 0;let v=r[1].toLowerCase().replace(/\\./g,'').replace(',','.');let n=parseFloat(v)||0;if(v.includes('k'))n*=1000;if(v.includes('m'))n*=1000000;return Math.round(n)};" +
            "const out=[],seen=new Set();" +
            "for(const a of document.querySelectorAll('a[href]')){let href=abs(a.getAttribute('href'));if(!href||!isProduct(href))continue;href=href.split('#')[0];if(seen.has(href))continue;let card=a;for(let i=0;i<5&&card?.parentElement;i++){let p=card.parentElement;let tt=txt(p);if(tt.length>40&&tt.length<1200)card=p;else break;}let t=txt(card);if(t.length<12)continue;let mo=money(t);if(!mo.price)continue;let name=(a.getAttribute('title')||a.querySelector('img')?.getAttribute('alt')||txt(a)||t.split(/R\\$/)[0]).trim();if(name.length<8)name=t.slice(0,220);let img=a.querySelector('img')?.currentSrc||a.querySelector('img')?.src||card.querySelector('img')?.currentSrc||card.querySelector('img')?.src||'';let origin=/internacional|china|envio internacional/i.test(t)?'international':'national';if(market==='aliexpress')origin='international';out.push({marketplace:market,url:href,name:name.slice(0,280),price:mo.price,currency:mo.currency,image:img,rating:rating(t),reviewCount:count(t),soldCount:sold(t),origin,text:t.slice(0,600)});seen.add(href);if(out.length>=80)break;}" +
            "return JSON.stringify({url:location.href,items:out});}catch(e){return JSON.stringify({error:String(e),items:[]});}})();";
    }

    private String reviewScript() {
        return "(function(){try{" +
            "const txt=e=>(e?.innerText||e?.textContent||'').replace(/\\s+/g,' ').trim();" +
            "const out=[],seen=new Set();let blocks=[...document.querySelectorAll('[class*=review],[class*=rating],[class*=opinion],[class*=feedback],[data-testid*=review],[data-pl*=review]')];" +
            "for(const e of blocks){let t=txt(e);if(t.length<12||t.length>1800)continue;if(seen.has(t))continue;let imgs=[...e.querySelectorAll('img')].map(i=>i.currentSrc||i.src).filter(u=>/^https?:/.test(u));let vids=[...e.querySelectorAll('video,video source')].map(v=>v.currentSrc||v.src).filter(u=>/^https?:/.test(u));let r=t.match(/([1-5](?:[.,]\\d)?)\\s*(?:de\\s*5|estrelas?|★)/i);out.push({comment:t.slice(0,900),rating:r?Number(r[1].replace(',','.')):0,images:[...new Set(imgs)].slice(0,8),videos:[...new Set(vids)].slice(0,4)});seen.add(t);if(out.length>=40)break;}return JSON.stringify({items:out});" +
            "}catch(e){return JSON.stringify({error:String(e),items:[]});}})();";
    }

    private String mediaScript() {
        return "(function(){try{const abs=u=>{try{return new URL(u,location.href).href}catch(e){return ''}};const imgs=[],vids=[],si=new Set(),sv=new Set();" +
            "const addI=(u,w,h,src)=>{u=abs(u);if(!/^https?:/.test(u)||si.has(u))return;si.add(u);imgs.push({url:u,width:w||0,height:h||0,source:src||''})};" +
            "const addV=(u,w,h,src,caption)=>{u=abs(u);if(!/^https?:/.test(u)||sv.has(u))return;if(!/\\.(mp4|webm)(?:[?#]|$)|video|play|stream/i.test(u))return;sv.add(u);vids.push({url:u,width:w||0,height:h||0,source:src||'',hasCaptionTrack:!!caption})};" +
            "for(const m of document.querySelectorAll('meta[property=\\\"og:image\\\"],meta[name=\\\"twitter:image\\\"]'))addI(m.content,0,0,'meta');" +
            "for(const i of document.querySelectorAll('img')){let w=i.naturalWidth||Number(i.getAttribute('width'))||0,h=i.naturalHeight||Number(i.getAttribute('height'))||0;if(w>=400||h>=400)addI(i.currentSrc||i.src,w,h,'img')}" +
            "for(const m of document.querySelectorAll('meta[property=\\\"og:video\\\"],meta[property=\\\"og:video:url\\\"],meta[property=\\\"og:video:secure_url\\\"]'))addV(m.content,0,0,'meta',false);" +
            "for(const v of document.querySelectorAll('video')){let c=[...v.querySelectorAll('track')].some(t=>/captions|subtitles/i.test(t.kind||''));let w=v.videoWidth||0,h=v.videoHeight||0;addV(v.currentSrc||v.src,w,h,'video',c);for(const s of v.querySelectorAll('source'))addV(s.src,w,h,'source',c)}" +
            "return JSON.stringify({images:imgs.slice(0,120),videos:vids.slice(0,80)});}catch(e){return JSON.stringify({error:String(e),images:[],videos:[]});}})();";
    }

    private void compareAll(String sourceUrl) {
        sourceUrl = extractUrl(sourceUrl);
        if (sourceUrl.isEmpty()) {
            sendError("Cole ou compartilhe um link válido.");
            return;
        }
        sendStatus("Identificando o produto exato…");
        final String finalUrl = sourceUrl;
        runWorker(finalUrl, sourceScript(), 1800, (sourceJson, sourceErr) -> {
            if (!sourceErr.isEmpty() || sourceJson.isEmpty()) {
                sendError("Não consegui identificar o produto: " + sourceErr);
                return;
            }
            try {
                JSONObject src = new JSONObject(sourceJson);
                String title = src.optString("title", "").trim();
                if (title.isEmpty()) {
                    sendError("A página não expôs o nome do produto.");
                    return;
                }
                String query = makeQuery(title, src.optString("brand"), src.optString("model"), src.optString("sku"));
                JSONObject payload = new JSONObject();
                payload.put("source", src);
                payload.put("query", query);
                sendJs("window.APP.beginResults(" + payload.toString() + ");");
                String[] markets = {"shopee", "aliexpress", "mercadolivre"};
                AtomicInteger remaining = new AtomicInteger(markets.length);
                for (String market : markets) {
                    String searchUrl = searchUrl(market, query);
                    runWorker(searchUrl, searchScript(market), "aliexpress".equals(market) ? 3800 : 2600, (json, err) -> {
                        JSONObject result = new JSONObject();
                        try {
                            result.put("marketplace", market);
                            result.put("searchUrl", searchUrl);
                            if (!err.isEmpty()) result.put("error", err);
                            if (!json.isEmpty()) {
                                JSONObject r = new JSONObject(json);
                                result.put("items", r.optJSONArray("items") != null ? r.optJSONArray("items") : new JSONArray());
                                if (r.has("error")) result.put("error", r.optString("error"));
                            } else result.put("items", new JSONArray());
                        } catch (Exception ignored) {}
                        sendJs("window.APP.receiveMarket(" + result.toString() + ");");
                        if (remaining.decrementAndGet() == 0) sendJs("window.APP.finishResults();");
                    });
                }
            } catch (Exception e) {
                sendError("Falha ao processar o produto: " + e.getMessage());
            }
        });
    }

    private String makeQuery(String title, String brand, String model, String sku) {
        String combined = (brand + " " + model + " " + sku + " " + title).replaceAll("\\s+", " ").trim();
        String[] words = combined.split(" ");
        List<String> keep = new ArrayList<>();
        for (String w : words) {
            String c = w.replaceAll("[^\\p{L}\\p{N}+.-]", "").trim();
            if (c.length() < 2) continue;
            if (c.matches("(?i)(promo[cç][aã]o|oferta|frete|gr[aá]tis|original|novo|loja|kit|unidade|brasil|envio)")) continue;
            if (!keep.contains(c)) keep.add(c);
            if (keep.size() >= 14) break;
        }
        return String.join(" ", keep);
    }

    private String searchUrl(String market, String query) {
        String q = Uri.encode(query);
        switch (market) {
            case "shopee": return "https://shopee.com.br/search?keyword=" + q;
            case "aliexpress": return "https://pt.aliexpress.com/wholesale?SearchText=" + q;
            default:
                String slug = query.toLowerCase(Locale.ROOT).replaceAll("[^\\p{L}\\p{N}]+", "-").replaceAll("^-|-$", "");
                return "https://lista.mercadolivre.com.br/" + Uri.encode(slug, "-");
        }
    }

    private void scanReviews(String url) {
        url = extractUrl(url);
        if (url.isEmpty()) { sendError("Link inválido para avaliações."); return; }
        sendStatus("Lendo avaliações visíveis…");
        final String u = url;
        runWorker(u, "(function(){for(const b of document.querySelectorAll('button,[role=button],a')){if(/avalia[cç][oõ]es|opini[oõ]es|reviews/i.test(b.innerText||'')){try{b.click()}catch(e){};break}}return 'ok'})();", 1800, (ignored, err) -> {
            runWorker(u, reviewScript(), 3000, (json, err2) -> {
                JSONObject payload = safeObject(json);
                if (!err2.isEmpty()) put(payload, "error", err2);
                sendJs("window.APP.renderReviews(" + payload.toString() + ");");
            });
        });
    }

    private void scanMedia(String url, String mode) {
        url = extractUrl(url);
        if (url.isEmpty()) { sendError("Link inválido para mídia."); return; }
        sendStatus("Buscando fontes de mídia do produto…");
        runWorker(url, mediaScript(), 2600, (json, err) -> {
            JSONObject payload = safeObject(json);
            put(payload, "mode", mode);
            if (!err.isEmpty()) put(payload, "error", err);
            sendJs("window.APP.renderMedia(" + payload.toString() + ");");
        });
    }

    private JSONObject safeObject(String json) {
        try { return json == null || json.isEmpty() ? new JSONObject() : new JSONObject(json); }
        catch (Exception e) { return new JSONObject(); }
    }

    private void put(JSONObject o, String k, Object v) { try { o.put(k, v); } catch (Exception ignored) {} }

    private void sendStatus(String text) { sendJs("window.APP.status(" + JSONObject.quote(text) + ");"); }
    private void sendError(String text) { sendJs("window.APP.error(" + JSONObject.quote(text) + ");"); }
    private void sendJs(String js) { ui.post(() -> { if (mainWebView != null) mainWebView.evaluateJavascript(js, null); }); }

    private void openLink(String url, boolean forceApp) {
        try {
            Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            if (forceApp) {
                String host = Uri.parse(url).getHost();
                if (host != null) {
                    if (host.contains("shopee")) i.setPackage("com.shopee.br");
                    else if (host.contains("mercadolivre")) i.setPackage("com.mercadolibre");
                    else if (host.contains("aliexpress")) i.setPackage("com.alibaba.aliexpresshd");
                }
            }
            startActivity(i);
        } catch (ActivityNotFoundException e) {
            try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); }
            catch (Exception ex) { Toast.makeText(this, "Não consegui abrir esse link.", Toast.LENGTH_SHORT).show(); }
        }
    }

    private void download(String url, String filenameBase) {
        try {
            if (url == null || !url.startsWith("http")) {
                Toast.makeText(this, "Essa fonte não é um arquivo HTTP direto.", Toast.LENGTH_LONG).show();
                return;
            }
            Uri uri = Uri.parse(url);
            String path = uri.getLastPathSegment();
            String ext = "";
            if (path != null && path.contains(".")) {
                ext = path.substring(path.lastIndexOf('.'));
                if (ext.length() > 6) ext = "";
            }
            if (ext.isEmpty()) ext = url.contains("video") ? ".mp4" : ".jpg";
            String safe = filenameBase.replaceAll("[^a-zA-Z0-9._-]", "-");
            DownloadManager.Request req = new DownloadManager.Request(uri)
                    .setTitle("Comparador PRO")
                    .setDescription("Baixando mídia selecionada")
                    .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                    .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, "ComparadorPRO/" + safe + "-" + System.currentTimeMillis() + ext);
            DownloadManager dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
            dm.enqueue(req);
            Toast.makeText(this, "Download iniciado.", Toast.LENGTH_SHORT).show();
        } catch (Exception e) {
            Toast.makeText(this, "Falha no download: " + e.getMessage(), Toast.LENGTH_LONG).show();
        }
    }

    public class Bridge {
        @JavascriptInterface public void ready() { uiReady = true; deliverSharedUrlIfReady(); }
        @JavascriptInterface public void compare(String url) { compareAll(url); }
        @JavascriptInterface public void reviews(String url) { scanReviews(url); }
        @JavascriptInterface public void creatives(String url) { scanMedia(url, "creatives"); }
        @JavascriptInterface public void videos(String url) { scanMedia(url, "videos"); }
        @JavascriptInterface public void open(String url) { ui.post(() -> openLink(url, false)); }
        @JavascriptInterface public void openApp(String url) { ui.post(() -> openLink(url, true)); }
        @JavascriptInterface public void download(String url, String name) { ui.post(() -> MainActivity.this.download(url, name)); }
        @JavascriptInterface public void toast(String text) { ui.post(() -> Toast.makeText(MainActivity.this, text, Toast.LENGTH_SHORT).show()); }
    }
}

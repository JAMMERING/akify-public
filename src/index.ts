interface Env {
  ASSETS: Fetcher;
  API_URL: string;
  GA_ID: string;
  META_PIXEL_ID: string;
}

interface MerchandiseDetailResponse {
  data: {
    title: string;
    description: string | null;
    postImages?: string[];
  };
}

interface MerchandiseMeta {
  title: string;
  pageTitle?: string;
  description: string;
  image: string;
}

const FACEBOOK_DOMAIN_TOKEN = '54nz01x5m0hglaaznfk4fxdy2m7jpc';
const NAVER_VERIFICATION_FILE = 'navere3fe7590e547597777aab27426f7080c.html';
const FALLBACK_OG_IMAGE = 'https://go.akify.io/assets/opengraph.jpg';
const WEB_BASE = 'https://web.akify.io';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/install/') {
      return Response.redirect(`${url.origin}/install${url.search}`, 301);
    }

    if (url.pathname === '/install') {
      return handleInstall(request, env);
    }

    const merchandiseMatch = url.pathname.match(/^\/merchandise\/([^/?#]+)\/?$/);
    if (merchandiseMatch) {
      return handleMerchandise(request, env, merchandiseMatch[1]);
    }

    if (url.pathname === '/assets/analytics.js') {
      return generateAnalyticsJs(env);
    }

    if (url.pathname === `/${FACEBOOK_DOMAIN_TOKEN}.html`) {
      return new Response(FACEBOOK_DOMAIN_TOKEN, {
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }

    if (url.pathname === `/${NAVER_VERIFICATION_FILE}`) {
      return new Response(`naver-site-verification: ${NAVER_VERIFICATION_FILE}`, {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    }

    const assetResponse = await env.ASSETS.fetch(request);
    if (assetResponse.status !== 404) {
      return assetResponse;
    }

    return Response.redirect(`${WEB_BASE}${url.pathname}${url.search}`, 302);
  },
};

async function handleInstall(request: Request, env: Env): Promise<Response> {
  try {
    const pageUrl = new URL('/install/index.html', request.url).toString();
    const pageResponse = await env.ASSETS.fetch(pageUrl);
    if (!pageResponse.ok) {
      return Response.redirect(WEB_BASE, 302);
    }
    return pageResponse;
  } catch {
    return Response.redirect(WEB_BASE, 302);
  }
}

async function handleMerchandise(
  request: Request,
  env: Env,
  id: string,
): Promise<Response> {
  const templateUrl = new URL('/merchandise/index.html', request.url).toString();
  const templatePromise = env.ASSETS.fetch(templateUrl);

  const meta = await fetchMerchandiseMeta(env.API_URL, id);
  const templateResponse = await templatePromise;

  const url = new URL(request.url);
  const canonicalUrl = `${url.origin}${url.pathname}`;

  const finalMeta: MerchandiseMeta = meta ?? {
    title: '아키파이',
    pageTitle: '아키파이 | 악기 매물 보기',
    description: '아키파이에서 해당 악기 매물을 확인해 보세요!',
    image: FALLBACK_OG_IMAGE,
  };

  const transformed = new HTMLRewriter()
    .on('title', new TitleHandler(finalMeta.pageTitle ?? finalMeta.title))
    .on('head', new HeadHandler(finalMeta, canonicalUrl))
    .transform(templateResponse);

  return new Response(transformed.body, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': meta
        ? 'public, s-maxage=1800, stale-while-revalidate=86400'
        : 'public, s-maxage=60',
    },
  });
}

async function fetchMerchandiseMeta(
  apiUrl: string,
  id: string,
): Promise<MerchandiseMeta | null> {
  if (!id || !apiUrl) return null;
  try {
    const response = await fetch(
      `${apiUrl}/v1/posts/${encodeURIComponent(id)}`,
      { headers: { accept: 'application/json' } },
    );
    if (!response.ok) return null;
    const json = (await response.json()) as MerchandiseDetailResponse;
    const data = json.data;
    if (!data) return null;
    return {
      title: data.title,
      description: data.description || data.title,
      image: data.postImages?.[0] || FALLBACK_OG_IMAGE,
    };
  } catch {
    return null;
  }
}

function generateAnalyticsJs(env: Env): Response {
  const parts: string[] = [];

  if (env.GA_ID) {
    parts.push(`
(function () {
  var s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=${env.GA_ID}';
  document.head.appendChild(s);
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { dataLayer.push(arguments); };
  gtag('js', new Date());

  var params = new URLSearchParams(window.location.search);
  var cid = params.get('_cid');
  var src = params.get('utm_source');
  var med = params.get('utm_medium');
  var cnt = params.get('utm_content');
  var cmp = params.get('utm_campaign');
  var trm = params.get('utm_term');
  var config = {};
  if (cid) config.client_id = cid;
  if (src) config.campaign_source = src;
  if (med) config.campaign_medium = med;
  if (cnt) config.campaign_content = cnt;
  if (cmp) config.campaign_name = cmp;
  if (trm) config.campaign_term = trm;
  gtag('config', '${env.GA_ID}', config);

  window.akifyGetClientId = function (callback) {
    gtag('get', '${env.GA_ID}', 'client_id', callback);
  };
})();`);
  }

  if (env.META_PIXEL_ID) {
    parts.push(`
(function (f, b, e, v, n, t, s) {
  if (f.fbq) return;
  n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
  if (!f._fbq) f._fbq = n;
  n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = [];
  t = b.createElement(e); t.async = !0;
  t.src = v;
  s = b.getElementsByTagName(e)[0];
  s.parentNode.insertBefore(t, s);
})(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${env.META_PIXEL_ID}');
fbq('track', 'PageView');`);
  }

  return new Response(parts.join('\n'), {
    headers: {
      'content-type': 'application/javascript; charset=utf-8',
      'cache-control': 'public, max-age=300, s-maxage=3600',
    },
  });
}

class TitleHandler {
  constructor(private readonly title: string) {}
  element(element: Element) {
    element.setInnerContent(this.title);
  }
}

class HeadHandler {
  constructor(
    private readonly meta: MerchandiseMeta,
    private readonly url: string,
  ) {}
  element(element: Element) {
    const { title, description, image } = this.meta;
    const tags = [
      `<meta property="og:type" content="product" />`,
      `<meta property="og:site_name" content="아키파이" />`,
      `<meta property="og:locale" content="ko_KR" />`,
      `<meta property="og:url" content="${escapeAttr(this.url)}" />`,
      `<meta property="og:title" content="${escapeAttr(title)}" />`,
      `<meta property="og:description" content="${escapeAttr(description)}" />`,
      `<meta property="og:image" content="${escapeAttr(image)}" />`,
      `<meta name="twitter:card" content="summary_large_image" />`,
      `<meta name="twitter:title" content="${escapeAttr(title)}" />`,
      `<meta name="twitter:description" content="${escapeAttr(description)}" />`,
      `<meta name="twitter:image" content="${escapeAttr(image)}" />`,
    ].join('\n    ');
    element.append(`\n    ${tags}\n  `, { html: true });
  }
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

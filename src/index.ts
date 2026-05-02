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
  description: string;
  image: string;
}

const IOS_STORE =
  'https://apps.apple.com/kr/app/%EC%95%84%ED%82%A4%ED%8C%8C%EC%9D%B4/id6751454780';
const ANDROID_STORE =
  'https://play.google.com/store/apps/details?id=com.jammering.akify';
const FACEBOOK_DOMAIN_TOKEN = '54nz01x5m0hglaaznfk4fxdy2m7jpc';
const FALLBACK_OG_IMAGE = 'https://akify.io/opengraph-image.jpg';
const WEB_BASE = 'https://web.akify.io';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/install') {
      return handleInstall(request, env);
    }

    const merchandiseMatch = url.pathname.match(/^\/merchandise\/([^/?#]+)$/);
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

    return Response.redirect(`${WEB_BASE}${url.pathname}${url.search}`, 302);
  },
};

async function handleInstall(request: Request, env: Env): Promise<Response> {
  try {
    const ua = request.headers.get('user-agent') || '';
    const url = new URL(request.url);
    const utm = url.searchParams.toString();

    if (/iPhone|iPad|iPod/.test(ua)) {
      return Response.redirect(utm ? `${IOS_STORE}?${utm}` : IOS_STORE, 302);
    }

    if (/Android/.test(ua)) {
      const referrer = utm ? `&referrer=${encodeURIComponent(utm)}` : '';
      return Response.redirect(`${ANDROID_STORE}${referrer}`, 302);
    }

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

  if (!meta) {
    return new Response(templateResponse.body, {
      status: templateResponse.status,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'public, s-maxage=60',
      },
    });
  }

  const url = new URL(request.url);
  const canonicalUrl = `${url.origin}${url.pathname}`;

  const transformed = new HTMLRewriter()
    .on('title', new TitleHandler(meta.title))
    .on('head', new HeadHandler(meta, canonicalUrl))
    .transform(templateResponse);

  return new Response(transformed.body, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, s-maxage=1800, stale-while-revalidate=86400',
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
  gtag('config', '${env.GA_ID}');
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
      `<meta property="og:site_name" content="AKIFY" />`,
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

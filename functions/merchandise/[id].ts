interface Env {
  API_URL: string;
  ASSETS: Fetcher;
}

interface MerchandiseMeta {
  title: string;
  description: string;
  image: string;
}

interface MerchandiseDetailResponse {
  data: {
    title: string;
    description: string | null;
    postImages?: string[];
  };
}

const FALLBACK_OG_IMAGE = 'https://akify.io/opengraph-image.jpg';

export const onRequestGet: PagesFunction<Env, 'id'> = async (context) => {
  const { params, env, request } = context;
  const id = Array.isArray(params.id) ? params.id[0] : params.id;

  const templateUrl = new URL('/merchandise/index.html', request.url);
  const templatePromise = env.ASSETS.fetch(new Request(templateUrl.toString()));

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
};

async function fetchMerchandiseMeta(
  apiUrl: string,
  id: string,
): Promise<MerchandiseMeta | null> {
  if (!id) return null;
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

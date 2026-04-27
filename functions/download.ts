interface Env {
  ASSETS: Fetcher;
}

const IOS_STORE =
  'https://apps.apple.com/kr/app/%EC%95%84%ED%82%A4%ED%8C%8C%EC%9D%B4/id6751454780';
const ANDROID_STORE =
  'https://play.google.com/store/apps/details?id=com.jammering.akify';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const { request, env } = context;
    const ua = request.headers.get('user-agent') || '';
    const url = new URL(request.url);
    const utm = url.searchParams.toString();

    if (/iPhone|iPad|iPod/.test(ua)) {
      const target = utm ? `${IOS_STORE}?${utm}` : IOS_STORE;
      return Response.redirect(target, 302);
    }

    if (/Android/.test(ua)) {
      const referrer = utm ? `&referrer=${encodeURIComponent(utm)}` : '';
      return Response.redirect(`${ANDROID_STORE}${referrer}`, 302);
    }

    const pageUrl = new URL('/dl/index.html', request.url);
    const pageResponse = await env.ASSETS.fetch(pageUrl.toString());
    if (!pageResponse.ok) {
      return Response.redirect('https://akify.io', 302);
    }
    return pageResponse;
  } catch {
    return Response.redirect('https://akify.io', 302);
  }
};

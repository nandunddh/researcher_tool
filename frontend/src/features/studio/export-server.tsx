import { renderToString, renderToStaticMarkup } from "react-dom/server";
import { ExportContent, type ExportPage } from "./export-content";
import { prepareSite } from "./editor-model";
import { readSeo, seoProblems } from "./seo-settings";
import { safeImage } from "./site-schema";

export function renderPage(input: ExportPage) {
  const page = { ...input, site: prepareSite(input.site) };
  const seo = readSeo(page.site);
  const problems = seoProblems(seo);
  const title = seo.meta_title || [page.site.page_name, page.site.name].filter(Boolean).join(" · ");
  const image = safeImage(seo.og_image);
  const ga = !problems.ga_tracking_id && seo.ga_tracking_id.toUpperCase();
  const head = renderToStaticMarkup(<head>
    <meta charSet="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{title}</title><meta property="og:title" content={title} />
    {seo.meta_description && <meta name="description" content={seo.meta_description} />}
    {image && <meta property="og:image" content={image} />}
    {seo.canonical_url && !problems.canonical_url && <link rel="canonical" href={seo.canonical_url} />}
    <meta name="robots" content={seo.indexable ? "index, follow" : "noindex, nofollow"} />
    <link rel="stylesheet" href="style.css" />
    {ga && <script async src={`https://www.googletagmanager.com/gtag/js?id=${ga}`} />}
    {ga && <script dangerouslySetInnerHTML={{ __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${ga}');` }} />}
  </head>);
  const data = JSON.stringify(page).replaceAll("<", "\\u003c");
  return `<!doctype html><html lang="en">${head}<body><div id="studio-site">${renderToString(<ExportContent {...page} />)}</div><script type="application/json" id="studio-data">${data}</script><script defer src="site.js"></script></body></html>`;
}

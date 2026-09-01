// V22 dynamic sitemap generator.
// Feed this from Firestore/your CMS and write the resulting XML to public/sitemap.xml.
export function buildSitemap({baseUrl, staticPaths=[], articles=[], jobs=[], profiles=[]}) {
  const esc = s => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;");
  const urls = [
    ...staticPaths.map(x => ({loc:x})),
    ...articles.map(x => ({loc:`/articles/${x.slug}`, lastmod:x.updatedAt})),
    ...jobs.map(x => ({loc:`/jobs/${x.slug}`, lastmod:x.updatedAt})),
    ...profiles.map(x => ({loc:`/professionals/${x.slug}`, lastmod:x.updatedAt}))
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` +
    urls.map(u => `<url><loc>${esc(baseUrl+u.loc)}</loc>${u.lastmod?`<lastmod>${esc(new Date(u.lastmod).toISOString())}</lastmod>`:""}</url>`).join("") +
    `</urlset>`;
}

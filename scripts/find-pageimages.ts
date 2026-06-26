/**
 * For each missing brand, query Wikipedia PageImages API
 * to get the infobox logo file name.
 */
const BRANDS: { slug: string; wikiPage: string; lang: string }[] = [
  { slug: 'shopeepay', wikiPage: 'Shopee', lang: 'en' },        // ShopeePay is part of Shopee
  { slug: 'shopeepay', wikiPage: 'ShopeePay', lang: 'id' },     // try Indonesian Wikipedia
  { slug: 'doku',      wikiPage: 'DOKU', lang: 'id' },
  { slug: 'sakuku',    wikiPage: 'Sakuku', lang: 'id' },
  { slug: 'jenius',    wikiPage: 'Jenius (aplikasi)', lang: 'id' },
  { slug: 'jenius',    wikiPage: 'Jenius', lang: 'id' },
];

const UA = 'NexvoBot/1.0 (contact@nexvo.id) educational';

async function getPageImage(wikiPage: string, lang: string): Promise<{ original?: string; thumb?: string; title?: string } | null> {
  // Use PageImages prop to get page image
  const url = `https://${lang}.wikipedia.org/w/api.php?action=query&prop=pageimages&piprop=original|thumbnail&pithumbsize=400&titles=${encodeURIComponent(wikiPage)}&format=json`;
  try {
    const resp = await fetch(url, { headers: { 'User-Agent': UA } });
    const data = await resp.json() as {
      query?: { pages?: Record<string, { title: string; original?: { source: string }; thumbnail?: { source: string } }> }
    };
    const pages = data.query?.pages || {};
    const firstKey = Object.keys(pages)[0];
    if (!firstKey || firstKey === '-1') return null;
    return {
      title: pages[firstKey].title,
      original: pages[firstKey].original?.source,
      thumb: pages[firstKey].thumbnail?.source,
    };
  } catch { return null; }
}

async function main() {
  for (const { slug, wikiPage, lang } of BRANDS) {
    console.log(`\n${slug.padEnd(12)} (${lang}:${wikiPage}):`);
    const img = await getPageImage(wikiPage, lang);
    if (!img) { console.log('  page not found'); continue; }
    console.log(`  title: ${img.title}`);
    if (img.original) console.log(`  original: ${img.original}`);
    if (img.thumb)    console.log(`  thumb:    ${img.thumb}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });

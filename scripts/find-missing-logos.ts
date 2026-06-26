/**
 * Try alternate Wikimedia queries for brands still missing logos.
 */
type BrandSpec = { slug: string; queries: string[] };

const BRANDS: BrandSpec[] = [
  { slug: 'bsi',       queries: ['Bank Syariah Indonesia BSI logo', 'BSI bank logo', 'Bank Syariah Indonesia 2021 logo'] },
  { slug: 'gopay',     queries: ['GoPay Gojek logo', 'GoTo GoPay logo', 'GoPay payment logo'] },
  { slug: 'shopeepay', queries: ['ShopeePay e-wallet logo', 'Shopee Pay logo', 'ShopeePay logo'] },
  { slug: 'doku',      queries: ['DOKU payment Indonesia logo', 'DOKU wallet logo', 'Doku Indonesia'] },
  { slug: 'sakuku',    queries: ['Sakuku BCA e-wallet logo', 'Sakuku BCA', 'BCA Sakuku'] },
  { slug: 'jenius',    queries: ['Jenius BTPN digital bank logo', 'Jenius BTPN', 'Jenius app logo'] },
];

const UA = 'NexvoBot/1.0 (contact@nexvo.id) educational';

async function searchCommons(query: string): Promise<string[]> {
  const url = `https://commons.wikimedia.org/w/api.php?action=query&list=search&srnamespace=6&srsearch=${encodeURIComponent(query)}&srlimit=10&format=json`;
  try {
    const resp = await fetch(url, { headers: { 'User-Agent': UA } });
    const data = (await resp.json()) as { query?: { search?: { title: string; ns: number }[] } };
    return (data.query?.search || []).filter(r => r.ns === 6).map(r => r.title.replace(/^File:/, ''));
  } catch { return []; }
}

async function main() {
  for (const { slug, queries } of BRANDS) {
    const all = new Set<string>();
    for (const q of queries) {
      const files = await searchCommons(q);
      for (const f of files) all.add(f);
    }
    const imgs = [...all].filter(f => /\.(svg|png|jpg|jpeg)$/i.test(f));
    console.log(`\n${slug.padEnd(12)}:`);
    for (const f of imgs.slice(0, 8)) console.log(`  - ${f}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });

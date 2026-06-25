/**
 * Query Wikimedia Commons API to find official logo file names
 * for each brand that we couldn't guess.
 */
type BrandSpec = { slug: string; queries: string[] };

const BRANDS: BrandSpec[] = [
  { slug: 'bni',       queries: ['Bank Negara Indonesia logo', 'BNI bank logo Indonesia', 'BNI logo'] },
  { slug: 'cimb',      queries: ['CIMB Niaga logo', 'CIMB Bank logo', 'CIMB Group logo'] },
  { slug: 'danamon',   queries: ['Bank Danamon logo', 'Danamon Indonesia logo'] },
  { slug: 'permata',   queries: ['Bank Permata logo', 'Permata Bank logo Indonesia'] },
  { slug: 'ocbc',      queries: ['OCBC NISP logo', 'OCBC NISP Bank logo', 'OCBC Indonesia logo'] },
  { slug: 'panin',     queries: ['Panin Bank logo', 'Panin Bank Indonesia logo'] },
  { slug: 'sinarmas',  queries: ['Bank Sinarmas logo', 'Sinarmas bank logo'] },
  { slug: 'maybank',   queries: ['Maybank logo', 'Maybank Indonesia logo'] },
  { slug: 'btn',       queries: ['Bank Tabungan Negara logo', 'BTN bank logo Indonesia'] },
  { slug: 'dana',      queries: ['DANA e-wallet logo Indonesia', 'DANA wallet logo', 'DANA Indonesia logo'] },
  { slug: 'ovo',       queries: ['OVO e-money logo Indonesia', 'OVO wallet logo', 'OVO Indonesia logo'] },
  { slug: 'gopay',     queries: ['GoPay logo', 'GoPay Gojek logo', 'Gojek GoPay logo Indonesia'] },
  { slug: 'shopeepay', queries: ['ShopeePay logo', 'Shopee Pay logo', 'ShopeePay e-wallet logo'] },
  { slug: 'doku',      queries: ['DOKU e-wallet logo Indonesia', 'DOKU wallet logo', 'DOKU payment logo'] },
  { slug: 'sakuku',    queries: ['Sakuku BCA logo', 'Sakuku wallet logo Indonesia'] },
  { slug: 'jenius',    queries: ['Jenius BTPN logo', 'Jenius digital banking logo'] },
  { slug: 'flip',      queries: ['Flip app Indonesia logo', 'Flip financial app logo', 'Flip.id logo'] },
];

const UA = 'NexvoBot/1.0 (contact@nexvo.id) educational';

interface SearchResponse {
  query?: {
    search?: Array<{ title: string; ns: number; snippet: string }>;
  };
}

async function searchCommons(query: string): Promise<string[]> {
  const url = `https://commons.wikimedia.org/w/api.php?action=query&list=search&srnamespace=6&srsearch=${encodeURIComponent(query)}&srlimit=8&format=json`;
  try {
    const resp = await fetch(url, { headers: { 'User-Agent': UA } });
    const data = (await resp.json()) as SearchResponse;
    return (data.query?.search || [])
      .filter(r => r.ns === 6)
      .map(r => r.title.replace(/^File:/, ''));
  } catch {
    return [];
  }
}

async function main() {
  console.log('Brand | Top candidates (File: names)');
  console.log('─'.repeat(80));
  const result: Record<string, string[]> = {};
  for (const { slug, queries } of BRANDS) {
    const all = new Set<string>();
    for (const q of queries) {
      const files = await searchCommons(q);
      for (const f of files) all.add(f);
    }
    // Filter to image-like files
    const imgs = [...all].filter(f => /\.(svg|png|jpg|jpeg)$/i.test(f));
    result[slug] = imgs;
    console.log(`${slug.padEnd(12)} | ${imgs.slice(0, 5).join(' || ') || '(none)'}`);
  }
  console.log('\n— done —');
  // Write to JSON for next step
  const { writeFile } = await import('fs/promises');
  await writeFile('/tmp/commons-results.json', JSON.stringify(result, null, 2));
  console.log('saved → /tmp/commons-results.json');
}

main().catch(e => { console.error(e); process.exit(1); });

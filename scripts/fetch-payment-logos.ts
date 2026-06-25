/**
 * Download real official brand logos from Wikimedia Commons (verified file names)
 * and convert them to PNG via Sharp.
 *
 * Usage:  bun run scripts/fetch-payment-logos.ts
 */
import sharp from 'sharp';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync, statSync } from 'fs';
import path from 'path';

const OUT_DIR = path.join(process.cwd(), 'public', 'images', 'payment');

type LogoSpec = { slug: string; files: string[] };

const LOGOS: LogoSpec[] = [
  // ─── BANKS ─── (verified file names from Wikimedia Commons API)
  { slug: 'bca',      files: ['Bank_Central_Asia.svg'] },
  { slug: 'bni',      files: ['Bank Negara Indonesia logo (2004).svg', 'Bank_Negara_Indonesia_logo.svg'] },
  { slug: 'bri',      files: ['Bank_Rakyat_Indonesia.svg'] },
  { slug: 'mandiri',  files: ['Bank_Mandiri_logo_2016.svg'] },
  { slug: 'bsi',      files: ['Bank_Syariah_Indonesia_logo.svg'] },
  { slug: 'cimb',     files: ['CIMB Niaga logo.svg', 'CIMB_Group_Logo.svg', 'CIMB_Niaga_2008.svg'] },
  { slug: 'danamon',  files: ['Danamon.svg', 'Danamon (2024).svg', 'Bank_Danamon_2002.svg'] },
  { slug: 'permata',  files: ['Permata Bank (2024).svg', 'PermataBank (2024) prototype logo.svg'] },
  { slug: 'bukopin',  files: ['KB_Bukopin.svg', 'Bank_Bukopin.svg'] },
  { slug: 'ocbc',     files: ['OCBC Sekuritas.png', 'OCBC_Bank.svg', 'OCBC_NISP.svg'] },
  { slug: 'panin',    files: ['Logo Panin Bank.svg', 'Panin_Bank.svg'] },
  { slug: 'sinarmas', files: ['Bank Sinarmas.png', 'Bank_Sinarmas.svg'] },
  { slug: 'maybank',  files: ['Logo wordmark Bank Maybank Indonesia.png', 'Maybank_logo.svg'] },
  { slug: 'uob',      files: ['UOB.svg', 'UOB_Group_logo.svg'] },
  { slug: 'btn',      files: ['Bank Tabungan Negara logo.svg', 'Bank_BTN_logo.svg', 'BTN 2024 (wordmark).svg'] },

  // ─── E-WALLETS ───
  { slug: 'dana',       files: ['Logo DANA (PNG-1080p) - FileVector69.png', 'Logo dana blue.svg', 'DANA_Indonesia.svg'] },
  { slug: 'ovo',        files: ['Logo ovo purple.svg', 'OVO_(e-money).svg', 'OVO_Indonesia.svg'] },
  { slug: 'gopay',      files: ['GoPay.svg', 'GoPay_logo.svg'] },
  { slug: 'shopeepay',  files: ['ShopeePay.svg', 'ShopeePay_logo.svg'] },
  { slug: 'linkaja',    files: ['LinkAja.svg'] },
  { slug: 'doku',       files: ['DOKU.svg', 'DOKU_logo.svg'] },
  { slug: 'sakuku',     files: ['Sakuku.svg', 'Sakuku_logo.svg'] },
  { slug: 'jenius',     files: ['Jenius.svg', 'Jenius_logo.svg'] },
  { slug: 'flip',       files: ['Logo flip.png', 'Flip_id.svg'] },

  // ─── CRYPTO ───
  { slug: 'usdt',       files: ['Tether_Logo.svg'] },
];

const UA = 'NexvoBot/1.0 (contact@nexvo.id) educational';

async function fetchFile(file: string): Promise<Buffer | null> {
  const url = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=600`;
  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'image/*' },
      redirect: 'follow',
    });
    if (!resp.ok) return null;
    const ct = resp.headers.get('content-type') || '';
    if (!ct.includes('image/')) return null;
    const buf = Buffer.from(await resp.arrayBuffer());
    if (buf.length < 800) return null;
    return buf;
  } catch {
    return null;
  }
}

async function convertToPng(buf: Buffer, outPath: string, slug: string): Promise<boolean> {
  try {
    let pipeline;
    const head = buf.toString('utf8', 0, 5);
    if (head.includes('<?xml') || head.includes('<svg')) {
      pipeline = sharp(buf, { density: 300 });
    } else {
      pipeline = sharp(buf);
    }
    await pipeline
      .resize({ width: 320, height: 160, fit: 'inside', withoutEnlargement: true })
      .png({ quality: 90, compressionLevel: 9 })
      .toFile(outPath);
    return true;
  } catch (e) {
    console.error(`  ✗ ${slug}: convert failed — ${(e as Error).message}`);
    return false;
  }
}

async function main() {
  if (!existsSync(OUT_DIR)) {
    await mkdir(OUT_DIR, { recursive: true });
  }
  console.log(`\n📁 Output: ${OUT_DIR}\n`);

  let ok = 0, fail = 0;
  const failed: string[] = [];

  for (const { slug, files } of LOGOS) {
    // Skip if PNG already exists from previous run
    const outPath = path.join(OUT_DIR, `${slug}.png`);
    if (existsSync(outPath) && statSync(outPath).size > 2000) {
      console.log(`  ✓ ${slug.padEnd(12)} already exists (${(statSync(outPath).size / 1024).toFixed(1)}KB)`);
      ok++;
      continue;
    }

    let succeeded = false;
    for (const file of files) {
      process.stdout.write(`  → ${slug.padEnd(12)} (${file.substring(0, 40).padEnd(40)}) ... `);
      const buf = await fetchFile(file);
      if (!buf) { console.log('not found'); continue; }
      const ok2 = await convertToPng(buf, outPath, slug);
      if (ok2) {
        console.log(`✓ ${(statSync(outPath).size / 1024).toFixed(1)}KB`);
        succeeded = true;
        ok++;
        break;
      } else {
        console.log('convert failed');
      }
    }
    if (!succeeded) {
      fail++;
      failed.push(slug);
    }
  }

  console.log(`\n══════ Result: ${ok} ok, ${fail} failed ══════`);
  if (failed.length > 0) {
    console.log(`Failed: ${failed.join(', ')}`);
  }
  await writeFile('/tmp/failed-logos.json', JSON.stringify(failed, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });

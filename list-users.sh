#!/bin/bash
# NEXVO LIST USERS — cetak semua user dari DB (pakai bun:sqlite, no Prisma)
# Jalankan di VPS: bash <(curl -sL "https://raw.githubusercontent.com/ucpai-store/nexvoid/main/list-users.sh?t=$(date +%s)")

P=""
for candidate in /var/www/nexvo /home/nexvo /opt/nexvo /srv/nexvo /root/nexvo; do
  if [ -d "$candidate/db" ] && [ -f "$candidate/package.json" ]; then
    if grep -q '"nexvo"' "$candidate/package.json" 2>/dev/null; then
      P="$candidate"
      break
    fi
  fi
done
[ -z "$P" ] && P=$(find /var/www /home /root /opt /srv -maxdepth 5 -name "package.json" -type f 2>/dev/null | head -30 | while read f; do
  if grep -l '"nexvo"' "$f" 2>/dev/null > /dev/null; then dirname "$f"; break; fi
done)
[ -z "$P" ] && { echo "❌ Project nexvo gak ketemu"; exit 1; }

DB="$P/db/custom.db"
echo "═══════════════════════════════════════════════════════════"
echo "  📋 NEXVO USER LIST"
echo "  DB: $DB ($(wc -c < "$DB") bytes)"
echo "  Waktu: $(date '+%Y-%m-%d %H:%M:%S')"
echo "═══════════════════════════════════════════════════════════"
echo ""

bun -e "
import { Database } from 'bun:sqlite';
const db = new Database('$DB', { readonly: true });

// Total counts
const totalUsers = (db.query('SELECT COUNT(*) as c FROM User').get() as {c: number}).c;
const totalAdmins = (db.query('SELECT COUNT(*) as c FROM Admin').get() as {c: number}).c;
console.log('Total Users: ' + totalUsers);
console.log('Total Admins: ' + totalAdmins);
console.log('');

// List semua user
console.log('═══ SEMUA USER ═══');
const users = db.query(\`
  SELECT userId, whatsapp, email, name, level,
         mainBalance, depositBalance, profitBalance,
         totalDeposit, totalWithdraw, isVerified, isSuspended,
         createdAt
  FROM User
  ORDER BY createdAt ASC
\`).all() as Array<any>;

users.forEach((u, i) => {
  const created = u.createdAt
    ? new Date(typeof u.createdAt === 'number' ? u.createdAt : parseInt(u.createdAt)).toISOString().split('T')[0]
    : '?';
  const status = u.isSuspended ? 'SUSPENDED' : (u.isVerified ? 'Verified' : 'Unverified');
  console.log(\`#\${i+1}. \${u.userId} | \${u.name || '(no name)'}\`);
  console.log(\`     WhatsApp: \${u.whatsapp || '-'}\`);
  console.log(\`     Email: \${u.email || '-'}\`);
  console.log(\`     Level: \${u.level || '-'} | Status: \${status}\`);
  console.log(\`     Balance: Main Rp\${u.mainBalance || 0} | Deposit Rp\${u.depositBalance || 0} | Profit Rp\${u.profitBalance || 0}\`);
  console.log(\`     Total Deposit: Rp\${u.totalDeposit || 0} | Total Withdraw: Rp\${u.totalWithdraw || 0}\`);
  console.log(\`     Created: \${created}\`);
  console.log('');
});

// List admin
if (totalAdmins > 0) {
  console.log('═══ SEMUA ADMIN ═══');
  const admins = db.query('SELECT username, email, role, lastLogin FROM Admin ORDER BY createdAt ASC').all() as Array<any>;
  admins.forEach((a, i) => {
    console.log(\`#\${i+1}. \${a.username} | \${a.email} | role: \${a.role}\`);
  });
  console.log('');
}

// Summary statistics
console.log('═══ STATISTIK ═══');
const stats = db.query(\`
  SELECT
    COUNT(*) as total,
    SUM(CASE WHEN isVerified = 1 THEN 1 ELSE 0 END) as verified,
    SUM(CASE WHEN isSuspended = 1 THEN 1 ELSE 0 END) as suspended,
    SUM(mainBalance) as totalMain,
    SUM(depositBalance) as totalDeposit,
    SUM(profitBalance) as totalProfit
  FROM User
\`).get() as any;
console.log('Total User: ' + stats.total);
console.log('Verified: ' + stats.verified);
console.log('Suspended: ' + stats.suspended);
console.log('Total Main Balance: Rp' + (stats.totalMain || 0));
console.log('Total Deposit Balance: Rp' + (stats.totalDeposit || 0));
console.log('Total Profit Balance: Rp' + (stats.totalProfit || 0));

db.close();
" 2>&1 | grep -v "^Bun v"

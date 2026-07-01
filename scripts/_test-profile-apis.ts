/**
 * Test the 3 profile-related endpoints: bonuses, salary-bonus, matching-bonus
 * To reproduce the "halaman profil eror" bug.
 */
import { db } from '../src/lib/db';
import bcrypt from 'bcryptjs';

async function main() {
  console.log('=== SETUP: Create test user ===');
  await db.user.deleteMany({}); // clean
  const pass = await bcrypt.hash('test123', 10);
  const user = await db.user.create({
    data: {
      userId: 'TEST001',
      whatsapp: '62800000001',
      email: 'test@nexvo.com',
      password: pass,
      name: 'Test User',
      referralCode: 'TESTREF',
      mainBalance: 68800,
      totalProfit: 68800,
      isVerified: true,
    }
  });
  console.log(`User: ${user.email} (verified=${user.isVerified})`);
  
  console.log('\n=== LOGIN ===');
  const loginRes = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'test@nexvo.com', password: 'test123' })
  });
  console.log(`Login HTTP ${loginRes.status}`);
  const loginData = await loginRes.json();
  console.log('Login response keys:', Object.keys(loginData).join(', '));
  if (!loginData.success) {
    console.log('Login FAILED. Full response:', JSON.stringify(loginData, null, 2).slice(0, 800));
    return;
  }
  const token = loginData.data?.token || loginData.token;
  if (!token) {
    console.log('No token. Full response:', JSON.stringify(loginData, null, 2).slice(0, 800));
    return;
  }
  console.log(`Token: ${token.slice(0, 30)}...`);
  
  console.log('\n=== TEST 1: /api/bonuses (Referral page) ===');
  const r1 = await fetch('http://localhost:3000/api/bonuses?limit=100', {
    headers: { Authorization: `Bearer ${token}` }
  });
  console.log(`HTTP ${r1.status}`);
  const t1 = await r1.text();
  console.log('Response:', t1.slice(0, 1000));
  
  console.log('\n=== TEST 2: /api/salary-bonus (Gaji page) ===');
  const r2 = await fetch('http://localhost:3000/api/salary-bonus', {
    headers: { Authorization: `Bearer ${token}` }
  });
  console.log(`HTTP ${r2.status}`);
  const t2 = await r2.text();
  console.log('Response:', t2.slice(0, 1500));
  
  console.log('\n=== TEST 3: /api/matching-bonus (M.Profit page) ===');
  const r3 = await fetch('http://localhost:3000/api/matching-bonus', {
    headers: { Authorization: `Bearer ${token}` }
  });
  console.log(`HTTP ${r3.status}`);
  const t3 = await r3.text();
  console.log('Response:', t3.slice(0, 1500));
  
  console.log('\n=== TEST 4: /api/user/profile (Profile page) ===');
  const r4 = await fetch('http://localhost:3000/api/user/profile', {
    headers: { Authorization: `Bearer ${token}` }
  });
  console.log(`HTTP ${r4.status}`);
  const t4 = await r4.text();
  console.log('Response:', t4.slice(0, 1500));
  
  console.log('\n=== TEST 5: /api/user/referral (Network/Referral page) ===');
  const r5 = await fetch('http://localhost:3000/api/user/referral', {
    headers: { Authorization: `Bearer ${token}` }
  });
  console.log(`HTTP ${r5.status}`);
  const t5 = await r5.text();
  console.log('Response:', t5.slice(0, 1500));
  
  console.log('\n=== TEST 6: /api/user/profit-status ===');
  const r6 = await fetch('http://localhost:3000/api/user/profit-status', {
    headers: { Authorization: `Bearer ${token}` }
  });
  console.log(`HTTP ${r6.status}`);
  const t6 = await r6.text();
  console.log('Response:', t6.slice(0, 1000));
  
  // Cleanup
  await db.user.deleteMany({});
  console.log('\n=== CLEANED UP ===');
}
main().catch(e => { console.error('FATAL:', e); process.exit(1); }).finally(() => process.exit(0));

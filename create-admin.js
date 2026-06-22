// ============================================================================
//  NEXVO - CREATE ADMIN via Prisma
// ----------------------------------------------------------------------------
//  Jalankan dengan: bun run create-admin.js
//  Script ini pakai Prisma Client langsung (tidak perlu sqlite3 CLI)
// ============================================================================

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('=== NEXVO - CREATE ADMIN ===\n');
  
  try {
    // 1. Cek apakah tabel Admin bisa diakses
    console.log('1. Cek koneksi database...');
    let adminCount;
    try {
      adminCount = await prisma.admin.count();
      console.log(`   ✓ Tabel Admin accessible. Jumlah admin: ${adminCount}`);
    } catch (e) {
      console.log(`   ✗ Tabel Admin error: ${e.message}`);
      console.log('   → Running prisma db push...');
      const { execSync } = require('child_process');
      execSync('bunx prisma db push --accept-data-loss', { stdio: 'inherit', cwd: '/home/nexvo' });
      execSync('bunx prisma generate', { stdio: 'inherit', cwd: '/home/nexvo' });
      adminCount = await prisma.admin.count();
      console.log(`   ✓ Setelah db push. Jumlah admin: ${adminCount}`);
    }
    
    // 2. Generate password hash
    console.log('\n2. Generate password hash untuk "Admin@2024"...');
    const hashedPassword = await bcrypt.hash('Admin@2024', 8);
    console.log(`   ✓ Hash: ${hashedPassword.substring(0, 30)}...`);
    
    // 3. Cek admin yang sudah ada
    console.log('\n3. Cek admin existing...');
    let existing = await prisma.admin.findFirst({
      where: { OR: [{ username: 'admin' }, { email: 'admin@nexvo.id' }] }
    });
    
    if (existing) {
      console.log(`   ⚠ Admin sudah ada: ${existing.username} (${existing.email})`);
      console.log('   → Update password + role + unlock...');
      
      existing = await prisma.admin.update({
        where: { id: existing.id },
        data: {
          password: hashedPassword,
          role: 'super_admin',
          loginAttempts: 0,
          lockedUntil: null,
          email: 'admin@nexvo.id',
          name: 'Super Admin',
        }
      });
      console.log(`   ✓ Admin di-update. ID: ${existing.id}`);
    } else {
      console.log('   → Admin belum ada, buat baru...');
      
      // Generate unique ID
      const id = `cmd${Date.now()}admin`;
      
      existing = await prisma.admin.create({
        data: {
          id,
          username: 'admin',
          email: 'admin@nexvo.id',
          password: hashedPassword,
          name: 'Super Admin',
          role: 'super_admin',
          loginAttempts: 0,
        }
      });
      console.log(`   ✓ Admin dibuat. ID: ${existing.id}`);
    }
    
    // 4. Show all admins
    console.log('\n4. Daftar semua admin di database:');
    const allAdmins = await prisma.admin.findMany({
      select: { id: true, username: true, email: true, name: true, role: true, loginAttempts: true, lastLogin: true }
    });
    console.table(allAdmins);
    
    // 5. Test verifikasi password
    console.log('\n5. Test verifikasi password...');
    const verify = await bcrypt.compare('Admin@2024', existing.password);
    console.log(`   ${verify ? '✓' : '✗'} bcrypt.compare("Admin@2024", hash) = ${verify}`);
    
    if (!verify) {
      console.log('   ✗ PASSWORD VERIFICATION FAILED!');
      process.exit(1);
    }
    
    console.log('\n=== SELESAI ===');
    console.log('Admin credentials:');
    console.log('  Username: admin');
    console.log('  Email:    admin@nexvo.id');
    console.log('  Password: Admin@2024');
    console.log('  Role:     super_admin');
    console.log('');
    
  } catch (error) {
    console.error('\n✗ ERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

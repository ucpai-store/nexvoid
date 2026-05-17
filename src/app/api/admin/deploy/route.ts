import { NextRequest, NextResponse } from 'next/server';
import { getAdminFromRequest, logAdminAction } from '@/lib/auth';
import { writeFile, mkdir, readdir, unlink, copyFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const PUBLIC_DIR = path.join(process.cwd(), 'public');
const STANDALONE_PUBLIC_DIR = path.join(process.cwd(), '.next', 'standalone', 'public');

/**
 * POST /api/admin/deploy
 * 
 * Deploy critical updates to the server.
 * This endpoint allows updating specific files on the server filesystem.
 * Only accessible by super_admin users.
 * 
 * Supported actions:
 * - update-sw: Update the service worker file
 * - cleanup-logos: Remove all uploaded site-logo-* files
 * - restart-app: Restart the PM2 application
 * - rebuild: Rebuild the Next.js application
 * - replace-logo-file: Copy uploaded site-logo file to nexvo-logo.png in all dirs
 * - git-deploy: git pull, npm build, copy static/public, pm2 restart
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Only super_admin can deploy
    if (admin.role !== 'super_admin') {
      return NextResponse.json({ success: false, error: 'Forbidden - super_admin only' }, { status: 403 });
    }

    const body = await request.json();
    const { action } = body;

    switch (action) {
      case 'update-sw': {
        const { content } = body;
        if (!content || typeof content !== 'string') {
          return NextResponse.json({ success: false, error: 'Service worker content required' }, { status: 400 });
        }

        // Validate it looks like a service worker
        if (!content.includes('CACHE_NAME') || !content.includes('addEventListener')) {
          return NextResponse.json({ success: false, error: 'Invalid service worker content' }, { status: 400 });
        }

        // Write to public/sw.js
        const swPath = path.join(PUBLIC_DIR, 'sw.js');
        await writeFile(swPath, content, 'utf-8');
        console.log('[DEPLOY] Updated public/sw.js');

        // Also write to standalone public dir if it exists
        if (existsSync(STANDALONE_PUBLIC_DIR)) {
          const standaloneSwPath = path.join(STANDALONE_PUBLIC_DIR, 'sw.js');
          await writeFile(standaloneSwPath, content, 'utf-8');
          console.log('[DEPLOY] Updated .next/standalone/public/sw.js');
        }

        // Also check for other common deployment directories
        const extraDirs = [
          '/home/nexvo/nexvo/public',
          '/home/nexvo/public',
        ];
        for (const dir of extraDirs) {
          if (existsSync(dir)) {
            try {
              await writeFile(path.join(dir, 'sw.js'), content, 'utf-8');
              console.log(`[DEPLOY] Updated ${dir}/sw.js`);
            } catch {
              // Non-critical - might not have write permission
            }
          }
        }

        await logAdminAction(admin.id, 'DEPLOY_UPDATE_SW', 'Service worker updated to new cache version');

        return NextResponse.json({
          success: true,
          message: 'Service worker updated successfully. All browsers will clear their caches on next visit.',
        });
      }

      case 'cleanup-logos': {
        // Delete all site-logo-* files from all directories
        const dirs = [
          PUBLIC_DIR,
          path.join(process.cwd(), 'uploads'),
          STANDALONE_PUBLIC_DIR,
          path.join(process.cwd(), '.next', 'standalone', 'uploads'),
          '/home/nexvo/nexvo/public',
          '/home/nexvo/nexvo/uploads',
          '/home/nexvo/public',
          '/home/nexvo/uploads',
        ];

        let deletedCount = 0;
        for (const dir of dirs) {
          if (!existsSync(dir)) continue;
          try {
            const files = await readdir(dir);
            for (const file of files) {
              if (file.startsWith('site-logo-') && file !== 'nexvo-logo.png') {
                try {
                  await unlink(path.join(dir, file));
                  deletedCount++;
                  console.log(`[DEPLOY] Deleted: ${dir}/${file}`);
                } catch {
                  // Non-critical
                }
              }
            }
          } catch {
            // Non-critical
          }
        }

        await logAdminAction(admin.id, 'DEPLOY_CLEANUP_LOGOS', `Cleaned up ${deletedCount} uploaded logo files`);

        return NextResponse.json({
          success: true,
          message: `Cleaned up ${deletedCount} uploaded logo files`,
          deletedCount,
        });
      }

      case 'restart-app': {
        try {
          // Try PM2 restart first
          const { stdout } = await execAsync('pm2 restart nexvo-web 2>/dev/null || pm2 restart all 2>/dev/null || echo "no-pm2"');
          console.log('[DEPLOY] Restart result:', stdout);
          await logAdminAction(admin.id, 'DEPLOY_RESTART', 'Application restarted via PM2');
          return NextResponse.json({
            success: true,
            message: 'Application restart initiated',
            output: stdout.trim(),
          });
        } catch (error) {
          return NextResponse.json({
            success: false,
            error: 'Failed to restart application: ' + (error instanceof Error ? error.message : 'Unknown error'),
          }, { status: 500 });
        }
      }

      case 'full-update': {
        // Combined action: update SW + cleanup logos
        const results: string[] = [];

        // 1. Update service worker
        const swContent = body.swContent;
        if (swContent && typeof swContent === 'string' && swContent.includes('CACHE_NAME')) {
          const swPath = path.join(PUBLIC_DIR, 'sw.js');
          await writeFile(swPath, swContent, 'utf-8');
          if (existsSync(STANDALONE_PUBLIC_DIR)) {
            await writeFile(path.join(STANDALONE_PUBLIC_DIR, 'sw.js'), swContent, 'utf-8');
          }
          // Also check for other directories
          const extraDirs = ['/home/nexvo/nexvo/public', '/home/nexvo/public'];
          for (const dir of extraDirs) {
            if (existsSync(dir)) {
              try { await writeFile(path.join(dir, 'sw.js'), swContent, 'utf-8'); } catch { /* non-critical */ }
            }
          }
          results.push('Service worker updated');
        }

        // 2. Cleanup logos
        const dirs = [
          PUBLIC_DIR,
          path.join(process.cwd(), 'uploads'),
          STANDALONE_PUBLIC_DIR,
          path.join(process.cwd(), '.next', 'standalone', 'uploads'),
          '/home/nexvo/nexvo/public',
          '/home/nexvo/nexvo/uploads',
          '/home/nexvo/public',
          '/home/nexvo/uploads',
        ];

        let deletedCount = 0;
        for (const dir of dirs) {
          if (!existsSync(dir)) continue;
          try {
            const files = await readdir(dir);
            for (const file of files) {
              if (file.startsWith('site-logo-') && file !== 'nexvo-logo.png') {
                try {
                  await unlink(path.join(dir, file));
                  deletedCount++;
                } catch { /* non-critical */ }
              }
            }
          } catch { /* non-critical */ }
        }
        results.push(`Cleaned up ${deletedCount} logo files`);

        // 3. Restart application
        try {
          const { stdout } = await execAsync('pm2 restart nexvo-web 2>/dev/null || pm2 restart all 2>/dev/null || echo "no-pm2"');
          results.push('Application restart initiated');
        } catch {
          results.push('Could not restart application (may need manual restart)');
        }

        await logAdminAction(admin.id, 'DEPLOY_FULL_UPDATE', `Full update: ${results.join(', ')}`);

        return NextResponse.json({
          success: true,
          message: 'Full update completed',
          results,
        });
      }

      case 'replace-logo-file': {
        // Copy the latest uploaded site-logo-* file to nexvo-logo.png in all directories
        const { sourceFile } = body;
        if (!sourceFile || typeof sourceFile !== 'string') {
          return NextResponse.json({ success: false, error: 'sourceFile parameter required (e.g. site-logo-1234567890.png)' }, { status: 400 });
        }

        // Directories to search for the source file and to copy the target
        const allDirs = [
          PUBLIC_DIR,
          path.join(process.cwd(), 'uploads'),
          STANDALONE_PUBLIC_DIR,
          path.join(process.cwd(), '.next', 'standalone', 'uploads'),
          '/home/nexvo/nexvo/public',
          '/home/nexvo/nexvo/uploads',
          '/home/nexvo/public',
          '/home/nexvo/uploads',
        ];

        // Find the source file
        let sourcePath: string | null = null;
        for (const dir of allDirs) {
          const candidate = path.join(dir, sourceFile);
          if (existsSync(candidate)) {
            sourcePath = candidate;
            break;
          }
        }

        if (!sourcePath) {
          return NextResponse.json({ success: false, error: `Source file not found: ${sourceFile}` }, { status: 404 });
        }

        // Copy to nexvo-logo.png and nexvo-logo-shield.png in all directories
        const targetNames = ['nexvo-logo.png', 'nexvo-logo-shield.png'];
        const writtenDirs: string[] = [];

        for (const dir of allDirs) {
          if (!existsSync(dir)) continue;
          for (const targetName of targetNames) {
            const targetPath = path.join(dir, targetName);
            try {
              await copyFile(sourcePath, targetPath);
              writtenDirs.push(`${dir}/${targetName}`);
              console.log(`[DEPLOY] Copied ${sourceFile} -> ${dir}/${targetName}`);
            } catch {
              // Non-critical - might not have write permission
            }
          }
        }

        await logAdminAction(admin.id, 'DEPLOY_REPLACE_LOGO', `Replaced nexvo-logo.png from ${sourceFile} in ${writtenDirs.length} locations`);

        return NextResponse.json({
          success: true,
          message: `Logo file replaced in ${writtenDirs.length} locations`,
          writtenDirs,
        });
      }

      case 'git-deploy': {
        // Full git-based deployment: pull, build, copy static/public, restart PM2
        const results: string[] = [];

        try {
          // 1. Git pull
          const { stdout: pullOut } = await execAsync('cd /home/nexvo/nexvo && git pull origin main 2>&1');
          results.push(`Git pull: ${pullOut.trim().substring(0, 200)}`);
          console.log('[DEPLOY] Git pull:', pullOut.trim());
        } catch (e) {
          results.push(`Git pull failed: ${e instanceof Error ? e.message : 'Unknown'}`);
        }

        try {
          // 2. npm install (in case dependencies changed)
          const { stdout: installOut } = await execAsync('cd /home/nexvo/nexvo && npm install 2>&1');
          results.push('npm install completed');
        } catch (e) {
          results.push(`npm install failed: ${e instanceof Error ? e.message : 'Unknown'}`);
        }

        try {
          // 3. npm run build
          const { stdout: buildOut } = await execAsync('cd /home/nexvo/nexvo && npm run build 2>&1');
          results.push('Build completed');
        } catch (e) {
          results.push(`Build failed: ${e instanceof Error ? e.message : 'Unknown'}`);
        }

        try {
          // 4. Copy static and public dirs to standalone
          await execAsync('cd /home/nexvo/nexvo && cp -r .next/static .next/standalone/.next/ && cp -r public .next/standalone/');
          results.push('Static and public dirs copied to standalone');
        } catch (e) {
          results.push(`Copy dirs failed: ${e instanceof Error ? e.message : 'Unknown'}`);
        }

        try {
          // 5. Restart PM2
          const { stdout: restartOut } = await execAsync('pm2 restart nexvo-web 2>/dev/null || pm2 restart all 2>/dev/null || echo "no-pm2"');
          results.push(`PM2 restart: ${restartOut.trim()}`);
        } catch (e) {
          results.push(`PM2 restart failed: ${e instanceof Error ? e.message : 'Unknown'}`);
        }

        await logAdminAction(admin.id, 'DEPLOY_GIT_DEPLOY', `Git deploy: ${results.join('; ')}`);

        return NextResponse.json({
          success: true,
          message: 'Git deployment completed',
          results,
        });
      }

      default:
        return NextResponse.json({
          success: false,
          error: 'Unknown action. Supported: update-sw, cleanup-logos, restart-app, full-update, replace-logo-file, git-deploy',
        }, { status: 400 });
    }
  } catch (error) {
    console.error('Deploy error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Get current SW version info
    const swPath = path.join(PUBLIC_DIR, 'sw.js');
    let swVersion = 'unknown';
    if (existsSync(swPath)) {
      try {
        const { readFile } = await import('fs/promises');
        const swContent = await readFile(swPath, 'utf-8');
        const match = swContent.match(/CACHE_NAME\s*=\s*'([^']+)'/);
        swVersion = match ? match[1] : 'unknown';
      } catch {
        // Ignore
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        swVersion,
        publicDir: PUBLIC_DIR,
        standaloneExists: existsSync(STANDALONE_PUBLIC_DIR),
      },
    });
  } catch (error) {
    console.error('Deploy info error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

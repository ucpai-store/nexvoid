import { PrismaClient, Prisma } from '@prisma/client'
import path from 'path'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

/**
 * Resolve the SQLite database file path using a bulletproof strategy.
 *
 * Priority order (first EXISTING file with data wins):
 *   1. DATABASE_URL env var (if its file exists)
 *   2. /var/www/nexvo/db/custom.db  (VPS production - CyberPanel/Hostinger)
 *   3. /home/nexvo/db/custom.db     (VPS alt path)
 *   4. <cwd>/db/custom.db           (local dev / fallback)
 *
 * This ensures the app ALWAYS connects to a DB that has real data,
 * even if .env.production points to a wrong/non-existent path.
 */
function resolveDatabasePath(): string {
  const envUrl = process.env.DATABASE_URL

  // Build candidate list (deduped, preserving order)
  const seen = new Set<string>()
  const candidates: string[] = []

  const add = (p: string | null | undefined) => {
    if (!p) return
    const norm = path.resolve(p)
    if (!seen.has(norm)) {
      seen.add(norm)
      candidates.push(norm)
    }
  }

  // 1. Env var path
  if (envUrl && envUrl.startsWith('file:')) {
    add(envUrl.replace(/^file:/, ''))
  }

  // 2-3. Known VPS paths
  add('/var/www/nexvo/db/custom.db')
  add('/home/nexvo/db/custom.db')

  // 4. CWD fallback
  add(path.resolve(process.cwd(), 'db', 'custom.db'))

  // Pick the first candidate that exists as a non-empty file.
  // NOTE: Use eval('require') to avoid the bundler statically resolving 'fs'
  // (db.ts is transitively imported by client components, so a top-level
  // `import fs from 'fs'` breaks the browser bundle).
  let existsSync: (p: string) => boolean = () => false
  let statSync: (p: string) => { size: number } = () => ({ size: 0 })
  if (typeof window === 'undefined') {
    try {
      const fs = eval('require')('fs')
      existsSync = fs.existsSync
      statSync = fs.statSync
    } catch {
      // ignore — will fall through to env/cwd default
    }
  }

  for (const p of candidates) {
    try {
      if (existsSync(p) && statSync(p).size > 0) {
        if (envUrl && path.resolve(envUrl.replace(/^file:/, '')) !== p) {
          console.warn(`[DB] DATABASE_URL points to a missing/empty file. Using existing DB at: ${p}`)
        }
        return `file:${p}`
      }
    } catch {
      // ignore stat errors
    }
  }

  // Nothing exists yet — use env if set, otherwise cwd fallback (will be created)
  if (envUrl) return envUrl
  const fallback = path.resolve(process.cwd(), 'db', 'custom.db')
  console.warn(`[DB] No existing DB found. Will use: file:${fallback}`)
  return `file:${fallback}`
}

function createPrismaClient(): PrismaClient {
  const connectionString = resolveDatabasePath()

  const isPostgreSQL = connectionString.startsWith('postgresql://') || connectionString.startsWith('postgres://')

  const clientOptions: Prisma.PrismaClientOptions = {}

  if (isPostgreSQL) {
    let url = connectionString
    if (!url.includes('pgbouncer=true') && !url.includes('channel_binding')) {
      url += (url.includes('?') ? '&' : '?') + 'pgbouncer=true'
    }
    clientOptions.datasourceUrl = url
  } else {
    clientOptions.datasourceUrl = connectionString
  }

  return new PrismaClient(clientOptions)
}

export const db = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

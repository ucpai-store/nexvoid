import { PrismaClient, Prisma } from '@prisma/client'
import path from 'path'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient(): PrismaClient {
  let connectionString = process.env.DATABASE_URL

  // If DATABASE_URL is not set, fall back to a default SQLite path at <cwd>/db/custom.db.
  // This makes the app resilient even if .env is missing at runtime (e.g. on a fresh VPS
  // where someone forgot to run setup-env, or if .env was accidentally deleted).
  // scripts/setup-env.mjs normally creates .env automatically, but this is a safety net.
  if (!connectionString) {
    const fallbackPath = path.resolve(process.cwd(), 'db', 'custom.db')
    connectionString = `file:${fallbackPath}`
    console.warn(`[DB] DATABASE_URL not set — falling back to ${connectionString}. Run 'bun run db:push' to initialize the schema.`)
  }

  const isPostgreSQL = connectionString.startsWith('postgresql://') || connectionString.startsWith('postgres://')

  // For Neon PostgreSQL on Vercel, use the pooled connection string with pgBouncer mode
  // For SQLite locally, use the standard client
  const clientOptions: Prisma.PrismaClientOptions = {}

  if (isPostgreSQL) {
    // Neon pooler URL already ends in -pooler, so we can use it directly
    // Add pgBouncer mode for serverless compatibility
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

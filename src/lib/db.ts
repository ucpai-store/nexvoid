import { PrismaClient, Prisma } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL

  // If DATABASE_URL is not set (e.g., on client-side), return a dummy client
  // This prevents crashes when the module is accidentally imported in client code
  if (!connectionString) {
    // On the client side, Prisma should never be used. Return a client that will
    // throw a helpful error if someone tries to use it.
    console.warn('[DB] DATABASE_URL not set - database operations will fail. This is expected on the client side.')
    // Use an empty SQLite connection string as fallback - it won't work but prevents crash at import time
    return new PrismaClient({ datasourceUrl: 'file:./nonexistent.db' })
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

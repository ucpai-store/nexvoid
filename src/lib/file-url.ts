/**
 * Shared utility for converting file paths to URLs.
 *
 * On Vercel, uploaded files are stored in Vercel Blob (https://... URLs).
 * Static files bundled with the app are served from /public (e.g. /nexvo-logo.png).
 *
 * This utility handles both cases:
 * - Vercel Blob URLs (https://...) are returned as-is
 * - Static paths (/nexvo-logo.png) are returned as-is
 * - Legacy uploaded file paths (/site-logo-xxx, /upload-xxx) route through /api/files/
 */

/**
 * Patterns that indicate a dynamically uploaded file (legacy format).
 * These files should be served through the /api/files/ route to avoid caching issues.
 * On Vercel, new uploads go to Vercel Blob and return https:// URLs directly.
 */
const UPLOADED_FILE_PATTERNS = [
  '/site-logo-',   // Logo uploads
  '/upload-',      // General file uploads
  '/uploads/',     // Files uploaded via /api/upload
  '/banner-',      // Banner uploads (if any)
];

/**
 * Check if a path refers to a dynamically uploaded file (legacy format).
 */
function isUploadedFilePath(path: string): boolean {
  if (!path) return false;
  return UPLOADED_FILE_PATTERNS.some(pattern => path.startsWith(pattern));
}

/**
 * Convert a file path from the database to a URL that the browser can fetch.
 *
 * - https://... → return as-is (Vercel Blob URL)
 * - /api/... → return as-is (already going through API)
 * - http://... → return as-is (external URL)
 * - /site-logo-xxx, /upload-xxx, etc. → prefix with /api/files/ (legacy)
 * - /nexvo-logo.png or other static paths → return as-is
 *
 * @param path - The file path from the database or API response
 * @param addCacheBuster - Whether to add a cache buster timestamp (default: true for uploaded files)
 * @returns A URL that will serve the file without caching issues
 */
export function getFileUrl(path: string, addCacheBuster: boolean = true): string {
  if (!path) return path;

  // Vercel Blob URLs or external URLs - return as-is
  if (path.startsWith('https://') || path.startsWith('http://') || path.startsWith('/api/')) {
    return path;
  }

  // Legacy dynamically uploaded files - route through /api/files/ to avoid caching
  if (isUploadedFilePath(path)) {
    // Remove leading slash: /site-logo-xxx.jpeg → site-logo-xxx.jpeg
    const filename = path.startsWith('/') ? path.slice(1) : path;
    const url = `/api/files/${filename}`;
    if (addCacheBuster) {
      return `${url}?t=${Date.now()}`;
    }
    return url;
  }

  // Static files (like /nexvo-logo.png) - return as-is
  return path;
}

/**
 * Convert a file path for display purposes (without cache buster).
 * Useful for forms where you don't want the timestamp changing on every render.
 */
export function getFileUrlStatic(path: string): string {
  return getFileUrl(path, false);
}

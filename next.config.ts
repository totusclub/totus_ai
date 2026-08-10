import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { NextConfig } from 'next'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BACKEND = process.env.BACKEND_URL ?? 'http://localhost:3011'

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname),
  transpilePackages: ['@tosmedia/ai-assistant'],
  async rewrites() {
    // Local/dev convenience. In production ai.totus.club talks directly to apiv2.totus.club.
    if (process.env.NEXT_PUBLIC_API_URL?.startsWith('http')) {
      return []
    }
    return [
      {
        source: '/api/:path*',
        destination: `${BACKEND}/api/:path*`,
      },
      {
        source: '/ws/:path*',
        destination: `${BACKEND}/ws/:path*`,
      },
    ]
  },
}

export default nextConfig

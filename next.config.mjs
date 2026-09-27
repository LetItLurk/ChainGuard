/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable standalone output for Docker deployments (Dockerfile.frontend)
  output: process.env.DOCKER_BUILD ? 'standalone' : undefined,

  images: {
    unoptimized: true,
  },

  // Security headers applied to every response
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
      // Never cache API responses in the browser
      {
        source: '/api/(.*)',
        headers: [
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate' },
        ],
      },
    ]
  },

  // Packages that should always run in the Node.js runtime (not edge).
  // 'server-only' is already handled by Next.js natively.
  serverExternalPackages: ['server-only'],
}

export default nextConfig

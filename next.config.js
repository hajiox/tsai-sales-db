/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  async rewrites() {
    return [
      // 旧実装の fetch('/sales/dashboard') を API に転送
      { source: '/sales/dashboard', destination: '/api/sales/dashboard' },
    ]
  },
}

module.exports = nextConfig

// ver.1 (2025-08-19 JST) - rename to mjs for ESM
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
      // 旧フロント残骸の fetch('/sales/dashboard') を API へ転送
      { source: '/sales/dashboard', destination: '/api/sales/dashboard' },
    ]
  },
}
export default nextConfig

// ver.1 (2025-08-19 JST) - rename to mjs for ESM
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['puppeteer', 'pdf-parse', 'pdfjs-dist', '@napi-rs/canvas'],
  outputFileTracingIncludes: {
    '/api/finance/annual-statements': [
      './node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs',
      './node_modules/@napi-rs/canvas/**/*',
      './node_modules/@napi-rs/canvas-linux-x64-gnu/**/*',
      './node_modules/@napi-rs/canvas-linux-arm64-gnu/**/*',
    ],
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

import pkg from './package.json' assert { type: 'json' }

/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  env: {
    NEXT_PUBLIC_SUPABASE_URL:
      process.env.NEXT_PUBLIC_SUPABASE_URL || pkg.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      pkg.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_URL:
      process.env.SUPABASE_URL || pkg.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_ANON_KEY:
      process.env.SUPABASE_ANON_KEY || pkg.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  },
}

export default nextConfig


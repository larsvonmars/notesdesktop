/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: {
    unoptimized: true,
  },
  // Explicitly forward DEEPSEEK_API_KEY at build time without the NEXT_PUBLIC_ auto-exposure mechanism
  env: {
    DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
  },
}

module.exports = nextConfig

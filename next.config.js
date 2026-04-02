/** @type {import('next').NextConfig} */
const isTauriStaticExport = process.env.TAURI_STATIC_EXPORT === 'true'
const isStandalone = process.env.NEXT_STANDALONE === 'true'

const nextConfig = {
  ...(isTauriStaticExport
    ? { output: 'export' }
    : isStandalone
      ? { output: 'standalone' }
      : {}),
  images: {
    unoptimized: true,
  },
}

module.exports = nextConfig

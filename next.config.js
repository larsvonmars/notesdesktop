/** @type {import('next').NextConfig} */
const isTauriStaticExport = process.env.TAURI_STATIC_EXPORT === 'true'

const nextConfig = {
  ...(isTauriStaticExport ? { output: 'export' } : {}),
  images: {
    unoptimized: true,
  },
}

module.exports = nextConfig

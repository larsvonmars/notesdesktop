import type { Metadata, Viewport } from 'next'
import './globals.css'
import { AuthProvider } from '@/lib/auth-context'
import { WebViewPolyfillsInitializer } from '@/components/WebViewPolyfillsInitializer'
import ToastProvider from '@/components/ToastProvider'

export const metadata: Metadata = {
  title: 'Saentis Notes',
  description: 'A beautifully crafted Alpine-themed desktop notes app',
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Saentis Notes',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover', // enables safe-area-inset env() on iOS
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="safe-top">
        <WebViewPolyfillsInitializer />
        <AuthProvider>
          <ToastProvider>{children}</ToastProvider>
        </AuthProvider>
      </body>
    </html>
  )
}

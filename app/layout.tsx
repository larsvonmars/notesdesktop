import type { Metadata } from 'next'
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
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <WebViewPolyfillsInitializer />
        <AuthProvider>
          <ToastProvider>{children}</ToastProvider>
        </AuthProvider>
      </body>
    </html>
  )
}

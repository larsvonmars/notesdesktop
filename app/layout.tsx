import type { Metadata } from 'next'
import './globals.css'
import { AuthProvider } from '@/lib/auth-context'
import { WebViewPolyfillsInitializer } from '@/components/WebViewPolyfillsInitializer'
import ToastProvider from '@/components/ToastProvider'

export const metadata: Metadata = {
  title: 'Notes Desktop',
  description: 'A desktop notes app with Supabase authentication',
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

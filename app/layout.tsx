import type { Metadata, Viewport } from 'next'
import { Inter, Manrope } from 'next/font/google'
import './globals.css'
import { AuthProvider } from '@/lib/auth-context'
import { ThemeProvider } from '@/lib/theme-context'
import { WebViewPolyfillsInitializer } from '@/components/WebViewPolyfillsInitializer'
import ToastProvider from '@/components/ToastProvider'
import CookieConsentBanner from '@/components/CookieConsentBanner'
import ErrorBoundary from '@/components/ErrorBoundary'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-manrope',
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'MindViz Notes',
  description: 'A powerful mind-mapping and note-taking desktop app',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'MindViz Notes',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover', // enables safe-area-inset env() on iOS
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#eef0fa' },
    { media: '(prefers-color-scheme: dark)', color: '#08070f' },
  ],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${manrope.variable}`}>
      <head>
        {/* Inline script to apply dark class before first paint — prevents flash */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var q=new URLSearchParams(window.location.search).get('theme');var t=(q==='dark'||q==='light')?q:localStorage.getItem('theme');var d=t==='dark'||(t!=='light'&&window.matchMedia('(prefers-color-scheme:dark)').matches);if(d)document.documentElement.classList.add('dark')}catch(e){}})()`,
          }}
        />
      </head>
      <body className="safe-top bg-background font-sans text-foreground antialiased">
        <WebViewPolyfillsInitializer />
        <ThemeProvider>
          <AuthProvider>
            <ToastProvider><ErrorBoundary>{children}</ErrorBoundary></ToastProvider>
          </AuthProvider>
          <CookieConsentBanner />
        </ThemeProvider>
      </body>
    </html>
  )
}
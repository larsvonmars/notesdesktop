import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../lib/supabase', async () => {
  const mod = await import('./__mocks__/supabase.mock')
  return { supabase: mod.supabase }
})

import ToastProvider from '@/components/ToastProvider'
import { LearningProvider } from '@/lib/learn/context'
import LearnView from '@/components/learn/LearnView'

describe('Learn view shell', () => {
  it('renders the dashboard chrome and navigation tabs', () => {
    const html = renderToStaticMarkup(
      <ToastProvider>
        <LearningProvider>
          <LearnView onOpenAppSettings={vi.fn()} showSectionTabs />
        </LearningProvider>
      </ToastProvider>
    )

    expect(html).toContain('Learn')
    for (const tab of ['Dashboard', 'Decks', 'Progress', 'Settings']) {
      expect(html).toContain(tab)
    }
  })
})

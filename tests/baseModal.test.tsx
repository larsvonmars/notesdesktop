import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect } from 'vitest'
import BaseModal, { ModalTitle } from '@/components/BaseModal'

describe('BaseModal semantics', () => {
  it('renders nothing when closed', () => {
    const html = renderToStaticMarkup(
      <BaseModal isOpen={false} onClose={() => {}}>
        content
      </BaseModal>
    )
    expect(html).toBe('')
  })

  it('exposes dialog semantics and the rendered title', () => {
    const html = renderToStaticMarkup(
      <BaseModal isOpen onClose={() => {}}>
        <ModalTitle>My dialog</ModalTitle>
        <button type="button">Action</button>
      </BaseModal>
    )

    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-modal="true"')
    expect(html).toContain('tabindex="-1"')
    expect(html).toContain('My dialog')
  })

  it('does not claim dialog semantics in full-view mode', () => {
    const html = renderToStaticMarkup(
      <BaseModal isOpen asView onClose={() => {}}>
        view
      </BaseModal>
    )

    expect(html).not.toContain('role="dialog"')
    expect(html).toContain('view')
  })
})

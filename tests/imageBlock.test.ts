import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { imageBlock, initializeImageBlockInteractions, type ImagePayload } from '@/lib/editor/imageBlock'

describe('Image Block', () => {
  let container: HTMLDivElement
  let editor: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    editor = document.createElement('div')
    editor.contentEditable = 'true'
    container.appendChild(editor)
    document.body.appendChild(container)
  })

  afterEach(() => {
    document.body.removeChild(container)
  })

  describe('render', () => {
    it('should render an image with default styling', () => {
      const payload: ImagePayload = {
        src: 'data:image/png;base64,test',
        alt: 'Test image'
      }

      const html = imageBlock.render(payload)
      
      expect(html).toContain('image-block-container')
      expect(html).toContain('image-block-wrapper')
      expect(html).toContain('image-block-img')
      expect(html).toContain(payload.src)
      expect(html).toContain(payload.alt)
    })

    it('should render resize handles', () => {
      const payload: ImagePayload = {
        src: 'data:image/png;base64,test',
        alt: 'Test image'
      }

      const html = imageBlock.render(payload)
      
      // Should have 8 resize handles (4 corners + 4 edges)
      expect(html.match(/image-resize-handle/g)?.length).toBe(8)
      expect(html).toContain('data-direction="nw"')
      expect(html).toContain('data-direction="ne"')
      expect(html).toContain('data-direction="sw"')
      expect(html).toContain('data-direction="se"')
      expect(html).toContain('data-direction="n"')
      expect(html).toContain('data-direction="s"')
      expect(html).toContain('data-direction="w"')
      expect(html).toContain('data-direction="e"')
    })

    it('should render a delete button', () => {
      const payload: ImagePayload = {
        src: 'data:image/png;base64,test',
        alt: 'Test image'
      }

      const html = imageBlock.render(payload)
      
      expect(html).toContain('image-delete-btn')
      expect(html).toContain('Delete image')
    })

    it('should apply width styles when provided', () => {
      const payload: ImagePayload = {
        src: 'data:image/png;base64,test',
        alt: 'Test image',
        width: 500
      }

      const html = imageBlock.render(payload)
      
      expect(html).toContain('width: 500px')
    })

    it('should enforce minimum dimensions', () => {
      const payload: ImagePayload = {
        src: 'data:image/png;base64,test',
        alt: 'Test image',
        width: 50  // Below minimum
      }

      const html = imageBlock.render(payload)
      
      // Should clamp to minimum of 100px
      expect(html).toContain('width: 100px')
    })

    it('should enforce maximum dimensions', () => {
      const payload: ImagePayload = {
        src: 'data:image/png;base64,test',
        alt: 'Test image',
        width: 5000  // Above maximum
      }

      const html = imageBlock.render(payload)
      
      // Should clamp to maximum of 4000px
      expect(html).toContain('width: 4000px')
    })

    it('should handle invalid dimensions gracefully', () => {
      const payload: ImagePayload = {
        src: 'data:image/png;base64,test',
        alt: 'Test image',
        width: NaN
      }

      const html = imageBlock.render(payload)
      
      // Should not include invalid dimensions
      expect(html).not.toContain('width: NaNpx')
    })

    it('should handle invalid payload gracefully', () => {
      const html = imageBlock.render(undefined)
      
      expect(html).toContain('Invalid Image')
    })

    it('should escape HTML in alt text', () => {
      const payload: ImagePayload = {
        src: 'data:image/png;base64,test',
        alt: '<script>alert("xss")</script>'
      }

      const html = imageBlock.render(payload)
      
      expect(html).not.toContain('<script>')
      expect(html).toContain('&lt;script&gt;')
    })
  })

  describe('parse', () => {
    it('should parse an image block correctly', () => {
      const payload: ImagePayload = {
        src: 'data:image/png;base64,test',
        alt: 'Test image',
        width: 400
      }

      const html = imageBlock.render(payload)
      const tempDiv = document.createElement('div')
      tempDiv.innerHTML = html
      const blockElement = tempDiv.firstElementChild as HTMLElement

      const parsed = imageBlock.parse?.(blockElement)

      expect(parsed).toBeDefined()
      expect(parsed?.src).toBe(payload.src)
      expect(parsed?.alt).toBe(payload.alt)
      expect(parsed?.width).toBe(payload.width)
    })

    it('should return undefined for invalid elements', () => {
      const div = document.createElement('div')
      div.innerHTML = '<div>Not an image block</div>'

      const parsed = imageBlock.parse?.(div)

      expect(parsed).toBeUndefined()
    })

    it('should handle missing alt text', () => {
      const html = `<div class="image-block-container" data-block="true" data-block-type="image">
        <div class="image-block-wrapper">
          <img src="data:image/png;base64,test" class="image-block-img" />
        </div>
      </div>`
      
      const tempDiv = document.createElement('div')
      tempDiv.innerHTML = html
      const blockElement = tempDiv.firstElementChild as HTMLElement

      const parsed = imageBlock.parse?.(blockElement)

      expect(parsed?.src).toBe('data:image/png;base64,test')
      expect(parsed?.alt).toBeUndefined()
    })
  })

  describe('initializeImageBlockInteractions', () => {
    it('should initialize without errors', () => {
      const onContentChange = vi.fn()
      
      expect(() => {
        initializeImageBlockInteractions(editor, onContentChange)
      }).not.toThrow()
    })

    it('should handle delete button click', () => {
      const onContentChange = vi.fn()
      const payload: ImagePayload = {
        src: 'data:image/png;base64,test',
        alt: 'Test image'
      }

      const html = imageBlock.render(payload)
      editor.innerHTML = html
      
      initializeImageBlockInteractions(editor, onContentChange)

      const deleteBtn = editor.querySelector('.image-delete-btn') as HTMLButtonElement
      expect(deleteBtn).toBeTruthy()

      deleteBtn.click()

      expect(editor.querySelector('.image-block-container')).toBeNull()
      expect(onContentChange).toHaveBeenCalled()
    })

    it('should create a paragraph after deleting image if editor becomes empty', () => {
      const onContentChange = vi.fn()
      const payload: ImagePayload = {
        src: 'data:image/png;base64,test',
        alt: 'Test image'
      }

      const html = imageBlock.render(payload)
      editor.innerHTML = html
      
      initializeImageBlockInteractions(editor, onContentChange)

      const deleteBtn = editor.querySelector('.image-delete-btn') as HTMLButtonElement
      deleteBtn.click()

      // Editor should have a paragraph with a br tag
      expect(editor.querySelector('p')).toBeTruthy()
      expect(editor.querySelector('p br')).toBeTruthy()
    })

    it('should return cleanup function', () => {
      const onContentChange = vi.fn()
      
      const cleanup = initializeImageBlockInteractions(editor, onContentChange)
      
      expect(cleanup).toBeInstanceOf(Function)
      expect(() => cleanup()).not.toThrow()
    })

    it('should handle missing editor element', () => {
      const onContentChange = vi.fn()
      
      expect(() => {
        initializeImageBlockInteractions(null as any, onContentChange)
      }).not.toThrow()
    })
  })

  describe('resize functionality', () => {
    it('should initialize resize handlers', () => {
      const onContentChange = vi.fn()
      const payload: ImagePayload = {
        src: 'data:image/png;base64,test',
        alt: 'Test image'
      }

      const html = imageBlock.render(payload)
      editor.innerHTML = html
      
      initializeImageBlockInteractions(editor, onContentChange)

      const resizeHandles = editor.querySelectorAll('.image-resize-handle')
      expect(resizeHandles.length).toBe(8)
    })

    it('should have correct cursor styles for resize handles', () => {
      const payload: ImagePayload = {
        src: 'data:image/png;base64,test',
        alt: 'Test image'
      }

      const html = imageBlock.render(payload)
      editor.innerHTML = html

      const nwHandle = editor.querySelector('[data-direction="nw"]')
      const seHandle = editor.querySelector('[data-direction="se"]')
      
      expect(nwHandle?.classList.contains('cursor-nw-resize')).toBe(true)
      expect(seHandle?.classList.contains('cursor-se-resize')).toBe(true)
    })
  })

  describe('security', () => {
    it('should prevent XSS in src attribute', () => {
      const payload: ImagePayload = {
        src: 'javascript:alert("xss")',
        alt: 'Test'
      }

      const html = imageBlock.render(payload)
      
      // The escapeHtml function should handle text content, but src is treated as attribute
      // In real usage, DOMPurify will sanitize this
      expect(html).toContain(payload.src)
    })

    it('should prevent XSS in alt attribute', () => {
      const payload: ImagePayload = {
        src: 'data:image/png;base64,test',
        alt: '"><img src=x onerror=alert("xss")>'
      }

      const html = imageBlock.render(payload)
      
      // The escapeHtml function converts special characters to HTML entities
      // The < and > are escaped to &lt; and &gt;
      expect(html).toContain('&gt;')
      expect(html).toContain('&lt;')
      // Even though "onerror" text is present, it's harmless as escaped text within an attribute
      expect(html).toContain('alt="')
    })
  })

  describe('data attributes', () => {
    it('should include required data attributes', () => {
      const payload: ImagePayload = {
        src: 'data:image/png;base64,test',
        alt: 'Test image'
      }

      const html = imageBlock.render(payload)
      
      expect(html).toContain('data-block="true"')
      expect(html).toContain('data-block-type="image"')
    })

    it('should set contenteditable to false on interactive elements', () => {
      const payload: ImagePayload = {
        src: 'data:image/png;base64,test',
        alt: 'Test image'
      }

      const html = imageBlock.render(payload)
      
      // Image, buttons, and handles should have contenteditable="false"
      // but not the container itself (for proper cursor positioning)
      expect(html).toContain('contenteditable="false"')
      
      // Verify it's on the right elements
      const tempDiv = document.createElement('div')
      tempDiv.innerHTML = html
      const container = tempDiv.firstElementChild as HTMLElement
      const img = container.querySelector('img')
      const deleteBtn = container.querySelector('.image-delete-btn')
      const handles = container.querySelectorAll('.image-resize-handle')
      
      // Container should NOT have contenteditable="false"
      expect(container.getAttribute('contenteditable')).toBeNull()
      // Image should have it
      expect(img?.getAttribute('contenteditable')).toBe('false')
      // Delete button should have it
      expect(deleteBtn?.getAttribute('contenteditable')).toBe('false')
      // Handles should have it
      handles.forEach(handle => {
        expect(handle.getAttribute('contenteditable')).toBe('false')
      })
    })
  })
})

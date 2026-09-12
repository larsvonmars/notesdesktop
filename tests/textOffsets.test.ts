import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  findTextPosition,
  getElementText,
  getTextOffsetInBlock,
} from '../lib/editor/textOffsets'

describe('textOffsets', () => {
  let block: HTMLParagraphElement

  beforeEach(() => {
    block = document.createElement('p')
    document.body.appendChild(block)
  })

  afterEach(() => {
    block.remove()
  })

  describe('getElementText', () => {
    it('concatenates text nodes the way Range.toString does', () => {
      block.innerHTML = 'a<strong>b</strong>c<br>d'
      expect(getElementText(block)).toBe('abcd')
    })

    it('is empty for an empty block', () => {
      block.innerHTML = '<br>'
      expect(getElementText(block)).toBe('')
    })
  })

  describe('getTextOffsetInBlock', () => {
    it('counts characters up to a caret inside a nested text node', () => {
      block.innerHTML = 'a<strong>bc</strong>d'
      const strongText = block.querySelector('strong')!.firstChild as Text

      expect(getTextOffsetInBlock(block, strongText, 1)).toBe(2)
      expect(getTextOffsetInBlock(block, strongText, 2)).toBe(3)
    })

    it('handles a caret at the very end and ignores <br>', () => {
      block.innerHTML = 'ab<br>cd'
      const last = block.lastChild as Text

      expect(getTextOffsetInBlock(block, last, 2)).toBe(4)
      expect(getTextOffsetInBlock(block, block, block.childNodes.length)).toBe(4)
    })

    it('rejects carets outside of the block', () => {
      const other = document.createElement('p')
      other.textContent = 'x'
      document.body.appendChild(other)

      expect(getTextOffsetInBlock(block, other.firstChild!, 1)).toBeNull()
      other.remove()
    })
  })

  describe('findTextPosition', () => {
    it('maps offsets back to the text node that contains them', () => {
      block.innerHTML = 'a<strong>bc</strong>d'
      const strongText = block.querySelector('strong')!.firstChild as Text

      expect(findTextPosition(block, 0)).toEqual({ node: block.firstChild, offset: 0 })
      expect(findTextPosition(block, 3)).toEqual({ node: strongText, offset: 2 })
      // Offset 2 sits at the very end of the bold run — a valid caret position.
      expect(findTextPosition(block, 2)).toEqual({ node: strongText, offset: 1 })
    })

    it('returns null for offsets beyond the text', () => {
      block.innerHTML = 'ab'
      expect(findTextPosition(block, 3)).toBeNull()
      expect(findTextPosition(block, -1)).toBeNull()
    })

    it('round-trips with getTextOffsetInBlock', () => {
      block.innerHTML = 'one <em>two</em> <u>three</u>'

      for (let offset = 0; offset < getElementText(block).length; offset += 1) {
        const position = findTextPosition(block, offset)
        expect(position).not.toBeNull()
        expect(getTextOffsetInBlock(block, position!.node, position!.offset)).toBe(offset)
      }
    })
  })
})

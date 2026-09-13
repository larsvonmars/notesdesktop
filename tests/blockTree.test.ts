import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  MAX_BLOCK_LEVEL,
  getBlockLevel,
  getDescendants,
  getParentBlock,
  getSubtree,
  getVisibleBlocks,
  hasChildBlocks,
  isCollapsed,
  isHiddenBlock,
  setBlockLevel,
  setCollapsed,
  shiftSubtreeLevel,
  updateCollapsedVisibility,
} from '../lib/editor/blockTree'
import { indentBlock } from '../lib/editor/blockTools'

describe('blockTree', () => {
  let editor: HTMLDivElement

  beforeEach(() => {
    editor = document.createElement('div')
    editor.contentEditable = 'true'
    document.body.appendChild(editor)
  })

  afterEach(() => {
    editor.remove()
  })

  /** Build a flat block list: [tag, level] pairs. */
  const build = (spec: Array<[string, number]>): HTMLElement[] => {
    editor.innerHTML = spec
      .map(
        ([tag, level], index) =>
          `<${tag}${level > 0 ? ` data-indent="${level}"` : ''}>${tag}${index}</${tag}>`
      )
      .join('')
    return Array.from(editor.children) as HTMLElement[]
  }

  const names = (blocks: HTMLElement[]) => blocks.map((block) => block.tagName)

  describe('levels', () => {
    it('reads levels, clamps them and drops the attribute at zero', () => {
      const [block] = build([['p', 0]])

      expect(getBlockLevel(block)).toBe(0)
      expect(setBlockLevel(block, 2)).toBe(true)
      expect(getBlockLevel(block)).toBe(2)
      expect(setBlockLevel(block, 99)).toBe(true)
      expect(getBlockLevel(block)).toBe(MAX_BLOCK_LEVEL)
      expect(setBlockLevel(block, 0)).toBe(true)
      expect(block.hasAttribute('data-indent')).toBe(false)

      block.setAttribute('data-indent', 'nonsense')
      expect(getBlockLevel(block)).toBe(0)
      expect(getBlockLevel(null)).toBe(0)
    })
  })

  describe('structure', () => {
    it('collects the subtree and descendants of a block', () => {
      const [h2, p1, p2, p3] = build([
        ['h2', 0],
        ['p', 1],
        ['p', 2],
        ['p', 1],
      ])

      expect(getSubtree(editor, h2)).toEqual([h2, p1, p2, p3])
      expect(getDescendants(editor, h2)).toEqual([p1, p2, p3])
      expect(getSubtree(editor, p1)).toEqual([p1, p2])
      expect(getSubtree(editor, p3)).toEqual([p3])

      const detached = document.createElement('p')
      expect(getSubtree(editor, detached)).toEqual([])
    })

    it('knows which blocks have children', () => {
      const [h2, p1, p2, p3] = build([
        ['h2', 0],
        ['p', 1],
        ['p', 2],
        ['p', 0],
      ])

      expect(hasChildBlocks(editor, h2)).toBe(true)
      expect(hasChildBlocks(editor, p1)).toBe(true)
      expect(hasChildBlocks(editor, p2)).toBe(false)
      expect(hasChildBlocks(editor, p3)).toBe(false)
    })

    it('finds the parent of a block', () => {
      const [h2, p1, p2, tail] = build([
        ['h2', 0],
        ['p', 1],
        ['p', 2],
        ['p', 0],
      ])

      expect(getParentBlock(editor, h2)).toBeNull()
      expect(getParentBlock(editor, p1)).toBe(h2)
      expect(getParentBlock(editor, p2)).toBe(p1)
      expect(getParentBlock(editor, tail)).toBeNull()
    })
  })

  describe('collapse', () => {
    it('hides the subtree of a collapsed block and shows it again', () => {
      const [h2, p1, p2, tail] = build([
        ['h2', 0],
        ['p', 1],
        ['p', 1],
        ['p', 0],
      ])

      expect(isCollapsed(h2)).toBe(false)
      expect(setCollapsed(h2, true)).toBe(true)
      expect(updateCollapsedVisibility(editor)).toBe(true)

      expect(isHiddenBlock(p1)).toBe(true)
      expect(isHiddenBlock(p2)).toBe(true)
      expect(isHiddenBlock(h2)).toBe(false)
      expect(isHiddenBlock(tail)).toBe(false)
      expect(names(getVisibleBlocks(editor))).toEqual(['H2', 'P'])

      expect(setCollapsed(h2, false)).toBe(true)
      expect(updateCollapsedVisibility(editor)).toBe(true)
      expect(isHiddenBlock(p1)).toBe(false)
    })

    it('handles nested collapsed blocks', () => {
      const [h2, h3, deep, tail] = build([
        ['h2', 0],
        ['h3', 1],
        ['p', 2],
        ['p', 0],
      ])

      setCollapsed(h3, true)
      updateCollapsedVisibility(editor)
      expect(isHiddenBlock(h3)).toBe(false) // its own parent is open
      expect(isHiddenBlock(deep)).toBe(true)

      setCollapsed(h2, true)
      updateCollapsedVisibility(editor)
      expect(isHiddenBlock(h3)).toBe(true)
      expect(isHiddenBlock(deep)).toBe(true)
      expect(isHiddenBlock(tail)).toBe(false)
    })

    it('clears markers left behind when a collapsed parent disappears', () => {
      const [h2, child] = build([
        ['h2', 0],
        ['p', 1],
      ])

      setCollapsed(h2, true)
      updateCollapsedVisibility(editor)
      expect(isHiddenBlock(child)).toBe(true)

      h2.remove()
      expect(updateCollapsedVisibility(editor)).toBe(true)
      expect(isHiddenBlock(child)).toBe(false)
    })

    it('reports no changes when nothing is collapsed', () => {
      build([
        ['h2', 0],
        ['p', 1],
      ])

      expect(updateCollapsedVisibility(editor)).toBe(false)
      expect(updateCollapsedVisibility(editor)).toBe(false)
    })

    it('ignores collapsed markers on blocks without children', () => {
      const [h2, tail] = build([
        ['h2', 0],
        ['p', 0],
      ])

      setCollapsed(h2, true)
      updateCollapsedVisibility(editor)
      expect(isHiddenBlock(tail)).toBe(false)
    })
  })

  describe('subtree level shifts', () => {
    it('moves a parent and its children together', () => {
      const [h2, p1, p2] = build([
        ['h2', 0],
        ['p', 1],
        ['p', 2],
      ])

      expect(shiftSubtreeLevel(editor, h2, 1)).toBe(true)
      expect([h2, p1, p2].map(getBlockLevel)).toEqual([1, 2, 3])
      // Further indenting would push the deepest child over the limit.
      expect(shiftSubtreeLevel(editor, h2, 1)).toBe(false)

      expect(shiftSubtreeLevel(editor, h2, -1)).toBe(true)
      expect([h2, p1, p2].map(getBlockLevel)).toEqual([0, 1, 2])
      expect(shiftSubtreeLevel(editor, h2, -1)).toBe(false)
    })

    it('keeps children attached through the editor helper', () => {
      const [h2, p1] = build([
        ['h2', 0],
        ['p', 1],
      ])

      expect(indentBlock(h2, 1)).toBe(true)
      expect(getBlockLevel(h2)).toBe(1)
      expect(getBlockLevel(p1)).toBe(2)
      expect(getParentBlock(editor, p1)).toBe(h2)

      expect(indentBlock(h2, -1)).toBe(true)
      expect([getBlockLevel(h2), getBlockLevel(p1)]).toEqual([0, 1])
    })
  })
})

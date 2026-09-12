import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  MAX_SEARCH_MATCHES,
  collectSearchableTextNodes,
  findMatches,
  matchRange,
  replaceMatches,
  type SearchMatch,
} from '../lib/editor/searchMatches'

describe('searchMatches', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    container.contentEditable = 'true'
    document.body.appendChild(container)
  })

  afterEach(() => {
    container.remove()
  })

  describe('findMatches', () => {
    it('finds every occurrence in document order', () => {
      container.innerHTML = '<p>cat dog cat</p><p>another cat</p>'
      const matches = findMatches(container, 'cat')

      expect(matches).toHaveLength(3)
      expect(matches.map((m) => m.start)).toEqual([0, 8, 8])
      expect(matches.map((m) => m.node.data)).toEqual([
        'cat dog cat',
        'cat dog cat',
        'another cat',
      ])
    })

    it('is case-insensitive by default and honours caseSensitive', () => {
      container.innerHTML = '<p>Cat cat CAT</p>'

      expect(findMatches(container, 'cat')).toHaveLength(3)
      expect(findMatches(container, 'cat', { caseSensitive: true })).toHaveLength(1)

      const [match] = findMatches(container, 'CAT', { caseSensitive: true })
      expect(match.start).toBe(8)
    })

    it('supports whole-word matching', () => {
      container.innerHTML = '<p>cat concatenate cat.</p>'

      // "cat", the "cat" inside "concatenate", and the final "cat."
      expect(findMatches(container, 'cat')).toHaveLength(3)

      const wholeWord = findMatches(container, 'cat', { wholeWord: true })
      expect(wholeWord.map((match) => match.start)).toEqual([0, 16])
    })

    it('never matches across text nodes', () => {
      container.innerHTML = '<p>foo <strong>bar</strong></p>'
      expect(findMatches(container, 'foo bar')).toHaveLength(0)
      expect(findMatches(container, 'foo')).toHaveLength(1)
      expect(findMatches(container, 'bar')).toHaveLength(1)
    })

    it('skips non-editable islands', () => {
      container.innerHTML =
        '<p>visible text</p><div contenteditable="false"><span>hidden text</span></div>'

      const matches = findMatches(container, 'text')
      expect(matches).toHaveLength(1)
      expect(matches[0].node.data).toBe('visible text')

      expect(collectSearchableTextNodes(container)).toHaveLength(1)
    })

    it('returns nothing for an empty query', () => {
      container.innerHTML = '<p>anything</p>'
      expect(findMatches(container, '')).toHaveLength(0)
      expect(findMatches(null, 'anything')).toHaveLength(0)
    })

    it('overlapping candidates do not loop forever', () => {
      container.innerHTML = '<p>aaaa</p>'
      expect(findMatches(container, 'aa')).toHaveLength(2)
    })

    it('caps the number of matches', () => {
      container.innerHTML = `<p>${'a '.repeat(MAX_SEARCH_MATCHES + 50)}</p>`
      expect(findMatches(container, 'a')).toHaveLength(MAX_SEARCH_MATCHES)
    })
  })

  describe('matchRange', () => {
    it('covers exactly the matched text', () => {
      container.innerHTML = '<p>hello world</p>'
      const [match] = findMatches(container, 'world')
      const range = matchRange(match)

      expect(range.toString()).toBe('world')
      expect(range.startContainer).toBe(match.node)
      expect(range.startOffset).toBe(6)
    })
  })

  describe('replaceMatches', () => {
    it('replaces every match and keeps surrounding markup', () => {
      container.innerHTML = '<p>cat <strong>cat</strong> cat</p>'
      const matches = findMatches(container, 'cat')

      const replaced = replaceMatches(container, matches, 'dog')

      expect(replaced).toBe(3)
      expect(container.innerHTML).toBe('<p>dog <strong>dog</strong> dog</p>')
      expect(findMatches(container, 'cat')).toHaveLength(0)
    })

    it('applies different replacement lengths correctly (back-to-front)', () => {
      container.innerHTML = '<p>a a a</p>'
      const matches = findMatches(container, 'a')

      expect(replaceMatches(container, matches, 'aa')).toBe(3)
      expect(container.textContent).toBe('aa aa aa')
    })

    it('deletes matches when the replacement is empty', () => {
      container.innerHTML = '<p>keep drop keep</p>'
      const matches = findMatches(container, 'drop')

      expect(replaceMatches(container, matches, '')).toBe(1)
      expect(container.textContent).toBe('keep  keep')
    })

    it('can replace a single match (replace current)', () => {
      container.innerHTML = '<p>cat cat</p>'
      const matches = findMatches(container, 'cat')
      const onlySecond: SearchMatch[] = [matches[1]]

      expect(replaceMatches(container, onlySecond, 'lion')).toBe(1)
      expect(container.textContent).toBe('cat lion')
    })

    it('ignores stale matches whose nodes left the DOM', () => {
      container.innerHTML = '<p>cat</p>'
      const matches = findMatches(container, 'cat')

      container.innerHTML = '<p>replaced entirely</p>'

      expect(replaceMatches(container, matches, 'dog')).toBe(0)
      expect(container.textContent).toBe('replaced entirely')
    })
  })
})

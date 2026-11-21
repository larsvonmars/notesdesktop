import { describe, expect, it } from 'vitest'
import {
  extractNoteLinkIdsFromContent,
  extractNoteLinkIdsFromHtml,
  extractNoteLinkIdsFromMindmap,
} from '@/lib/note-link-extraction'

describe('note link extraction', () => {
  it('reads rich-text note-link blocks', () => {
    const html =
      '<div data-block-type="note-link" data-note-id="note-a">A</div>' +
      '<div data-block-type="note-link" data-note-id="note-b">B</div>'
    expect(extractNoteLinkIdsFromHtml(html)).toEqual(['note-a', 'note-b'])
  })

  it('reads note attachments from mindmap nodes', () => {
    const content = JSON.stringify({
      nodes: {
        root: {
          id: 'root',
          attachments: [{ url: 'note://note-a' }],
        },
        child: {
          id: 'child',
          attachments: [{ url: 'note://note-b' }, { url: 'https://example.com/x.png' }],
        },
      },
    })
    expect(extractNoteLinkIdsFromMindmap(content)).toEqual(['note-a', 'note-b'])
  })

  it('dispatches by note type and ignores unsupported bodies', () => {
    const mindmap = JSON.stringify({ nodes: { root: { attachments: [{ url: 'note://n1' }] } } })
    expect(extractNoteLinkIdsFromContent('mindmap', mindmap)).toEqual(['n1'])
    expect(extractNoteLinkIdsFromContent('drawing', mindmap)).toEqual([])
    expect(extractNoteLinkIdsFromContent('mindmap', 'not-json')).toEqual([])
  })
})

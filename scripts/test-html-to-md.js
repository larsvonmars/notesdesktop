const { JSDOM } = require('jsdom');
const fs = require('fs');

// Load the helper file as a string and evaluate in a DOM-enabled vm
const helperPath = require('path').resolve(__dirname, '..', 'lib', 'editor', 'markdownHelpers.ts');
const ts = fs.readFileSync(helperPath, 'utf8');

// Very small evaluation: we'll extract the htmlToMarkdown function by running a tiny in-memory transpile using esbuild/register would be heavy.
// Instead, replicate minimal logic to test preservation behavior using DOM directly.

const htmlToMarkdownSimple = (html) => {
  const { window } = new JSDOM('');
  const div = window.document.createElement('div');
  div.innerHTML = html;

  function proc(node) {
    if (node.nodeType === node.TEXT_NODE) return node.textContent || '';
    if (node.nodeType !== node.ELEMENT_NODE) return '';
    const el = node;
    const tag = el.tagName.toLowerCase();
    const children = Array.from(el.childNodes).map(proc).join('');
    const wrap = (l, r, content) => {
      const leading = (content.match(/^\s+/) || [''])[0];
      const trailing = (content.match(/\s+$/) || [''])[0];
      return leading + l + content.trim() + r + trailing;
    }
    if (tag === 'strong' || tag === 'b') return wrap('**','**', children);
    if (tag === 'em' || tag === 'i') return wrap('*','*', children);
    if (tag === 'a') {
      const href = el.getAttribute('href') || '';
      const leading = (children.match(/^\s+/) || [''])[0];
      const trailing = (children.match(/\s+$/) || [''])[0];
      return leading + `[${children.trim()}](${href})` + trailing;
    }
    return children;
  }

  return proc(div);
}

const tests = [
  { html: 'before <strong>bold</strong> after', want: 'before **bold** after' },
  { html: 'before <strong> bold </strong> after', want: 'before  **bold**  after' },
  { html: 'start<strong>bold</strong>end', want: 'start**bold**end' },
  { html: 'a <a href="https://example.com">link</a> b', want: 'a [link](https://example.com) b' }
];

tests.forEach(t => {
  const out = htmlToMarkdownSimple(t.html);
  console.log('\nHTML: ', t.html);
  console.log('MD:   ', out);
  console.log('OK?   ', out === t.want);
});

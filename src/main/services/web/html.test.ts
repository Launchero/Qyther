import { describe, it, expect } from 'vitest';
import { htmlToMarkdown, isUsableReaderOutput, decodeEntities, collapseWhitespace } from './html';

const article = `<!doctype html><html><head><title>t</title><style>.x{color:red}</style></head>
<body>
<nav><a href="/a">Home</a><a href="/b">Docs</a></nav>
<header><h1>Site header</h1></header>
<main>
  <h1>Page title</h1>
  <p>First paragraph with <strong>bold</strong> and an <a href="https://example.com/x">external link</a>.</p>
  <ul><li>alpha</li><li>beta</li></ul>
  <pre><code>const x = 1;</code></pre>
  <table><tr><th>Key</th><th>Value</th></tr><tr><td>a</td><td>1</td></tr></table>
  <script>console.log('nope')</script>
</main>
<footer>footer text</footer>
</body></html>`;

describe('htmlToMarkdown', () => {
  const markdown = htmlToMarkdown(article);

  it('produces markdown headings, links, lists and fences', () => {
    expect(markdown).toContain('# Page title');
    expect(markdown).toContain('[external link](https://example.com/x)');
    expect(markdown).toContain('- alpha');
    expect(markdown).toContain('**bold**');
    expect(markdown).toContain('```');
    expect(markdown).toContain('const x = 1;');
  });

  it('drops chrome and script content', () => {
    expect(markdown).not.toContain('console.log');
    expect(markdown).not.toContain('color:red');
    expect(markdown).not.toContain('footer text');
    expect(markdown).not.toContain(']( /a)');
  });

  it('never emits a javascript: href', () => {
    const hostile = htmlToMarkdown('<p><a href="javascript:alert(1)">click</a></p>');
    expect(hostile).not.toContain('javascript:');
    expect(hostile).toContain('click');
  });

  it('keeps table cells on one row', () => {
    expect(markdown.replace(/\n{3,}/g, '\n\n')).toMatch(/Key \| Value \|/);
  });
});

describe('isUsableReaderOutput', () => {
  it('rejects short output', () => {
    expect(isUsableReaderOutput('too short')).toBe(false);
  });

  it('rejects a javascript gate', () => {
    expect(isUsableReaderOutput('Please enable JavaScript to continue. '.repeat(20))).toBe(false);
  });

  it('rejects navigation-dominated output', () => {
    const nav = Array.from({ length: 20 }, (_v, i) => `Menu item ${i}`).join('\n');
    expect(isUsableReaderOutput(nav)).toBe(false);
  });

  it('accepts prose', () => {
    expect(isUsableReaderOutput('A'.repeat(400))).toBe(true);
  });
});

describe('decodeEntities', () => {
  it('decodes named, decimal and hex entities', () => {
    expect(decodeEntities('a &amp; b &mdash; c')).toBe('a & b - c');
    expect(decodeEntities('&#65;&#x42;')).toBe('AB');
  });

  it('leaves unknown entities alone', () => {
    expect(decodeEntities('&notarealentity;')).toBe('&notarealentity;');
  });
});

describe('collapseWhitespace', () => {
  it('collapses runs of blank lines and trailing spaces', () => {
    expect(collapseWhitespace('a  \n\n\n\nb   \nc')).toBe('a\n\nb\nc');
  });
});
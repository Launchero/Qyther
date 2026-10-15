/**
 * HTML to readable text/markdown, in plain TypeScript with no DOM parser.
 *
 * The quality gate and the reader order are the load-bearing parts (see `fetch/reader.ts`): this
 * module is the first reader in the chain, so its failure mode is "returns the navigation chrome and
 * nothing else", which `isUsableReaderOutput` is what detects.
 */

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '-', mdash: '-',
  hellip: '...', laquo: '"', raquo: '"', rsquo: "'", lsquo: "'", copy: '(c)', reg: '(r)',
  trade: '(tm)', eacute: 'e', egrave: 'e', agrave: 'a', ccedil: 'c', uuml: 'u', ouml: 'o',
  auml: 'a', szlig: 'ss', middot: '.', bull: '-', deg: ' deg ', euro: 'EUR', pound: 'GBP',
};

export function decodeEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-f]+|[a-z][a-z0-9]*);/gi, (match, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X'
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10);
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return match;
      try {
        return String.fromCodePoint(code);
      } catch {
        return match;
      }
    }
    return ENTITIES[body.toLowerCase()] ?? match;
  });
}

export function stripTags(input: string): string {
  return decodeEntities(input.replace(/<[^>]*>/g, ''));
}

export function collapseWhitespace(input: string): string {
  return input
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Tags that never carry prose. `main`/`article` are kept — they are usually the content. */
const DROPPED_BLOCKS = [
  'script', 'style', 'noscript', 'template', 'svg', 'canvas', 'iframe', 'object', 'embed',
  'nav', 'header', 'footer', 'aside', 'form', 'button', 'select', 'option', 'dialog',
];

/** Ordered rewrites. Block-level first, inline second; markdown syntax needs the text already decoded. */
function convertBlocks(html: string): string {
  let out = html;

  for (const tag of DROPPED_BLOCKS) {
    out = out.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?</${tag}>`, 'gi'), '\n');
    out = out.replace(new RegExp(`<${tag}\\b[^>]*\\/?>`, 'gi'), '\n');
  }

  out = out
    .replace(/<pre\b[^>]*>([\s\S]*?)<\/pre>/gi, (_m, body: string) => `\n\n\`\`\`\n${stripTags(body).trim()}\n\`\`\`\n\n`)
    .replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, (_m, body: string) => `\`${stripTags(body).trim()}\``)
    .replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, body: string) => {
      const text = stripTags(body).replace(/\s+/g, ' ').trim();
      if (text.length === 0) return '';
      return /^(javascript|data|vbscript):/i.test(href) ? text : `[${text}](${href})`;
    })
    .replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_m, _t, body: string) => `**${stripTags(body).trim()}**`)
    .replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_m, _t, body: string) => `*${stripTags(body).trim()}*`)
    .replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_m, level: string, body: string) =>
      `\n\n${'#'.repeat(Number(level))} ${stripTags(body).trim()}\n\n`)
    .replace(/<blockquote\b[^>]*>([\s\S]*?)<\/blockquote>/gi, (_m, body: string) =>
      `\n\n${stripTags(body).trim().split('\n').map((line) => `> ${line}`).join('\n')}\n\n`)
    .replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, (_m, body: string) => `\n- ${stripTags(body).trim()}`)
    .replace(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi, (_m, body: string) => ` ${stripTags(body).trim()} |`)
    .replace(/<hr\s*\/?>/gi, '\n\n---\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|section|article|tr|table|ul|ol|dl|dd|dt|main)>/gi, '\n\n')
    .replace(/<(p|div|section|article|tr|table|ul|ol|dl|dd|dt|main)\b[^>]*>/gi, '\n\n');

  return out;
}

export function htmlToMarkdown(html: string): string {
  const withTables = convertBlocks(html)
    .replace(/^[ \t]*\|[ \t]*$/gm, '')
    .replace(/(\s*\|)\s*\n\s*(\s*\|)/g, ' |\n| ');

  return collapseWhitespace(stripTags(withTables).replace(/\(\s+/g, '(').replace(/\s+\)/g, ')'));
}

const JS_GATED = /enable javascript|javascript required|turn on javascript|please enable javascript|browser not supported/i;

/**
 * The gate every reader output must clear. A page that renders as nav chrome passes the "has content"
 * check and fails the "is navigation" check, which is why both halves are here.
 */
export function isUsableReaderOutput(text: string): boolean {
  const nonSpace = text.replace(/\s/g, '');
  if (nonSpace.length <= 100) return false;
  if (JS_GATED.test(text)) return false;

  const lines = text.split('\n').filter((line) => line.trim().length > 0);
  if (lines.length > 10) {
    const short = lines.filter((line) => line.trim().length < 40).length;
    if (short / lines.length > 0.7) return false;
  }
  return true;
}
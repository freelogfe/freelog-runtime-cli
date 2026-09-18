/**
 * Console `FI18n.i18nNext.tAuto()` 在浏览器里用 html-react-parser 渲染 React 节点；
 * CLI 终端只能输出纯文本，此处把 OSS 富文本 i18n 转为可读字符串。
 */

const ENTITY_MAP: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
};

function decodeEntities(text: string): string {
  return text.replace(/&(?:nbsp|amp|lt|gt|quot|#39);/g, (m) => ENTITY_MAP[m] ?? m);
}

/**
 * 将 Console i18n 字符串（可能含 `<div class="i18n">` / 链接 / 换行）转为 CLI 终端纯文本。
 */
export function plainTextFromRichI18n(raw: string): string {
  if (!raw) return '';
  let text = raw.trim();

  text = text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
    .replace(/<\/div>\s*<div[^>]*>/gi, '\n');

  if (!/^<[a-z]/i.test(text)) {
    return decodeEntities(text.replace(/\\n/g, '\n')).replace(/\s+\n/g, '\n').trim();
  }

  text = text.replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, (_, inner: string) =>
    plainTextFromRichI18n(inner),
  );

  text = text.replace(/<[^>]+>/g, '');
  text = decodeEntities(text);
  text = text.replace(/\r\n/g, '\n');
  text = text.replace(/[ \t]+\n/g, '\n');
  text = text.replace(/\n{3,}/g, '\n\n');
  return text.trim();
}

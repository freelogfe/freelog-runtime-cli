import { FI18n } from '../platform/index.js';
import { BUNDLED, I18N_KEYS, type CliLocale, type I18nKey } from './bundled.js';
import { loadPersistedLocale } from './localeConfig.js';
import { plainTextFromRichI18n } from './plainText.js';

export { I18N_KEYS, type CliLocale, type I18nKey };
export { plainTextFromRichI18n } from './plainText.js';
export { loadPersistedLocale, persistCliLocale, loadCliSettings } from './localeConfig.js';

let currentLocale: CliLocale = resolveInitialLocale();
let ossReady = false;

function normalizeLocale(raw: string | undefined): CliLocale | undefined {
  if (!raw) return undefined;
  const v = raw.trim().replace('-', '_');
  if (v === 'en' || v === 'en_US') return 'en_US';
  if (v === 'zh' || v === 'zh_CN') return 'zh_CN';
  return undefined;
}

function resolveLocaleFromEnv(): CliLocale | undefined {
  return normalizeLocale(process.env.FREELOG_LANG);
}

/** 优先级：--lang argv > FREELOG_LANG > ~/.freelog-cli/settings.json > zh_CN */
function resolveInitialLocale(argv: string[] = process.argv): CliLocale {
  return (
    parseCliLocaleFromArgv(argv) ||
    resolveLocaleFromEnv() ||
    loadPersistedLocale() ||
    'zh_CN'
  );
}

/** 从 argv 解析 `--lang zh_CN|en_US`（任意位置） */
export function parseCliLocaleFromArgv(argv: string[]): CliLocale | undefined {
  const idx = argv.indexOf('--lang');
  if (idx >= 0 && argv[idx + 1]) {
    return normalizeLocale(argv[idx + 1]);
  }
  return undefined;
}

export function getCliLocale(): CliLocale {
  return currentLocale;
}

export function setCliLocale(lng: CliLocale): void {
  currentLocale = lng;
  FI18n.i18nNext.changeLanguage(lng);
}

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) =>
    params[name] !== undefined ? String(params[name]) : `{${name}}`,
  );
}

function fromBundled(key: string, params?: Record<string, string | number>): string | undefined {
  const entry = BUNDLED[key];
  if (!entry) return undefined;
  const raw = entry[currentLocale] ?? entry.zh_CN;
  if (!raw) return undefined;
  return plainTextFromRichI18n(interpolate(raw, params));
}

/**
 * CLI 等价于 Console `tAuto()` 的**纯文本**输出：
 * - 浏览器：html-react-parser → React 节点（链接、加粗等）
 * - CLI：strip HTML → 终端字符串
 */
export function t(key: I18nKey | string, params?: Record<string, string | number>): string {
  if (ossReady) {
    // Node 无 React parser；tAuto 对富文本会原样返回 HTML，需 plainText 化
    const fromOss = FI18n.i18nNext.tAuto(key, params);
    const raw = fromOss == null ? key : String(fromOss);
    if (raw && raw !== key) {
      return plainTextFromRichI18n(raw);
    }
  }
  const bundled = fromBundled(key, params);
  if (bundled) return bundled;
  return key;
}

/** 封面裁剪弹窗说明（OSS key，含 800px 建议） */
export function coverConstraintHint(): string {
  return t(I18N_KEYS.upload_image_info_resource_image).replace(/\s*\n\s*/g, ' ');
}

/** Console FUploadCover 动态格式文案 */
export function coverFormatErrorMessage(labels: string[] = ['JPEG', 'PNG', 'GIF']): string {
  if (labels.join('、') === 'JPEG、PNG、GIF') {
    return t(I18N_KEYS.cli_cover_format_unsupported);
  }
  return `图片格式仅支持${labels.join('、')}`;
}

/** 同步 bootstrap：解析 argv/env/持久化语言 */
export function bootstrapCliI18nSync(argv: string[] = process.argv): void {
  currentLocale = resolveInitialLocale(argv);
  setCliLocale(currentLocale);
}

/** 异步：拉 OSS i18n（与 Console 同源），失败时仍可用 bundled */
export async function initCliI18n(): Promise<void> {
  try {
    await FI18n.i18nNext.ready();
    ossReady = true;
    setCliLocale(currentLocale);
  } catch {
    ossReady = false;
  }
}

/** 测试：重置 OSS 就绪态 */
export function resetCliI18nForTests(): void {
  ossReady = false;
  currentLocale = 'zh_CN';
}

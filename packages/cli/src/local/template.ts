/** 主题/插件模板缓存：保存后续渲染需要的统一输入，不写入 N.json。 */

import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { atomicWriteFile } from '../core/atomicWrite';
import { CliError } from '../core/errors';
import { freelogDir } from './identity';

export type TemplateCache = {
  schemaVersion: 1;
  templateId: string;
  templateVersion: string;
  npmName: string;
  projectName: string;
  projectVersion: string;
};

const templateCacheSchema = z.object({
  schemaVersion: z.literal(1),
  templateId: z.string().min(1),
  templateVersion: z.string().min(1),
  npmName: z.string().min(1),
  projectName: z.string().min(1),
  projectVersion: z.string().min(1),
}).strict();

/** 同编号模板缓存路径：<cwd>/.freelog/<n>.template.json。 */
export function templateCachePath(cwd: string, n: number): string {
  return path.join(freelogDir(cwd), `${n}.template.json`);
}

/** 写模板缓存。 */
export function writeTemplateCache(cwd: string, n: number, cache: Omit<TemplateCache, 'schemaVersion'>): void {
  const value: TemplateCache = { schemaVersion: 1, ...cache };
  const parsed = templateCacheSchema.safeParse(value);
  if (!parsed.success) {
    throw new CliError('模板缓存字段无效', 'TEMPLATE_CACHE_INVALID');
  }
  atomicWriteFile(
    templateCachePath(cwd, n),
    `${JSON.stringify(parsed.data, null, 2)}\n`,
  );
}

/** 读模板缓存；不存在或坏文件均明确失败。 */
export function readTemplateCache(cwd: string, n: number): TemplateCache {
  const filePath = templateCachePath(cwd, n);
  if (!existsSync(filePath)) {
    throw new CliError(`找不到模板缓存 ${n}.template.json`, 'TEMPLATE_CACHE_NOT_FOUND');
  }
  try {
    const parsed = templateCacheSchema.safeParse(JSON.parse(readFileSync(filePath, 'utf8')));
    if (parsed.success) {
      return parsed.data;
    }
  } catch {
    // i18n: cli.template.cache_invalid
  }
  throw new CliError(`模板缓存 ${n}.template.json 无效`, 'TEMPLATE_CACHE_INVALID');
}

/** 删除模板缓存；缺失算成功。 */
export function deleteTemplateCache(cwd: string, n: number): boolean {
  const filePath = templateCachePath(cwd, n);
  if (!existsSync(filePath)) {
    return false;
  }
  unlinkSync(filePath);
  return true;
}

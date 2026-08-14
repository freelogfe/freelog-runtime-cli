import fs from 'node:fs';
import path from 'node:path';
import { consola } from 'consola';
import {
  inheritDataFromVersionConfig,
  handleFilePropertiesBySha1,
} from './fileProperty/index.js';
import { assertResourceTypeCode } from './typeService.js';
import { describeTypeFileSizeLimit } from './resourceTypeCapabilities.js';
import type { VersionProject } from '../config/project.js';

/** TTY：选定发布文件后提示类型大小上限与必填属性 key（只读，不编辑） */
export async function infoPublishFileConstraints(opts: {
  cwd: string;
  filePath: string;
  resourceTypeCode: string;
  versionConfig?: VersionProject;
}): Promise<void> {
  const absPath = path.isAbsolute(opts.filePath)
    ? opts.filePath
    : path.resolve(opts.cwd, opts.filePath);
  if (!fs.existsSync(absPath)) return;

  const typeInfo = await assertResourceTypeCode(opts.resourceTypeCode);
  const sizeHint = describeTypeFileSizeLimit(typeInfo);
  if (sizeHint) consola.info(sizeHint);

  const inheritData = inheritDataFromVersionConfig(opts.versionConfig || {});
  try {
    const handleResult = await handleFilePropertiesBySha1({
      sha1: '',
      resourceTypeCode: opts.resourceTypeCode,
      inheritData,
    });
    if (handleResult.state !== 'success') return;

    const systemKeys = handleResult.systemProperties
      .filter((item) => item.type === 'additional')
      .map((item) => item.key);
    const customKeys = [
      ...handleResult.customConfigurations.map((item) => item.key),
      ...handleResult.customProperties.map((item) => item.key),
    ];
    const required = [...systemKeys, ...customKeys].filter(Boolean);
    if (required.length) {
      consola.info(`该类型可能需补充的属性 key：${required.join(', ')}`);
      consola.info('可在 manifest 的 inputAttrs / customPropertyDescriptors 中预填');
    }
  } catch {
    // 解析失败保持现有 publish 路径 code 4，TTY 仅作提示
  }
}

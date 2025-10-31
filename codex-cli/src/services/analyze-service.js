import path from 'node:path';
import AdmZip from 'adm-zip';
import { loadFreelogConfig } from './config-service.js';
import { gatherFiles, statSafe } from '../utils/fs.js';
import { getOption } from '../utils/options.js';

export async function analyzeProject(options = {}) {
  const config = await loadFreelogConfig();
  const fileOption = getOption(options, 'file', 'f');
  const format = getOption(options, 'format') ?? 'table';
  const output = getOption(options, 'output', 'o');
  if (fileOption) {
    const target = path.resolve(fileOption);
    const stats = await statSafe(target);
    if (!stats || !stats.isFile()) {
      throw new Error(`文件不存在: ${target}`);
    }
    const entries = readEntriesFromFile(target, stats.size);
    return {
      format,
      type: 'file',
      entries,
      totalSize: entries.reduce((acc, item) => acc + item.size, 0),
      output
    };
  }
  const baseDir = config.local?.buildDir ? path.resolve(config.local.buildDir) : path.resolve('./dist');
  const files = await gatherFiles(baseDir, {
    excludes: config.local?.excludes ?? [],
    includes: config.local?.includes ?? []
  });
  return {
    format,
    type: 'directory',
    baseDir,
    entries: files.map((item) => ({
      path: item.path,
      size: item.size,
      type: detectFileType(item.path)
    })),
    totalSize: files.reduce((acc, file) => acc + file.size, 0),
    output
  };
}

function readEntriesFromFile(target, size) {
  if (target.toLowerCase().endsWith('.zip')) {
    const zip = new AdmZip(target);
    return zip
      .getEntries()
      .filter((entry) => !entry.isDirectory)
      .map((entry) => ({
        path: entry.entryName,
        size: entry.header.size,
        type: detectFileType(entry.entryName)
      }));
  }
  return [
    {
      path: path.basename(target),
      size,
      type: detectFileType(target)
    }
  ];
}

function detectFileType(filename) {
  const ext = path.extname(filename).toLowerCase();
  switch (ext) {
    case '.js':
    case '.jsx':
    case '.ts':
    case '.tsx':
      return '脚本';
    case '.css':
    case '.scss':
      return '样式';
    case '.html':
      return '页面';
    case '.json':
      return '配置';
    case '.png':
    case '.jpg':
    case '.jpeg':
    case '.gif':
    case '.svg':
      return '资源';
    case '.zip':
      return '压缩包';
    default:
      return ext ? `${ext} 文件` : '其他';
  }
}

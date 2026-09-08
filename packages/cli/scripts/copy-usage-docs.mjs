import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageDir = path.resolve(scriptDir, '..');
const repositoryDir = path.resolve(packageDir, '../..');
const sourceDir = path.join(repositoryDir, 'docs', '一期', '产品方案', '使用');
const destinationDir = path.join(packageDir, 'dist', 'docs');

if (!existsSync(path.join(sourceDir, 'README.md'))) {
  throw new Error(`找不到使用文档入口：${sourceDir}`);
}

function copyDirectory(source, destination) {
  mkdirSync(destination, { recursive: true });
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      copyDirectory(from, to);
    } else if (entry.isFile()) {
      copyFileSync(from, to);
    }
  }
}

copyDirectory(sourceDir, destinationDir);

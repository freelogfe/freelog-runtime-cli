import fs from 'fs-extra';
import path from 'node:path';

export async function ensureDir(dirPath) {
  await fs.ensureDir(dirPath);
  return dirPath;
}

export async function pathExists(targetPath) {
  return fs.pathExists(targetPath);
}

export async function readJson(filePath, fallback = null) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return fallback;
    }
    if (error.name === 'SyntaxError') {
      throw new Error(`Invalid JSON in ${filePath}: ${error.message}`);
    }
    throw error;
  }
}

export async function writeJson(filePath, data) {
  await ensureDir(path.dirname(filePath));
  const content = `${JSON.stringify(data, null, 2)}\n`;
  await fs.writeFile(filePath, content, 'utf8');
  return filePath;
}

export async function removeIfExists(targetPath) {
  if (await pathExists(targetPath)) {
    await fs.remove(targetPath);
    return true;
  }
  return false;
}

export async function copyTemplate(srcDir, destDir) {
  await ensureDir(destDir);
  await fs.copy(srcDir, destDir, {
    overwrite: true,
    errorOnExist: false,
    filter: (src) => !path.basename(src).startsWith('.DS_Store')
  });
}

export async function gatherFiles(rootDir, { excludes = [], includes = [] } = {}) {
  const files = [];
  async function walk(current) {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      const relativePath = path.relative(rootDir, fullPath);
      if (entry.isDirectory()) {
        if (shouldInclude(relativePath, excludes, includes, true)) {
          await walk(fullPath);
        }
      } else if (entry.isFile()) {
        if (shouldInclude(relativePath, excludes, includes, false)) {
          const stats = await fs.stat(fullPath);
          files.push({
            path: relativePath,
            size: stats.size,
            mtime: stats.mtime
          });
        }
      }
    }
  }
  await walk(rootDir);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

function shouldInclude(relativePath, excludes, includes, isDirectory) {
  const normalized = relativePath.replace(/\\/g, '/');
  if (!normalized) {
    return true;
  }
  if (excludes.some((pattern) => matchPattern(normalized, pattern, isDirectory))) {
    return false;
  }
  if (includes.length === 0) {
    return true;
  }
  return includes.some((pattern) => matchPattern(normalized, pattern, isDirectory));
}

function matchPattern(target, pattern, isDirectory) {
  if (!pattern) {
    return false;
  }
  const normalized = pattern.replace(/\\/g, '/');
  if (normalized.endsWith('/**')) {
    const prefix = normalized.slice(0, -3);
    return target.startsWith(prefix);
  }
  if (normalized.includes('*')) {
    const regex = new RegExp('^' + normalized.split('*').map(escapeRegex).join('.*') + (isDirectory ? '(\\/.*)?' : '') + '$');
    return regex.test(target);
  }
  return target === normalized;
}

function escapeRegex(value) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
}

export async function statSafe(targetPath) {
  try {
    return await fs.stat(targetPath);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

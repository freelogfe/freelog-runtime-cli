import fs from 'node:fs';
import path from 'node:path';

const MEDIA_EXT = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.svg',
  '.mp4',
  '.mov',
  '.m4v',
  '.webm',
  '.mp3',
  '.wav',
]);

const CONFIG_RE = /^freelog\./i;

export interface MediaDirScan {
  dir: string;
  totalFiles: number;
  mediaFiles: number;
  mediaPaths: string[];
  nonMediaFiles: number;
}

/** 扫描目录顶层文件（与 import-dir 一致：不递归） */
export function scanMediaDir(dir: string): MediaDirScan {
  const resolved = path.resolve(dir);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    return {
      dir: resolved,
      totalFiles: 0,
      mediaFiles: 0,
      mediaPaths: [],
      nonMediaFiles: 0,
    };
  }
  const mediaPaths: string[] = [];
  let nonMedia = 0;
  for (const ent of fs.readdirSync(resolved, { withFileTypes: true })) {
    if (!ent.isFile() || CONFIG_RE.test(ent.name)) continue;
    const ext = path.extname(ent.name).toLowerCase();
    if (MEDIA_EXT.has(ext)) {
      mediaPaths.push(path.join(resolved, ent.name));
    } else {
      nonMedia += 1;
    }
  }
  mediaPaths.sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
  return {
    dir: resolved,
    totalFiles: mediaPaths.length + nonMedia,
    mediaFiles: mediaPaths.length,
    mediaPaths,
    nonMediaFiles: nonMedia,
  };
}

export function formatMediaDirHint(scan: MediaDirScan): string | undefined {
  if (scan.mediaFiles < 2) return undefined;
  return `目录 ${scan.dir} 顶层有 ${scan.mediaFiles} 个媒体文件 → 适合用「freelog-cli resource import-dir <dir>」批量发行，或「freelog-cli collection init-from-folder」发行合集（不是 init 五选一）`;
}

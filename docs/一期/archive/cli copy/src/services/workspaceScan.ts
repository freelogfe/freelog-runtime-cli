import fs from 'node:fs';
import path from 'node:path';

export interface WorkspaceProjectHit {
  path: string;
  manifest: string;
  subject?: string;
  name?: string;
  resourceId?: string | null;
}

const MANIFEST = 'freelog.manifest.json';
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.freelog',
  'coverage',
  '.turbo',
]);

export function scanWorkspaceProjects(root: string, maxDepth = 5): WorkspaceProjectHit[] {
  const resolved = path.resolve(root);
  const hits: WorkspaceProjectHit[] = [];

  function walk(dir: string, depth: number): void {
    if (depth > maxDepth) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    const manifestPath = path.join(dir, MANIFEST);
    if (fs.existsSync(manifestPath)) {
      hits.push(readManifestHit(dir, manifestPath));
    }

    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      if (SKIP_DIRS.has(ent.name)) continue;
      walk(path.join(dir, ent.name), depth + 1);
    }
  }

  walk(resolved, 0);
  hits.sort((a, b) => a.path.localeCompare(b.path));
  return hits;
}

function readManifestHit(dir: string, manifestPath: string): WorkspaceProjectHit {
  try {
    const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
      subject?: string;
      identity?: { name?: string };
    };
    let resourceId: string | null = null;
    const statePath = path.join(dir, '.freelog', 'state.json');
    if (fs.existsSync(statePath)) {
      const state = JSON.parse(fs.readFileSync(statePath, 'utf8')) as {
        resource?: { resourceId?: string };
      };
      resourceId = state.resource?.resourceId ?? null;
    }
    return {
      path: dir,
      manifest: manifestPath,
      subject: raw.subject,
      name: raw.identity?.name,
      resourceId,
    };
  } catch {
    return { path: dir, manifest: manifestPath };
  }
}

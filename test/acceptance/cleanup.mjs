/** Delete only a proven successful, owned temporary workspace without unresolved submission state. */
import { existsSync, lstatSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

function pendingEvidence(target) {
  const state = path.join(target, '.freelog');
  if (!existsSync(state)) return false;
  if (lstatSync(state).isSymbolicLink()) return true;
  const walk = (directory) => readdirSync(directory, { withFileTypes: true }).some((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) return true;
    if (entry.isFile() && /pending|\.transaction|\.txn/iu.test(entry.name)) return true;
    if (entry.isDirectory() && entry.name === 'intents' && readdirSync(file).length > 0) return true;
    return entry.isDirectory() && walk(file);
  });
  return walk(state);
}

export function cleanupWorkspace(target, { success = false, prefixes, log = console.log, beforeRemove } = {}) {
  const resolved = path.resolve(target);
  const temporary = realpathSync(tmpdir());
  if (!Array.isArray(prefixes) || !prefixes.length || prefixes.some((prefix) => !/^freelog-[A-Za-z0-9-]+-$/u.test(prefix))
    || !prefixes.some((prefix) => path.basename(resolved).startsWith(prefix))
    || !existsSync(resolved) || lstatSync(resolved).isSymbolicLink()
    || !lstatSync(resolved).isDirectory() || path.dirname(realpathSync(resolved)) !== temporary) {
    throw new Error(`Refusing cleanup outside the owned real temporary workspace: ${resolved}`);
  }
  const owned = realpathSync(resolved);
  if (!success) { log(`RETAIN failed/incomplete workspace: ${owned}`); return { removed: false, retained: true }; }
  if (pendingEvidence(resolved)) {
    log(`RETAIN unresolved pending/intent/transaction workspace: ${resolved}`);
    throw new Error(`Pending submission evidence prevents successful cleanup: ${resolved}`);
  }
  try { beforeRemove?.(resolved); } catch (error) {
    log(`RETAIN cleanup hook failed: ${owned}`);
    throw error;
  }
  if (pendingEvidence(resolved)) throw new Error(`Pending evidence appeared during cleanup; workspace retained: ${resolved}`);
  rmSync(owned, { recursive: true, force: false });
  log(`CLEAN successful owned workspace: ${resolved}`);
  return { removed: true, retained: false };
}

/**
 * L3-H 真实 dev 集成：无 TTY 时复用 session/studio 同源服务链路。
 * 有凭据时运行；CI 无凭据则整文件 skip。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadState, tryLoadResourceProject } from '../src/config/project/index.js';
import {
  clearEphemeralAuth,
  setEphemeralAuth,
  setAuthResolveCwd,
} from '../src/core/auth.js';
import { setCliEnv } from '../src/core/env.js';
import { CliError } from '../src/core/errors.js';
import { bootstrapCliI18nSync } from '../src/i18n/index.js';
import { installToolsLibForNode } from '../src/platform/index.js';
import { fetchLoginAuth } from '../src/services/auth/loginFlow.js';
import { assertStudioOwner, createSessionContext } from '../src/services/interactive/context.js';
import { studioPublishOneFile } from '../src/services/interactive/studioPublish.js';
import { createThenPublish } from '../src/services/resource/index.js';
import { exportSessionProject } from '../src/services/store/exportSessionProject.js';
import { ensureSynced } from '../src/services/sync/index.js';
import { verificationAccount } from '../scripts/lib/verification-credentials.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testPhoto = path.resolve(__dirname, '../../../test/fixtures/media/sample-image.png');
const IMAGE_TYPE = 'RT005001';

function hasPrimaryCredentials(): boolean {
  try {
    verificationAccount('primary');
    return fs.existsSync(testPhoto);
  } catch {
    return false;
  }
}

function hasSecondaryCredentials(): boolean {
  try {
    verificationAccount('secondary');
    return true;
  } catch {
    return false;
  }
}

async function loginEphemeral(kind: 'primary' | 'secondary' = 'primary') {
  const account = verificationAccount(kind);
  if (account.source === 'session') {
    throw new Error('L3-H 需要可登录的账号密码，不能仅依赖已有落盘凭据');
  }
  const auth = await fetchLoginAuth(account.name, account.password);
  setEphemeralAuth({ ...auth, scope: 'ephemeral' });
  return auth;
}

function copyTaggedPhoto(dest: string, tag: string | number): void {
  fs.copyFileSync(testPhoto, dest);
  fs.appendFileSync(dest, String(tag));
}

describe.skipIf(!hasPrimaryCredentials())('L3-H real dev integration', () => {
  bootstrapCliI18nSync(['node', 'vitest', '--lang', 'zh_CN']);

  let sessionWork = '';
  let studioWork = '';
  let sessionResourceId = '';
  let dirA = '';
  let dirB = '';
  const remoteArtifacts: Array<{
    scenario: string;
    resourceId: string;
    versionId?: string;
  }> = [];

  beforeAll(() => {
    installToolsLibForNode();
    setCliEnv('dev');
    process.env.FREELOG_DEV = '1';
  });

  afterAll(() => {
    clearEphemeralAuth();
    try {
      process.chdir(os.tmpdir());
    } catch {
      /* ignore */
    }
    for (const dir of [sessionWork, studioWork]) {
      if (dir && fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
    if (remoteArtifacts.length) {
      console.info(`L3H_REMOTE_ARTIFACTS=${JSON.stringify(remoteArtifacts)}`);
    }
  });

  it('H1 session 无落盘凭据 + 首发 publish', async () => {
    sessionWork = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-l3h-session-'));
    setAuthResolveCwd(sessionWork);
    process.chdir(sessionWork);

    const workspaceAuth = path.join(sessionWork, '.freelog-auth');
    expect(fs.existsSync(workspaceAuth)).toBe(false);

    await loginEphemeral('primary');
    const ctx = createSessionContext();
    const ts = Date.now();
    const photo = path.join(sessionWork, `l3h-${ts}.png`);
    copyTaggedPhoto(photo, ts);

    const result = await createThenPublish({
      store: ctx.store,
      title: `L3H Session ${ts}`,
      typeCode: IMAGE_TYPE,
      file: photo,
      version: '1.0.0',
      artifactMode: 'file',
    });

    expect(result.version).toBe('1.0.0');
    sessionResourceId = ctx.store.resolveResourceId() || '';
    expect(sessionResourceId).toBeTruthy();
    remoteArtifacts.push({
      scenario: 'H1-session',
      resourceId: sessionResourceId,
      versionId: result.versionId,
    });

    clearEphemeralAuth();
    expect(fs.existsSync(workspaceAuth)).toBe(false);
  }, 120_000);

  it('H2 session 导出转 00 工程壳', async () => {
    expect(sessionResourceId).toBeTruthy();
    setAuthResolveCwd(sessionWork);

    await loginEphemeral('primary');
    const ctx = createSessionContext(sessionResourceId);
    await ensureSynced({ store: ctx.store });
    const exportDir = path.join(sessionWork, 'exported');
    exportSessionProject(ctx.store, exportDir);

    expect(fs.existsSync(path.join(exportDir, 'freelog.manifest.json'))).toBe(true);
    expect(fs.existsSync(path.join(exportDir, '.freelog/state.json'))).toBe(true);

    const state = loadState(exportDir).data;
    expect(state.resource.resourceId).toBe(sessionResourceId);

    clearEphemeralAuth();
  }, 60_000);

  it.skipIf(!hasSecondaryCredentials())('H3 studio 多账号子工程 owner 不同', async () => {
    studioWork = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-l3h-studio-'));
    const ts = Date.now();
    const fileA = path.join(studioWork, `l3h-a-${ts}.png`);
    const fileB = path.join(studioWork, `l3h-b-${ts}.png`);
    copyTaggedPhoto(fileA, `a-${ts}`);
    copyTaggedPhoto(fileB, `b-${ts}`);

    await loginEphemeral('primary');
    const resultA = await studioPublishOneFile(studioWork, {
      filePath: fileA,
      resourceTypeCode: IMAGE_TYPE,
    });
    expect(resultA).not.toBeNull();
    dirA = resultA!.subdir;
    remoteArtifacts.push({
      scenario: 'H3-studio-primary',
      resourceId: resultA!.resourceId,
      versionId: resultA!.versionId,
    });
    const ownerA = tryLoadResourceProject(dirA)?.data;

    clearEphemeralAuth();
    await loginEphemeral('secondary');
    const resultB = await studioPublishOneFile(studioWork, {
      filePath: fileB,
      resourceTypeCode: IMAGE_TYPE,
    });
    expect(resultB).not.toBeNull();
    dirB = resultB!.subdir;
    remoteArtifacts.push({
      scenario: 'H3-studio-secondary',
      resourceId: resultB!.resourceId,
      versionId: resultB!.versionId,
    });
    const ownerB = tryLoadResourceProject(dirB)?.data;

    expect(ownerA?.userId).toBeTruthy();
    expect(ownerB?.userId).toBeTruthy();
    expect(String(ownerA?.userId)).not.toBe(String(ownerB?.userId));

    clearEphemeralAuth();
  }, 180_000);

  it.skipIf(!hasSecondaryCredentials())('H4 studio owner 门禁 code 2', async () => {
    expect(dirA).toBeTruthy();
    await loginEphemeral('secondary');

    await expect(async () => assertStudioOwner(dirA)).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(CliError);
      expect((error as CliError).code).toBe(2);
      expect((error as CliError).message).toMatch(/owner|账号|切换|资源属于|登录/i);
      return true;
    });

    clearEphemeralAuth();
  }, 30_000);
});

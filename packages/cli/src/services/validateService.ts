import fs from 'node:fs';
import path from 'node:path';
import semver from 'semver';
import { getCurrentAuth } from '../core/auth.js';
import { getCliEnv } from '../core/env.js';
import {
  findProjectPath,
  resolveCwd,
  tryLoadCollectionProject,
  tryLoadResourceProject,
  tryLoadVersionProject,
} from '../config/project.js';
import {
  assertIntro,
  assertPolicyName,
  assertResourceTitle,
  assertSemverLike,
  assertTags,
  assertValidVersionRange,
} from './validation.js';
import { assertLeafResourceTypeCode } from './typeService.js';
import { evaluateOnlineGates } from './onlineGates.js';
import { fetchResourceInfo } from './sync/fetch.js';
import { ownersMatch } from './sync/index.js';
import { buildProjectStatus } from './statusService.js';
import {
  assertPublishNotCollectionCwd,
  assertPublishVersionReady,
  assertVersionGreaterThanLatest,
} from './shared/guards/index.js';

export type ValidateLevel = 'ok' | 'warn' | 'error';

export interface ValidateCheck {
  id: string;
  level: ValidateLevel;
  message: string;
  hint?: string;
}

export type ValidateTarget = 'project' | 'publish' | 'online';

export interface ValidateResult {
  ok: boolean;
  target: ValidateTarget;
  checks: ValidateCheck[];
}

function push(
  checks: ValidateCheck[],
  id: string,
  level: ValidateLevel,
  message: string,
  hint?: string,
): void {
  checks.push({ id, level, message, hint });
}

function tryCheck(
  checks: ValidateCheck[],
  id: string,
  fn: () => void,
  okMessage: string,
): void {
  try {
    fn();
    push(checks, id, 'ok', okMessage);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const hint =
      error && typeof error === 'object' && 'hint' in error
        ? String((error as { hint?: string }).hint || '')
        : undefined;
    push(checks, id, 'error', message, hint || undefined);
  }
}

function resolveVersionFilePath(cwd: string, filePath: string): string {
  return path.isAbsolute(filePath) ? filePath : path.resolve(cwd, filePath);
}

function versionFileExists(cwd: string, filePath: string): boolean {
  const resolved = resolveVersionFilePath(cwd, filePath);
  return fs.existsSync(resolved);
}

export async function validateProject(opts: {
  cwd?: string;
  target?: ValidateTarget;
  skipArtifactChecks?: boolean;
  versionOverride?: string;
}): Promise<ValidateResult> {
  const cwd = resolveCwd(opts.cwd);
  const target = opts.target || 'project';
  const checks: ValidateCheck[] = [];

  if (!findProjectPath(cwd)) {
    push(checks, 'manifest', 'error', '未找到 freelog.manifest.json', 'freelog-cli init <dir>');
    return { ok: false, target, checks };
  }
  push(checks, 'manifest', 'ok', 'freelog.manifest.json 存在');

  const cliEnv = getCliEnv();
  push(checks, 'env', 'ok', `API 环境: ${cliEnv}`);

  const auth = getCurrentAuth(cwd);
  if (!auth?.token) {
    push(checks, 'auth', 'error', '未登录', 'freelog-cli login --env ' + cliEnv);
  } else {
    push(checks, 'auth', 'ok', `已登录: ${auth.username || auth.userId}`);
    if (auth.environment && auth.environment !== cliEnv) {
      push(
        checks,
        'auth-env',
        'error',
        `登录凭证环境 (${auth.environment}) 与当前 --env (${cliEnv}) 不一致`,
        `freelog-cli login --env ${cliEnv}`,
      );
    } else {
      push(checks, 'auth-env', 'ok', '登录环境与命令环境一致');
    }
  }

  const resourceCfg = tryLoadResourceProject(cwd);
  const collectionCfg = tryLoadCollectionProject(cwd);
  const versionCfg = tryLoadVersionProject(cwd);
  const versionData = versionCfg?.data
    ? { ...versionCfg.data, version: opts.versionOverride || versionCfg.data.version }
    : undefined;
  const subject = collectionCfg ? 'collection' : 'resource';
  const listing = collectionCfg?.data || resourceCfg?.data;

  if (listing) {
    tryCheck(
      checks,
      'listing-title',
      () => assertResourceTitle(listing.resourceTitle, true),
      '标题满足 Console 字段契约',
    );
    tryCheck(
      checks,
      'listing-intro',
      () => assertIntro(listing.intro),
      '简介满足 Console 字段契约',
    );
    tryCheck(
      checks,
      'listing-tags',
      () => assertTags(listing.tags),
      '标签满足 Console 字段契约',
    );
  }

  const policies = resourceCfg?.data.policies || collectionCfg?.data.policies || [];
  for (const [index, policy] of policies.entries()) {
    tryCheck(
      checks,
      `policy-name-${index}`,
      () => assertPolicyName(policy.policyName),
      `策略名称满足 Console 字段契约: ${policy.policyName}`,
    );
  }

  if (subject === 'collection') {
    push(checks, 'subject', 'ok', '项目类型: 合集');
    if (!collectionCfg?.data.resourceId) {
      push(checks, 'resource-id', 'warn', '合集尚未 create（无 resourceId）', 'freelog-cli collection create');
    } else {
      push(checks, 'resource-id', 'ok', `resourceId: ${collectionCfg.data.resourceId}`);
    }
  } else {
    push(checks, 'subject', 'ok', '项目类型: 独立资源');
    if (!resourceCfg?.data.resourceId) {
      push(checks, 'resource-id', 'warn', '尚未 create/bind（无 resourceId）', 'freelog-cli create 或 bind');
    } else {
      push(checks, 'resource-id', 'ok', `resourceId: ${resourceCfg.data.resourceId}`);
    }
  }

  const typeCode =
    resourceCfg?.data.resourceTypeCode || collectionCfg?.data.resourceTypeCode;
  if (typeCode?.trim()) {
    try {
      await assertLeafResourceTypeCode(typeCode.trim());
      push(checks, 'type-leaf', 'ok', `resourceTypeCode ${typeCode} 可用`);
    } catch (error) {
      push(
        checks,
        'type-leaf',
        'error',
        error instanceof Error ? error.message : String(error),
      );
    }
  } else if (target !== 'project') {
    push(checks, 'type-code', 'error', '缺少 resourceTypeCode', 'manifest.resource.typeCode');
  }

  if (auth?.token && (resourceCfg?.data.resourceId || collectionCfg?.data.resourceId)) {
    const resourceId = (resourceCfg?.data.resourceId || collectionCfg?.data.resourceId)!;
    try {
      const info = await fetchResourceInfo(resourceId);
      if (auth.userId != null && info.userId != null && !ownersMatch(auth.userId, info.userId)) {
        push(checks, 'owner', 'error', '当前登录用户不是资源 owner', '换账号 login 或让 owner 操作');
      } else {
        push(checks, 'owner', 'ok', 'owner 与登录用户一致');
      }

      if (target === 'online' || target === 'publish') {
        const gates = evaluateOnlineGates(info);
        if (gates.hasLatestVersion) {
          push(checks, 'latest-version', 'ok', `平台 latestVersion: ${info.latestVersion}`);
        } else {
          push(checks, 'latest-version', 'warn', '平台尚无正式版本', 'freelog-cli publish 或 collection publish');
        }
        if (target === 'online') {
          if (gates.enabledPolicyCount >= 1) {
            push(checks, 'policy-enabled', 'ok', `启用策略: ${gates.enabledPolicyCount} 条`);
          } else {
            push(
              checks,
              'policy-enabled',
              'error',
              '无启用策略，无法 online',
              'freelog-cli policy apply --from-file …',
            );
          }
          if (Number(info.status) === 1) {
            push(checks, 'online-status', 'ok', '资源已上架');
          } else if (gates.ok) {
            push(checks, 'online-status', 'ok', '门禁满足，可执行 online');
          }
        }
      }
    } catch (error) {
      push(
        checks,
        'platform',
        'warn',
        `无法拉取平台信息: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  if (target === 'publish' || target === 'online') {
    if (subject === 'resource' && versionData) {
      tryCheck(checks, 'publish-not-collection', () => assertPublishNotCollectionCwd(cwd), '非合集壳 publish 路径');
      tryCheck(
        checks,
        'version-ready',
        () => assertPublishVersionReady(versionData),
        `版本意图: ${versionData.version}`,
      );

      if (versionData.version) {
        tryCheck(checks, 'semver', () => assertSemverLike(versionData.version!), '版本号格式合法');
      }

      if (!opts.skipArtifactChecks && versionData.filePath) {
        if (versionData.filePath === 'dist') {
          const distPath = path.join(cwd, 'dist');
          if (fs.existsSync(distPath)) {
            push(checks, 'file-exists', 'ok', 'dist/ 目录存在');
          } else {
            push(checks, 'file-exists', 'error', 'dist/ 目录不存在', '先 build 或 version set --file <路径>');
          }
        } else if (versionFileExists(cwd, versionData.filePath)) {
          push(checks, 'file-exists', 'ok', `文件存在: ${versionData.filePath}`);
        } else {
          push(
            checks,
            'file-exists',
            'error',
            `本地文件不存在: ${versionData.filePath}`,
            'freelog-cli version set --file <路径>',
          );
        }
      }

      const latest = resourceCfg?.data.latestVersion;
      if (versionData.version && latest && semver.valid(latest) && semver.valid(versionData.version)) {
        tryCheck(
          checks,
          'version-gt-latest',
          () => assertVersionGreaterThanLatest(versionData.version!, latest),
          `新版本 ${versionData.version} > 平台 ${latest}`,
        );
      }

      for (const [i, dep] of (versionData.dependencies || []).entries()) {
        if (dep.versionRange) {
          tryCheck(
            checks,
            `dep-range-${i}`,
            () => assertValidVersionRange(dep.versionRange),
            `依赖 ${dep.resourceId || dep.resourceName}: ${dep.versionRange}`,
          );
        }
      }
    } else if (subject === 'collection' && target === 'publish') {
      push(checks, 'collection-publish', 'ok', '合集发版请用 collection publish（非 resource publish）');
    }
  }

  if (auth?.token) {
    try {
      const status = await buildProjectStatus(cwd);
      if (status.draftAdvice === 'draft_conflict') {
        push(checks, 'draft', 'warn', '本地与平台发版草稿冲突', status.draftAdviceHint || 'draft pull 或 push');
      } else if (status.draftAdvice) {
        push(checks, 'draft', 'warn', status.draftAdviceHint || status.draftAdvice, '见 status 建议');
      } else if (status.localDraftSync?.dirty) {
        push(checks, 'draft', 'warn', '本地发版意图未 push 到平台草稿', 'freelog-cli draft push');
      } else {
        push(checks, 'draft', 'ok', '发版草稿无冲突');
      }
      if (status.sync === 'behind') {
        push(checks, 'listing-sync', 'warn', 'listing 与平台不一致', 'freelog-cli pull --apply-listing');
      } else if (status.sync === 'ok') {
        push(checks, 'listing-sync', 'ok', 'listing 与平台一致');
      }
    } catch {
      // status 失败不阻断 validate
    }
  }

  const ok = !checks.some((c) => c.level === 'error');
  return { ok, target, checks };
}

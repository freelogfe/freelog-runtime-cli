import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { z } from 'zod';
import { CliError } from '../core/errors.js';
import { requireAuth } from '../core/auth.js';
import { resolveCwd } from '../config/paths.js';
import { FServiceAPI, unwrapData } from '../platform/index.js';
import { tryLoadVersionConfig } from '../config/read.js';
import { ensureSynced } from './syncService.js';

const AuthMapSchema = z.object({
  contracts: z
    .array(
      z.object({
        resourceId: z.string().min(1),
        policyIds: z.array(z.string().min(1)).min(1),
      }),
    )
    .min(1, 'contracts 不能为空'),
});

export type AuthMap = z.infer<typeof AuthMapSchema>;

export function parsePolicyMapFile(filePath: string): AuthMap {
  if (!fs.existsSync(filePath)) {
    throw new CliError(`policy-map 不存在: ${filePath}`, { code: 4 });
  }
  const rawText = fs.readFileSync(filePath, 'utf8');
  const ext = path.extname(filePath).toLowerCase();
  let raw: unknown;
  try {
    raw = ext === '.json' ? JSON.parse(rawText) : YAML.parse(rawText);
  } catch (error) {
    throw new CliError('无法解析 policy-map（需 yaml/json）', {
      code: 4,
      details: { cause: error instanceof Error ? error.message : String(error) },
    });
  }
  const parsed = AuthMapSchema.safeParse(raw);
  if (!parsed.success) {
    throw new CliError('policy-map schema 非法', {
      code: 4,
      details: parsed.error.flatten(),
      hint: 'contracts: [{ resourceId, policyIds: [...] }]',
    });
  }
  return parsed.data;
}

export async function depAuthFromMap(opts: {
  cwd?: string;
  policyMap: string;
  noAutoPull?: boolean;
}): Promise<{
  ok: boolean;
  succeeded: Array<{ resourceId: string; policyId: string }>;
  failed: Array<{ resourceId: string; policyId: string; message: string }>;
}> {
  const auth = requireAuth();
  const ctx = await ensureSynced({ cwd: opts.cwd, noAutoPull: opts.noAutoPull });
  const mapPath = path.resolve(resolveCwd(opts.cwd), opts.policyMap);
  const map = parsePolicyMapFile(mapPath);

  const succeeded: Array<{ resourceId: string; policyId: string }> = [];
  const failed: Array<{ resourceId: string; policyId: string; message: string }> = [];

  for (const entry of map.contracts) {
    for (const policyId of entry.policyIds) {
      try {
        // 授权方视角：当前用户作为 licensee 对依赖资源签约
        await FServiceAPI.Contract.batchCreateContracts({
          subjectType: 1,
          licenseeId: auth.userId!,
          licenseeIdentityType: 1,
          subjects: [{ subjectId: entry.resourceId, policyId }],
        } as Parameters<typeof FServiceAPI.Contract.batchCreateContracts>[0]);
        succeeded.push({ resourceId: entry.resourceId, policyId });
      } catch (error) {
        failed.push({
          resourceId: entry.resourceId,
          policyId,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  const versionCfg = tryLoadVersionConfig(opts.cwd)?.data || ctx.version;
  const localDeps = (versionCfg?.dependencies || []) as Array<{ resourceId: string }>;
  if (localDeps.length > 0 && failed.length === 0) {
    try {
      const treeEnv = await FServiceAPI.Resource.authTree({
        resourceId: ctx.resource.resourceId!,
        version: versionCfg?.version || ctx.info.latestVersion,
      } as Parameters<typeof FServiceAPI.Resource.authTree>[0]);
      const tree = unwrapData<{ unresolvedDependencies?: unknown[] }>(treeEnv);
      const unresolved = tree?.unresolvedDependencies;
      if (Array.isArray(unresolved) && unresolved.length > 0) {
        throw new CliError('依赖授权未完成', {
          code: 5,
          details: {
            error: 'DEPENDENCY_AUTH_INCOMPLETE',
            unresolvedDependencies: unresolved,
            succeeded,
            consoleHint: `请在 Console 完成依赖签约：资源 ${ctx.resource.resourceId}`,
          },
          hint: '检查 policyIds 是否正确，或打开 Console 依赖页',
        });
      }
    } catch (error) {
      if (error instanceof CliError && error.code === 5) throw error;
      // authTree 不可用时，以 batchCreate 失败列表为准
    }
  }

  if (failed.length > 0) {
    throw new CliError('部分依赖签约失败', {
      code: 5,
      details: {
        error: 'DEPENDENCY_AUTH_INCOMPLETE',
        succeeded,
        failed,
        unresolvedDependencies: failed.map((f) => ({
          resourceId: f.resourceId,
          policyId: f.policyId,
        })),
        consoleHint: `资源 ${ctx.resource.resourceId}`,
      },
      hint: '检查失败项后重试，或在 Console 完成签约',
    });
  }

  return { ok: true, succeeded, failed };
}

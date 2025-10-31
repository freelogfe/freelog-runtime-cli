import path from 'node:path';
import fs from 'fs-extra';
import archiver from 'archiver';
import { loadFreelogConfig, saveFreelogConfig } from './config-service.js';
import { requireActiveCredential } from './auth-service.js';
import { gatherFiles, statSafe, ensureDir } from '../utils/fs.js';
import { incrementVersion, isValidVersion, normalizeVersion } from '../utils/semver.js';
import { getOption, isOptionEnabled } from '../utils/options.js';
import { WORKSPACE_DATA_DIR } from '../constants/paths.js';
import { getEnv } from '../config/env.js';
import { FormData, getHttpClient } from './http-client.js';

export async function publish(options, renderer) {
  const scopeOption = resolveScopeOption(options);
  const { scope, credential } = await requireActiveCredential(scopeOption);
  const config = await loadFreelogConfig();

  if (!config.workId && !config.resource?.resourceId) {
    throw new Error('freelog.json 中缺少 workId，请先填写作品信息。');
  }
  const workId = config.workId || config.resource?.resourceId;

  const currentVersion = config.version || '1.0.0';
  const bumpType = resolveBumpType(options);
  const explicitVersion = getOption(options, 'version');

  let targetVersion = currentVersion;
  if (explicitVersion) {
    const normalized = normalizeVersion(explicitVersion);
    if (!isValidVersion(normalized)) {
      throw new Error(`指定的版本号无效: ${explicitVersion}`);
    }
    targetVersion = normalized;
  } else if (bumpType) {
    targetVersion = incrementVersion(currentVersion, bumpType);
  }

  const message = getOption(options, 'message', 'm') ?? (isDraft(options) ? '草稿版本' : '常规发布');
  const artifact = await resolveArtifact(options, config);
  const archiveFile = await createArchive(artifact);

  const client = await getHttpClient();
  const headers = {
    authorization: credential.authorization
  };

  let uploadResult = null;
  if (!getEnv('FREELOG_CLI_OFFLINE')) {
    uploadResult = await uploadFile({
      client,
      archiveFile,
      headers
    });
  }

  let publishResult = null;
  if (uploadResult) {
    publishResult = await publishVersion({
      client,
      headers,
      workId,
      targetVersion,
      archiveFile,
      uploadResult,
      config,
      message,
      draft: isDraft(options)
    });
  }

  const summary = buildSummary({
    scope,
    credential,
    currentVersion,
    targetVersion,
    message,
    artifact,
    archiveFile,
    uploadResult,
    publishResult,
    draft: isDraft(options)
  });

  renderer.success(`发布流程完成（${summary.模式}）。`);
  renderer.table(summary.rows, { header: ['字段', '值'] });
  renderer.newline();
  if (!uploadResult || !publishResult) {
    renderer.muted('提示: 当前未调用真实发布接口，请确认是否处于离线模式。');
  }

  config.version = targetVersion;
  config.changelog = config.changelog || {};
  config.changelog[targetVersion] = message;
  await saveFreelogConfig(config);

  return {
    scope,
    version: targetVersion,
    draft: isDraft(options),
    message,
    artifact,
    archive: archiveFile,
    upload: uploadResult,
    publish: publishResult
  };
}

function resolveScopeOption(options) {
  if (isOptionEnabled(options, 'gu', 'global-user', 'g', 'global')) {
    return 'global';
  }
  if (isOptionEnabled(options, 'wu', 'workspace-user', 'workspace')) {
    return 'workspace';
  }
  return undefined;
}

function resolveBumpType(options) {
  if (isOptionEnabled(options, 'major')) {
    return 'major';
  }
  if (isOptionEnabled(options, 'minor')) {
    return 'minor';
  }
  if (isOptionEnabled(options, 'patch')) {
    return 'patch';
  }
  return null;
}

function isDraft(options) {
  return isOptionEnabled(options, 'd', 'draft');
}

async function resolveArtifact(options, config) {
  const fileOption = getOption(options, 'file', 'f');
  const configOption = getOption(options, 'config', 'c');
  const buildDir = config.local?.buildDir ? path.resolve(config.local.buildDir) : path.resolve('./dist');

  if (fileOption) {
    const resolvedFile = path.resolve(String(fileOption));
    const stats = await statSafe(resolvedFile);
    if (!stats || !stats.isFile()) {
      throw new Error(`指定的文件不存在: ${resolvedFile}`);
    }
    return {
      type: 'file',
      baseDir: path.dirname(resolvedFile),
      sourcePath: resolvedFile,
      fileCount: 1,
      totalSize: stats.size,
      entries: [{ path: path.basename(resolvedFile), size: stats.size }],
      configPath: configOption ? path.resolve(configOption) : null
    };
  }

  if (!(await fs.pathExists(buildDir))) {
    throw new Error(`构建目录不存在: ${buildDir}，请先执行 ${config.scripts?.build ?? 'npm run build'}`);
  }
  const files = await gatherFiles(buildDir, {
    excludes: config.local?.excludes ?? [],
    includes: config.local?.includes ?? []
  });
  const totalSize = files.reduce((acc, file) => acc + file.size, 0);
  return {
    type: 'directory',
    baseDir: buildDir,
    fileCount: files.length,
    totalSize,
    entries: files,
    configPath: configOption ? path.resolve(configOption) : null
  };
}

async function createArchive(artifact) {
  if (artifact.type === 'file') {
    return {
      path: artifact.sourcePath,
      size: artifact.totalSize
    };
  }
  const timestamp = Date.now();
  const artifactsDir = path.join(WORKSPACE_DATA_DIR, 'artifacts');
  await ensureDir(artifactsDir);
  const outputPath = path.join(artifactsDir, `freelog-package-${timestamp}.zip`);
  await new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    output.on('close', resolve);
    archive.on('error', reject);
    archive.pipe(output);
    archive.directory(artifact.baseDir, false);
    if (artifact.configPath) {
      archive.file(artifact.configPath, { name: path.basename(artifact.configPath) });
    }
    archive.finalize();
  });
  const stats = await fs.stat(outputPath);
  return { path: outputPath, size: stats.size, filename: path.basename(outputPath) };
}

async function uploadFile({ client, archiveFile, headers }) {
  const form = new FormData();
  form.append('file', fs.createReadStream(archiveFile.path));
  const response = await client.post(getEnv('FREELOG_UPLOAD_ENDPOINT'), form, {
    headers: { ...form.getHeaders(), ...headers }
  });
  if (response.data?.errCode) {
    throw new Error(response.data.msg || '上传构建文件失败。');
  }
  return response.data?.data ?? null;
}

async function publishVersion({
  client,
  headers,
  workId,
  targetVersion,
  archiveFile,
  uploadResult,
  config,
  message,
  draft
}) {
  const url = draft
    ? `/v2/resources/${workId}/versions/drafts`
    : `/v2/resources/${workId}/versions`;
  const payload = draft
    ? buildDraftPayload({ targetVersion, archiveFile, uploadResult, message })
    : buildFormalPayload({ targetVersion, archiveFile, uploadResult, config, message });

  const response = await client.post(url, payload, { headers });
  if (response.data?.errCode) {
    throw new Error(response.data.msg || '发布版本失败。');
  }
  return response.data?.data ?? null;
}

function buildFormalPayload({ targetVersion, archiveFile, uploadResult, config, message }) {
  return {
    version: targetVersion,
    filename: archiveFile.filename,
    fileSha1: uploadResult?.sha1 ?? '',
    description: message || config.description || config.resource?.description || '',
    baseUpcastResources: config.baseUpcastResources ?? [],
    customPropertyDescriptors: config.customPropertyDescriptors ?? [],
    dependencies: config.dependencies ?? [],
    resolveResources: []
  };
}

function buildDraftPayload({ targetVersion, archiveFile, uploadResult, message }) {
  return {
    draftData: {
      versionInput: targetVersion,
      selectedFileInfo: {
        name: archiveFile.filename,
        sha1: uploadResult?.sha1 ?? '',
        from: '本地构建'
      },
      additionalProperties: [],
      customProperties: [],
      customConfigurations: [],
      directDependencies: [],
      baseUpcastResources: [],
      descriptionEditorInput: message
    }
  };
}

function buildSummary({
  scope,
  credential,
  currentVersion,
  targetVersion,
  message,
  artifact,
  archiveFile,
  uploadResult,
  publishResult,
  draft
}) {
  const rows = [
    ['模式', draft ? '草稿发布' : '正式发布'],
    ['用户范围', scope === 'global' ? '全局用户' : '工作空间用户'],
    ['用户名', credential.username || credential.userInfo?.username || '-'],
    ['当前版本', currentVersion],
    ['目标版本', targetVersion],
    ['说明', message],
    ['文件数量', String(artifact.fileCount)],
    ['文件总大小', `${(artifact.totalSize / 1024).toFixed(2)} KB`],
    ['打包文件', archiveFile.path]
  ];
  if (uploadResult) {
    rows.push(['文件 SHA1', uploadResult.sha1 ?? '-']);
  }
  if (publishResult) {
    rows.push(['版本 ID', publishResult.versionId ?? publishResult.version ?? '-']);
    rows.push(['发布状态', publishResult.status ?? '成功']);
  } else {
    rows.push(['发布状态', '离线模拟']);
  }
  return { 模式: draft ? '草稿发布' : '正式发布', rows };
}

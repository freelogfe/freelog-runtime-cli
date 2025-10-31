import fs from "fs-extra";
import path from "node:path";
import archiver from "archiver";
import axios from "axios";
import FormData from "form-data";
import { withSpinner } from "../cli/spinner.js";
import { DEFAULT_CONFIG_FILE, WORKSPACE_DATA_DIR, GLOBAL_CREDENTIALS_FILE, WORKSPACE_CREDENTIALS_FILE } from "../constants/paths.js";
import { DEFAULT_FREELOG_CONFIG } from "../config/default-config.js";
import { gatherFiles, statSafe } from "../utils/fs.js";
import { getOption, isOptionEnabled } from "../utils/options.js";
import { incrementVersion, isValidVersion, normalizeVersion } from "../utils/semver.js";

const host = () => globalThis.FREELOG_HOST ?? "https://api.freelog.com";

export function buildPublishCommand(renderer) {
  return {
    matches: (command, subcommand) => command === "publish" && !subcommand,
    handler: async ({ options }) => {
      await withSpinner("正在发布作品...", async () => {
        const preferredScope = resolveScopeOption(options);
        const credential = await readCredential(preferredScope);
        const config = await loadFreelogConfig();

        const workId = config.workId || config.resource?.resourceId;
        if (!workId) {
          throw new Error("freelog.json 中缺少 workId，请先填写作品信息。");
        }

        const currentVersion = config.version || "1.0.0";
        const bumpType = resolveBumpType(options);
        const explicitVersion = getOption(options, "version");
        let targetVersion = currentVersion;
        if (explicitVersion) {
          const normalized = normalizeVersion(explicitVersion);
          if (!isValidVersion(normalized)) {
            throw new Error(`指定的版本号无效：${explicitVersion}`);
          }
          targetVersion = normalized;
        } else if (bumpType) {
          targetVersion = incrementVersion(currentVersion, bumpType);
        }

        const message = getOption(options, "message", "m") ?? (isDraft(options) ? "草稿版本" : "常规发布");
        const artifact = await resolveArtifact(options, config);
        const archiveFile = await createArchive(artifact);
        const uploadResult = await uploadFile(archiveFile, credential.authorization);
        const publishResult = await publishVersion({
          workId,
          targetVersion,
          archiveFile,
          uploadResult,
          config,
          message,
          draft: isDraft(options),
          authorization: credential.authorization
        });

        config.version = targetVersion;
        config.changelog = config.changelog || {};
        config.changelog[targetVersion] = message;
        await saveFreelogConfig(config);

        renderer.table(
          [
            ["用户范围", credential.scope === "global" ? "全局用户" : "工作空间用户"],
            ["用户名", credential.username ?? credential.userInfo?.username ?? "-"],
            ["当前版本", currentVersion],
            ["目标版本", targetVersion],
            ["说明", message],
            ["文件数量", String(artifact.fileCount)],
            ["文件总大小", `${(artifact.totalSize / 1024).toFixed(2)} KB`],
            ["打包文件", archiveFile.path],
            ["文件 SHA1", uploadResult.sha1 ?? "-"],
            ["版本 ID", publishResult.versionId ?? publishResult.version ?? "-"]
          ],
          { header: ["字段", "值"] }
        );
      });
      renderer.success("发布流程完成。");
    }
  };
}

function resolveScopeOption(options) {
  if (isOptionEnabled(options, "gu", "global-user", "g", "global")) {
    return "global";
  }
  if (isOptionEnabled(options, "wu", "workspace-user", "workspace")) {
    return "workspace";
  }
  return null;
}

function resolveBumpType(options) {
  if (isOptionEnabled(options, "major")) {
    return "major";
  }
  if (isOptionEnabled(options, "minor")) {
    return "minor";
  }
  if (isOptionEnabled(options, "patch")) {
    return "patch";
  }
  return null;
}

function isDraft(options) {
  return isOptionEnabled(options, "d", "draft");
}

async function readCredential(preferredScope) {
  const workspace = await loadCredential(WORKSPACE_CREDENTIALS_FILE);
  const global = await loadCredential(GLOBAL_CREDENTIALS_FILE);
  if (preferredScope === "global") {
    if (!global) {
      throw new Error("未检测到全局登录信息，请先执行 freelog-cli login -g。");
    }
    return { scope: "global", ...global };
  }
  if (preferredScope === "workspace") {
    if (!workspace) {
      throw new Error("未检测到工作空间登录信息，请先执行 freelog-cli login。");
    }
    return { scope: "workspace", ...workspace };
  }
  if (workspace) {
    return { scope: "workspace", ...workspace };
  }
  if (global) {
    return { scope: "global", ...global };
  }
  throw new Error("未检测到任何登录信息，请先登录。");
}

async function loadCredential(file) {
  try {
    if (!(await fs.pathExists(file))) {
      return null;
    }
    return await fs.readJson(file);
  } catch {
    return null;
  }
}

async function loadFreelogConfig() {
  if (!(await fs.pathExists(DEFAULT_CONFIG_FILE))) {
    await fs.writeJson(DEFAULT_CONFIG_FILE, DEFAULT_FREELOG_CONFIG, { spaces: 2 });
  }
  const config = await fs.readJson(DEFAULT_CONFIG_FILE);
  config.dependencies = config.dependencies || [];
  return config;
}

async function saveFreelogConfig(config) {
  await fs.writeJson(DEFAULT_CONFIG_FILE, config, { spaces: 2 });
}

async function resolveArtifact(options, config) {
  const fileOption = getOption(options, "file", "f");
  const configOption = getOption(options, "config", "c");
  const buildDir = config.local?.buildDir ? path.resolve(config.local.buildDir) : path.resolve("./dist");

  if (fileOption) {
    const resolvedFile = path.resolve(String(fileOption));
    const stats = await statSafe(resolvedFile);
    if (!stats || !stats.isFile()) {
      throw new Error(`指定的文件不存在：${resolvedFile}`);
    }
    return {
      type: "file",
      baseDir: path.dirname(resolvedFile),
      sourcePath: resolvedFile,
      fileCount: 1,
      totalSize: stats.size,
      entries: [{ path: path.basename(resolvedFile), size: stats.size }],
      configPath: configOption ? path.resolve(configOption) : null
    };
  }

  if (!(await fs.pathExists(buildDir))) {
    throw new Error(`构建目录不存在：${buildDir}，请先执行 ${config.scripts?.build ?? "npm run build"}`);
  }
  const files = await gatherFiles(buildDir, {
    excludes: config.local?.excludes ?? [],
    includes: config.local?.includes ?? []
  });
  const totalSize = files.reduce((acc, file) => acc + file.size, 0);
  return {
    type: "directory",
    baseDir: buildDir,
    fileCount: files.length,
    totalSize,
    entries: files,
    configPath: configOption ? path.resolve(configOption) : null
  };
}

async function createArchive(artifact) {
  if (artifact.type === "file") {
    return {
      path: artifact.sourcePath,
      size: artifact.totalSize,
      filename: path.basename(artifact.sourcePath)
    };
  }
  const outputDir = path.join(WORKSPACE_DATA_DIR, "artifacts");
  await fs.ensureDir(outputDir);
  const outputPath = path.join(outputDir, `freelog-package-${Date.now()}.zip`);
  await new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver("zip", { zlib: { level: 9 } });
    output.on("close", resolve);
    archive.on("error", reject);
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

async function uploadFile(archiveFile, authorization) {
  const form = new FormData();
  form.append("file", fs.createReadStream(archiveFile.path));
  const response = await axios.post(`${host()}/v2/storages/files/upload`, form, {
    headers: { ...form.getHeaders(), authorization }
  });
  if (response.data?.errCode) {
    throw new Error(response.data.msg || "上传构建文件失败。");
  }
  return response.data?.data ?? {};
}

async function publishVersion({
  workId,
  targetVersion,
  archiveFile,
  uploadResult,
  config,
  message,
  draft,
  authorization
}) {
  const baseUrl = `${host()}/v2/resources/${workId}/versions`;
  const url = draft ? `${baseUrl}/drafts` : baseUrl;
  const payload = draft
    ? buildDraftPayload({ targetVersion, archiveFile, uploadResult, message })
    : buildFormalPayload({ targetVersion, archiveFile, uploadResult, config, message });

  const response = await axios.post(url, payload, {
    headers: { authorization }
  });
  if (response.data?.errCode) {
    throw new Error(response.data.msg || "发布版本失败。");
  }
  return response.data?.data ?? {};
}

function buildFormalPayload({ targetVersion, archiveFile, uploadResult, config, message }) {
  return {
    version: targetVersion,
    filename: archiveFile.filename,
    fileSha1: uploadResult?.sha1 ?? "",
    description: message || config.description || config.resource?.description || "",
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
        sha1: uploadResult?.sha1 ?? "",
        from: "本地构建"
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

import fs from "fs-extra";
import path from "node:path";
import { TEMPLATE_ROOT } from "../constants/paths.js";
import { DEFAULT_FREELOG_CONFIG } from "../config/default-config.js";
import { isOptionEnabled, getOption } from "../utils/options.js";
import { promptInput, promptSelect } from "../cli/prompts.js";

export function buildInitCommand(renderer) {
  return {
    matches: (command, subcommand) => command === "init" && !subcommand,
    handler: async ({ positionals, options }) => {
      const templates = await readTemplates();
      if (isOptionEnabled(options, "list")) {
        if (templates.length === 0) {
          renderer.warn("未找到可用模板。");
          return;
        }
        renderer.table(
          templates.map((tpl) => [tpl.name, tpl.description || "-"]),
          { header: ["模板", "说明"] }
        );
        return;
      }
      if (templates.length === 0) {
        throw new Error("模板目录为空，无法初始化项目。");
      }

      const templateName = await resolveTemplate(options, templates);
      const template = templates.find((tpl) => tpl.name === templateName);
      if (!template) {
        throw new Error(`模板 ${templateName} 不存在。`);
      }

      let projectName = positionals[0];
      if (!projectName) {
        projectName = await promptInput("请输入项目名称", { defaultValue: "freelog-project" });
      }
      projectName = sanitizeName(projectName);

      const projectVersion = getOption(options, "version") ?? "1.0.0";
      const targetDir = path.resolve(projectName);
      const force = isOptionEnabled(options, "force", "f");
      if (await fs.pathExists(targetDir)) {
        if (!force) {
          throw new Error(`目标目录 ${targetDir} 已存在，可使用 --force 强制覆盖。`);
        }
        await fs.emptyDir(targetDir);
      }
      await fs.ensureDir(targetDir);
      await fs.copy(path.join(template.path, "template"), targetDir);

      await updatePackageJson(targetDir, projectName, projectVersion);
      await updateFreelogJson(targetDir, projectName, projectVersion);

      renderer.success(`项目已创建：${projectName}`);
      renderer.list([
        `模板：${template.name}`,
        `版本：${projectVersion}`,
        `目录：${path.relative(process.cwd(), targetDir) || "."}`,
        "下一步：cd " + projectName,
        "          npm install",
        "          npm run dev"
      ]);
    }
  };
}

async function readTemplates() {
  if (!(await fs.pathExists(TEMPLATE_ROOT))) {
    return [];
  }
  const entries = await fs.readdir(TEMPLATE_ROOT, { withFileTypes: true });
  const templates = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const templateDir = path.join(TEMPLATE_ROOT, entry.name);
    const templatePath = path.join(templateDir, "template");
    if (!(await fs.pathExists(templatePath))) continue;
    let description = "";
    try {
      const meta = await fs.readJson(path.join(templateDir, "package.json"));
      description = meta.description ?? "";
    } catch {
      description = "";
    }
    templates.push({ name: entry.name, description, path: templateDir });
  }
  return templates.sort((a, b) => a.name.localeCompare(b.name));
}

async function resolveTemplate(options, templates) {
  const specified = getOption(options, "template", "t");
  if (specified) {
    return specified;
  }
  if (!process.stdin.isTTY) {
    return templates[0].name;
  }
  return promptSelect(
    "请选择项目模板",
    templates.map((tpl) => ({ value: tpl.name, label: tpl.description ? `${tpl.name} - ${tpl.description}` : tpl.name }))
  );
}

function sanitizeName(name) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "freelog-project";
}

async function updatePackageJson(targetDir, projectName, projectVersion) {
  const pkgPath = path.join(targetDir, "package.json");
  if (!(await fs.pathExists(pkgPath))) {
    return;
  }
  const pkg = await fs.readJson(pkgPath);
  pkg.name = projectName;
  pkg.version = projectVersion;
  await fs.writeJson(pkgPath, pkg, { spaces: 2 });
}

async function updateFreelogJson(targetDir, projectName, projectVersion) {
  const freelogPath = path.join(targetDir, "freelog.json");
  if (!(await fs.pathExists(freelogPath))) {
    await fs.writeJson(
      freelogPath,
      {
        ...DEFAULT_FREELOG_CONFIG,
        resource: {
          ...DEFAULT_FREELOG_CONFIG.resource,
          resourceName: projectName
        },
        version: projectVersion
      },
      { spaces: 2 }
    );
    return;
  }
  const freelog = await fs.readJson(freelogPath);
  freelog.version = projectVersion;
  freelog.resource = freelog.resource || {};
  freelog.resource.resourceName = projectName;
  await fs.writeJson(freelogPath, freelog, { spaces: 2 });
}

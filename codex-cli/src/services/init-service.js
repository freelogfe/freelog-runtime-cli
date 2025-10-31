import path from 'node:path';
import fs from 'fs-extra';
import { TEMPLATE_ROOT } from '../constants/paths.js';
import { copyTemplate, ensureDir, pathExists, readJson, writeJson } from '../utils/fs.js';
import { promptSelect, promptInput } from '../cli/prompts.js';

export async function listTemplates() {
  const entries = await fs.readdir(TEMPLATE_ROOT, { withFileTypes: true });
  const templates = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const templateDir = path.join(TEMPLATE_ROOT, entry.name, 'template');
    if (!(await pathExists(templateDir))) continue;
    let description = '';
    try {
      const metadata = await readJson(path.join(TEMPLATE_ROOT, entry.name, 'package.json'));
      description = metadata.description ?? '';
    } catch {
      description = '';
    }
    templates.push({
      name: entry.name,
      description
    });
  }
  return templates.sort((a, b) => a.name.localeCompare(b.name));
}

export async function initialiseProject(options = {}) {
  const templates = await listTemplates();
  if (templates.length === 0) {
    throw new Error('未找到可用模板。');
  }

  let templateName = options.template;
  if (!templateName) {
    if (!process.stdin.isTTY) {
      throw new Error('缺少模板参数，请使用 --template 指定。');
    }
    templateName = await promptSelect(
      '请选择项目模板',
      templates.map((tpl) => ({
        value: tpl.name,
        label: tpl.description ? `${tpl.name} - ${tpl.description}` : tpl.name
      }))
    );
  }
  const template = templates.find((tpl) => tpl.name === templateName);
  if (!template) {
    throw new Error(`模板不存在: ${templateName}`);
  }

  let projectName = options.projectName;
  if (!projectName) {
    if (!process.stdin.isTTY) {
      throw new Error('缺少项目名称，请在命令中提供。');
    }
    projectName = await promptInput('请输入项目名称', { defaultValue: 'freelog-project' });
  }

  let projectVersion = options.version;
  if (!projectVersion) {
    if (!process.stdin.isTTY) {
      projectVersion = '1.0.0';
    } else {
      projectVersion = await promptInput('请输入初始版本号', { defaultValue: '1.0.0' });
    }
  }

  const targetDir = path.resolve(projectName);
  const targetExists = await pathExists(targetDir);
  if (targetExists) {
    if (!options.force) {
      throw new Error(`目标目录 ${targetDir} 已存在，可使用 --force 覆盖。`);
    }
  } else {
    await ensureDir(targetDir);
  }

  const templatePath = path.join(TEMPLATE_ROOT, template.name, 'template');
  await copyTemplate(templatePath, targetDir);

  const pkgPath = path.join(targetDir, 'package.json');
  if (await pathExists(pkgPath)) {
    const pkg = await readJson(pkgPath);
    pkg.name = options.packageName ?? formatPackageName(projectName);
    pkg.version = projectVersion;
    await writeJson(pkgPath, pkg);
  }

  const freelogJsonPath = path.join(targetDir, 'freelog.json');
  if (await pathExists(freelogJsonPath)) {
    const freelogConfig = await readJson(freelogJsonPath);
    freelogConfig.version = projectVersion;
    if (freelogConfig.resource) {
      freelogConfig.resource.resourceName = projectName;
      freelogConfig.resource.description = freelogConfig.resource.description || '';
    }
    await writeJson(freelogJsonPath, freelogConfig);
  }

  return {
    template: template.name,
    projectName,
    version: projectVersion,
    relativePath: path.relative(process.cwd(), targetDir) || '.'
  };
}

function formatPackageName(name) {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'freelog-project'
  );
}

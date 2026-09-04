import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import semver from 'semver';

const root = path.dirname(fileURLToPath(import.meta.url));
const compatPath = path.resolve(root, '../compat/template-compat.json');
const pkgPath = path.resolve(root, '../package.json');
const templatesRoot = path.resolve(root, '../../templates');
const viteDevOnlyDependencyPatterns = [
  /^@types\//,
  /^@vitejs\//,
  /^(?:typescript|vite|vue-tsc|oxlint)$/,
];

function readJsonFile(p) {
  let s = fs.readFileSync(p, 'utf8');
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  return JSON.parse(s);
}

const compat = readJsonFile(compatPath);
const pkg = readJsonFile(pkgPath);

function fail(msg) {
  console.error(`check:compat ✖ ${msg}`);
  process.exit(1);
}

function readJson(p) {
  let s = fs.readFileSync(p, 'utf8');
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  return JSON.parse(s);
}

if (!/^0\.(4|5)\.\d+/.test(pkg.version)) {
  fail(`cli version ${pkg.version} 必须以 0.4.x 或 0.5.x 开头`);
}
if (compat.cliVersion !== pkg.version) {
  fail(`compat.cliVersion (${compat.cliVersion}) !== package.json version (${pkg.version})`);
}

/** @type {Array<[string, { npmName: string, version: string }, string|null]>} */
const allRefs = [];

for (const [runtime, block] of Object.entries(compat.runtimes || {})) {
  for (const [id, ref] of Object.entries(block.templates || {})) {
    if (ref.version !== 'latest' && !semver.valid(ref.version)) {
      fail(`runtime ${runtime} / ${id} version ${ref.version} 不是 latest 或合法 SemVer`);
    }
    allRefs.push([id, ref, runtime]);
  }
}

for (const [id, ref] of Object.entries(compat.noRuntime?.templates || {})) {
  if (!semver.valid(ref.version)) {
    fail(`noRuntime ${id} version ${ref.version} 非法`);
  }
  allRefs.push([id, ref, null]);
}

for (const [id, ref, runtime] of allRefs) {
  const manifestPath = path.join(templatesRoot, id, 'template.manifest.json');
  if (!fs.existsSync(manifestPath)) {
    fail(`缺少 packages/templates/${id}/template.manifest.json`);
  }
  const manifest = readJson(manifestPath);
  if (manifest.id !== id) fail(`${id}: manifest.id !== 目录名`);
  if (manifest.npmName !== ref.npmName) {
    fail(`${id}: manifest.npmName (${manifest.npmName}) !== compat (${ref.npmName})`);
  }
  if (!semver.valid(manifest.version)) {
    fail(`${id}: manifest.version (${manifest.version}) 不是合法 SemVer`);
  }
  if (ref.version !== 'latest' && manifest.version !== ref.version) {
    fail(`${id}: manifest.version (${manifest.version}) !== compat (${ref.version})`);
  }
  const templatePackagePath = path.join(templatesRoot, id, 'package.json');
  if (!fs.existsSync(templatePackagePath)) {
    fail(`${id}: 缺少模板发布 package.json`);
  }
  const templatePackage = readJson(templatePackagePath);
  if (templatePackage.name !== ref.npmName || templatePackage.version !== manifest.version) {
    fail(
      `${id}: package (${templatePackage.name}@${templatePackage.version}) 与 manifest (${manifest.npmName}@${manifest.version}) 不一致`,
    );
  }
  if (runtime) {
    const versions = manifest.runtimeVersions || [];
    if (!versions.includes(runtime)) {
      fail(`${id}: manifest.runtimeVersions 须含 ${runtime}`);
    }
    if (manifest.freelogRuntimeRange !== compat.runtimes[runtime].freelogRuntimeRange) {
      fail(`${id}: freelogRuntimeRange 与 compat.runtimes[${runtime}] 不一致`);
    }
  }
  const templateDir = path.join(templatesRoot, id, 'template');
  if (!fs.existsSync(templateDir)) {
    fail(`缺少 packages/templates/${id}/template/`);
  }
  const generatedPackagePath = path.join(templateDir, 'package.json');
  if (id.startsWith('vite-') && fs.existsSync(generatedPackagePath)) {
    const generatedPackage = readJson(generatedPackagePath);
    const productionDependencies = Object.keys(generatedPackage.dependencies || {});
    const misplaced = productionDependencies.filter((name) =>
      viteDevOnlyDependencyPatterns.some((pattern) => pattern.test(name)),
    );
    if (misplaced.length) {
      fail(`${id}: 构建/类型依赖不得放入 dependencies (${misplaced.join(', ')})`);
    }
    if (productionDependencies.includes('freelog-type')) {
      fail(`${id}: 浏览器模板不得携带未使用的服务端 freelog-type`);
    }
  }
}

console.log(`check:compat ✔ (${allRefs.length} templates)`);

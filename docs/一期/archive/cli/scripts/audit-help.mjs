import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const cli = path.resolve("dist/bin/index.js");
const cmdDir = path.resolve("src/commands");

function walk(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walk(p));
    else if (ent.name.endsWith(".ts")) out.push(p);
  }
  return out;
}

const noDesc = [];
for (const file of walk(cmdDir)) {
  const text = fs.readFileSync(file, "utf8");
  const re = /^\s*['"]?([\w-]+)['"]?\s*:\s*\{([^}]*)\}/gm;
  let m;
  while ((m = re.exec(text)) !== null) {
    const name = m[1];
    const body = m[2];
    if (!body.includes("type:")) continue;
    if (body.includes("description:")) continue;
    if (["subCommands", "meta", "run", "args"].includes(name)) continue;
    noDesc.push(path.relative(cmdDir, file).replace(/\\/g, "/") + " :: " + name);
  }
}

const paths = [
  [], ["login"], ["logout"], ["status"], ["validate"], ["doctor"], ["diff"], ["release"],
  ["completion"], ["completion","bash"], ["completion","zsh"],
  ["config"], ["config","show"], ["config","set"], ["config","init"],
  ["workspace"], ["workspace","list"],
  ["type"], ["type","list"], ["type","search"], ["type","info"], ["type","pick"],
  ["template"], ["template","list"],
  ["init"], ["init","theme"], ["init","widget"], ["init","package"],
  ["bind"], ["create"], ["resource"], ["resource","import-dir"], ["resource","search"],
  ["publish"], ["draft"], ["draft","push"], ["draft","pull"], ["draft","discard"],
  ["dep"], ["dep","add"], ["dep","remove"], ["dep","list"], ["dep","update"], ["dep","auth"], ["dep","init-auth-map"],
  ["version"], ["version","set"], ["version","bump"], ["version","edit"], ["version","show"],
  ["policy"], ["policy","init"], ["policy","apply"], ["policy","list"], ["policy","set"],
  ["online"], ["offline"], ["update"], ["pull"],
  ["collection"], ["collection","create"], ["collection","init-from-folder"], ["collection","update"],
  ["collection","version"], ["collection","policy"], ["collection","properties"], ["collection","publish"],
  ["collection","collect-rules"], ["collection","rss"], ["collection","logs"],
  ["collection","item"], ["collection","item","add"], ["collection","item","import-dir"], ["collection","item","remove"], ["collection","item","update"], ["collection","item","reorder"],
  ["cover"], ["cover","compare"], ["lang"], ["lang","show"], ["lang","set"],
];

function runHelp(argv) {
  const r = spawnSync(process.execPath, [cli, ...argv, "--help"], { encoding: "utf8", cwd: path.dirname(cli) });
  return (r.stdout || "") + (r.stderr || "");
}

const rootHelp = runHelp([]);
const issues = [];
for (const p of paths) {
  const out = runHelp(p);
  const label = p.length ? p.join(" ") : "(root)";
  const isRootFallback = out.includes("USAGE freelog-cli login|logout") && p.length >= 2;
  const bareFlags = [...out.matchAll(/^(\s+--[\w-]+)\s*$/gm)].map(x=>x[1].trim());
  const missingDescInHelp = bareFlags;
  if (isRootFallback) issues.push({ label, kind: "help-fallback-root", detail: "nested --help shows root catalog" });
  if (p.length === 0) {
    for (const flag of ["--env","--lang","--cwd","--no-auto-pull","--json","--debug"]) {
      if (!out.includes(flag)) issues.push({ label, kind: "missing-global-flag", detail: flag });
    }
  }
  if (missingDescInHelp.length >= 3) {
    issues.push({ label, kind: "bare-flags-no-desc", detail: missingDescInHelp.slice(0,12).join(", ") + (missingDescInHelp.length>12?"...":"") });
  }
}

console.log(JSON.stringify({ noDescCount: noDesc.length, noDesc: noDesc.slice(0,80), issues }, null, 2));

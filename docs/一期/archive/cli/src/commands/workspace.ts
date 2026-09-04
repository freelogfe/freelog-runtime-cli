import { defineCommand } from 'citty';
import { consola } from 'consola';
import {applyCommandFlags, handleCommandError, writeJsonSuccess} from '../core/command.js';
import { cliReadCommandArgs } from '../core/cliArgs.js';
import { resolveCwd } from '../config/project.js';
import { scanWorkspaceProjects } from '../services/workspaceScan.js';

const workspaceListCommand = defineCommand({
  meta: { name: 'list', description: '列出子目录中的 freelog.manifest.json' },
  args: {
    depth: { type: 'string', description: '最大递归深度，默认 5' },
    ...cliReadCommandArgs,
    cwd: { type: 'string', description: '扫描根目录，默认当前目录' },
  },
  async run({ args }) {
    try {
      applyCommandFlags(args);
      const root = resolveCwd(args.cwd);
      const depth = args.depth ? Number(args.depth) : 5;
      const projects = scanWorkspaceProjects(root, Number.isFinite(depth) ? depth : 5);

      if (args.json) {
        writeJsonSuccess('workspace', { root, projects });
        return;
      }

      if (projects.length === 0) {
        consola.warn(`未在 ${root} 下找到 freelog.manifest.json`);
        return;
      }

      for (const p of projects) {
        const id = p.resourceId ? ` id=${p.resourceId}` : '';
        consola.info(
          `${p.path}  subject=${p.subject ?? '?'}  name=${p.name ?? '-'}${id}`,
        );
      }
      consola.success(`共 ${projects.length} 个项目`);
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});

export const workspaceCommand = defineCommand({
  meta: { name: 'workspace', description: 'monorepo 工作区扫描' },
  subCommands: {
    list: workspaceListCommand,
  },
});

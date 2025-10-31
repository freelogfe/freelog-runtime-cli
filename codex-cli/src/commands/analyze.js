import fs from 'fs-extra';
import path from 'node:path';
import { analyzeProject } from '../services/analyze-service.js';
import { withSpinner } from '../cli/spinner.js';

export function buildAnalyzeCommand(renderer) {
  return {
    matches: (command, subcommand) => command === 'analyze' && !subcommand,
    handler: async ({ options }) => {
      const result = await withSpinner('正在分析构建产物...', () => analyzeProject(options));
      if (result.output) {
        await writeOutputFile(result);
        renderer.success(`分析结果已保存至 ${result.output}`);
        return;
      }
      if (result.format === 'json') {
        renderer.json(result);
        return;
      }
      renderer.success('分析完成，输出结构如下:');
      renderer.table(
        result.entries.map((item) => [item.path, `${(item.size / 1024).toFixed(2)} KB`, item.type]),
        { header: ['文件', '大小', '类型'] }
      );
      renderer.list([
        `文件总数: ${result.entries.length}`,
        `总体积: ${(result.totalSize / 1024).toFixed(2)} KB`,
        `来源: ${result.type === 'file' ? '单文件' : result.baseDir}`
      ]);
    }
  };
}

async function writeOutputFile(result) {
  const resolved = path.resolve(result.output);
  const payload = {
    type: result.type,
    baseDir: result.baseDir,
    entries: result.entries,
    totalSize: result.totalSize
  };
  await fs.writeFile(resolved, JSON.stringify(payload, null, 2), 'utf8');
}

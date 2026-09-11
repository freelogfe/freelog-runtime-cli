/** `policy list` 命令：完整类型链 + 固定 50 条交互翻页。 */

import { Command } from 'commander';
import { addSharedOptions, readSharedOptions } from '../../core/cliArgs';
import { resolveCwd } from '../../domain/account/login';
import { isInteractive, selectQuestion } from '../../core/tty';
import { formatPolicyListPage, getPolicyList, POLICY_LIST_PAGE_SIZE, policyListPage, type PolicyListPage } from '../../domain/policy/list';

/** 在已加载的策略快照上翻页，不重复读取平台，也不写任何状态。 */
async function showPolicyPages(pageFor: (page: number) => PolicyListPage): Promise<void> {
  let page = 1;
  while (true) {
    const current = pageFor(page);
    console.log(formatPolicyListPage(current));
    if (!current.hasPrevious && !current.hasNext) return;
    if (!isInteractive()) {
      if (current.hasNext) {
        console.log(`还有 ${current.total - current.page * POLICY_LIST_PAGE_SIZE} 条策略；请在交互终端运行 policy list 查看后续页`);
      }
      return;
    }
    const action = await selectQuestion('授权策略列表', [
      ...(current.hasPrevious ? [{ name: '上一页', value: '__previous__' }] : []),
      ...(current.hasNext ? [{ name: '下一页', value: '__next__' }] : []),
      { name: '退出', value: '__exit__' },
    ]);
    if (action === '__exit__') return;
    page += action === '__next__' ? 1 : -1;
  }
}

/** policy list 命令装配。 */
export function createPolicyListCommand(): Command {
  const command = addSharedOptions(new Command('list'));
  command
    .description(
      // i18n: cli.command.policy.list.description
      '看已有策略及资源类型层级',
    )
    .action(async function(this: Command) {
      const shared = readSharedOptions(this);
      const list = await getPolicyList({
        cwd: resolveCwd(shared.cwd),
        file: shared.file,
      });
      await showPolicyPages((page) => policyListPage(list, page));
    });
  return command;
}

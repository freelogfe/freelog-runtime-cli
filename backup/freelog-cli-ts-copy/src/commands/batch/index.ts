/**
 * 批量命令定义
 */

import { Command } from 'commander';
import { executeBatchInit } from './init';
import { executeBatchCreate } from './create';
import { executeBatchPublish } from './publish';
import { executeBatchAddToCollection } from './add-to-collection';
import { executeBatchAdd } from './add';
import { executeBatchList } from './list';
import { executeBatchUpdate } from './update';
import { executeBatchUpdateVersion } from './update-version';
import { executeBatchRemove } from './remove';
import { executeBatchSync } from './sync';
import { executeBatchSyncVersion } from './sync-version';
import { executeBatchPublishOne } from './publish-one';
import { executeBatchUpdateAndPublish } from './update-and-publish';
import { executeBatchLoadFromCollection } from './load-from-collection';
import { executeBatchEdit } from './edit';
import { executeBatchOnline } from './online';
import { executeBatchOffline } from './offline';
import { executeBatchDepAdd } from './dep/add';
import { executeBatchDepList } from './dep/list';
import { executeBatchDepRemove } from './dep/remove';
import { executeBatchDepUpdate } from './dep/update';
import { executeBatchDepChange } from './dep/change';
import { executeBatchDepSync } from './dep/sync';
import { executeBatchPolicyAdd } from './policy/add';
import { executeBatchPolicyList } from './policy/list';

/**
 * 创建并配置批量命令
 */
export function createBatchCommand(): Command {
  const batchCommand = new Command('batch')
    .description('批量资源管理命令（用于管理合集的单品资源）');

  batchCommand
    .command('init [directory]')
    .description('初始化批量资源配置文件（可扫描文件夹自动生成资源列表）')
    .option('-c, --config <path>', '指定批量配置文件路径')
    .option('--debug', '调试模式')
    .action(executeBatchInit);

  batchCommand
    .command('create [resourceNames]')
    .description('批量创建资源')
    .option('-c, --config <path>', '指定批量配置文件路径')
    .option('--force', '强制创建所有未创建的资源（不需要选择）')
    .option('--select', '交互式选择要创建的资源')
    .option('--debug', '调试模式')
    .action(executeBatchCreate);

  batchCommand
    .command('publish')
    .description('批量发布资源版本')
    .option('-c, --config <path>', '指定批量配置文件路径')
    .option('--force', '强制发布（没有 resourceId 就创建资源后发布）')
    .option('--debug', '调试模式')
    .action(executeBatchPublish);

  batchCommand
    .command('add [filePath]')
    .description('添加单个资源项到批量配置（支持文件或目录）')
    .option('-c, --config <path>', '指定批量配置文件路径')
    .option('--debug', '调试模式')
    .action(executeBatchAdd);

  batchCommand
    .command('add-to-collection [collectionConfig]')
    .description('批量将资源添加到合集')
    .option('-c, --config <path>', '指定批量配置文件路径')
    .option('--debug', '调试模式')
    .action(executeBatchAddToCollection);

  batchCommand
    .command('list')
    .description('列出批量配置中的所有资源及其状态')
    .option('-c, --config <path>', '指定批量配置文件路径')
    .option('--debug', '调试模式')
    .action(executeBatchList);

  batchCommand
    .command('update [resourceNames]')
    .description('批量更新资源信息（intro、coverImages、tags、status等）')
    .option('-c, --config <path>', '指定批量配置文件路径')
    .option('--debug', '调试模式')
    .action(executeBatchUpdate);

  batchCommand
    .command('update-version [resourceNames]')
    .description('批量更新版本信息（version、description、filePath等）')
    .option('-c, --config <path>', '指定批量配置文件路径')
    .option('--debug', '调试模式')
    .action(executeBatchUpdateVersion);

  batchCommand
    .command('remove [resourceNames]')
    .description('从批量配置中移除资源项')
    .option('-c, --config <path>', '指定批量配置文件路径')
    .option('--debug', '调试模式')
    .action(executeBatchRemove);

  batchCommand
    .command('sync [resourceNames]')
    .description('从服务器同步资源信息到批量配置')
    .option('-c, --config <path>', '指定批量配置文件路径')
    .option('--mode <mode>', '同步模式：cover（覆盖）或 append（追加）', 'cover')
    .option('--debug', '调试模式')
    .action(executeBatchSync);

  batchCommand
    .command('load-from-collection [collectionConfig]')
    .description('从合集中拉取单品列表并填充到批量配置')
    .option('-c, --config <path>', '指定批量配置文件路径')
    .option('--collection-id <id>', '指定合集ID（如果不使用配置文件）')
    .option('--mode <mode>', '同步模式：cover（覆盖）或 append（追加）', 'append')
    .option('--debug', '调试模式')
    .action(executeBatchLoadFromCollection);

  batchCommand
    .command('sync-version [resourceNames]')
    .description('从服务器同步版本信息到批量配置')
    .option('-c, --config <path>', '指定批量配置文件路径')
    .option('--mode <mode>', '同步模式：cover（覆盖）或 append（追加）', 'cover')
    .option('--debug', '调试模式')
    .action(executeBatchSyncVersion);

  batchCommand
    .command('publish-one <resourceName>')
    .description('单独发布某个资源的版本')
    .option('-c, --config <path>', '指定批量配置文件路径')
    .option('--debug', '调试模式')
    .action(executeBatchPublishOne);

  batchCommand
    .command('update-and-publish [resourceNames]')
    .description('更新版本信息并发布版本（一次性完成）')
    .option('-c, --config <path>', '指定批量配置文件路径')
    .option('--debug', '调试模式')
    .action(executeBatchUpdateAndPublish);

  batchCommand
    .command('edit <resourceName>')
    .description('编辑单个资源的所有信息（资源信息和版本信息）')
    .option('-c, --config <path>', '指定批量配置文件路径')
    .option('--debug', '调试模式')
    .action(executeBatchEdit);

  batchCommand
    .command('online [resourceNames]')
    .description('批量上架资源')
    .option('-c, --config <path>', '指定批量配置文件路径')
    .option('--debug', '调试模式')
    .action(executeBatchOnline);

  batchCommand
    .command('offline [resourceNames]')
    .description('批量下架资源')
    .option('-c, --config <path>', '指定批量配置文件路径')
    .option('--debug', '调试模式')
    .action(executeBatchOffline);

  // 批量依赖管理子命令组
  const batchDepCommand = new Command('dep')
    .description('批量依赖管理');

  batchDepCommand
    .command('add <resourceName> <dependencyId>')
    .description('为批量配置中的某个资源添加依赖')
    .option('-c, --config <path>', '指定批量配置文件路径')
    .option('-v, --version <versionRange>', '指定依赖版本范围 (例如: ^1.0.0)')
    .option('--debug', '调试模式')
    .action(executeBatchDepAdd);

  batchDepCommand
    .command('list [resourceName]')
    .description('查看批量配置中某个资源的依赖列表')
    .option('-c, --config <path>', '指定批量配置文件路径')
    .option('--debug', '调试模式')
    .action(executeBatchDepList);

  batchDepCommand
    .command('remove <resourceName> <dependencyId>')
    .description('为批量配置中的某个资源移除依赖')
    .option('-c, --config <path>', '指定批量配置文件路径')
    .option('--debug', '调试模式')
    .action(executeBatchDepRemove);

  batchDepCommand
    .command('update <resourceName> <dependencyId> [versionRange]')
    .description('为批量配置中的某个资源更新依赖的版本范围')
    .option('-c, --config <path>', '指定批量配置文件路径')
    .option('--debug', '调试模式')
    .action(executeBatchDepUpdate);

  batchDepCommand
    .command('change <resourceName> <dependencyId> [versionRange]')
    .description('修改依赖版本（update 的别名）')
    .option('-c, --config <path>', '指定批量配置文件路径')
    .option('--debug', '调试模式')
    .action(executeBatchDepChange);

  batchDepCommand
    .command('sync <resourceName> [targetVersion]')
    .description('为批量配置中的某个资源同步依赖（检查更新、更新到最新版本等）')
    .option('-c, --config <path>', '指定批量配置文件路径')
    .option('--debug', '调试模式')
    .action(executeBatchDepSync);

  batchCommand.addCommand(batchDepCommand);

  // 批量策略管理子命令组
  const batchPolicyCommand = new Command('policy')
    .description('批量策略管理');

  batchPolicyCommand
    .command('add <resourceName>')
    .description('为批量配置中的某个资源添加策略')
    .option('-c, --config <path>', '指定批量配置文件路径')
    .option('--debug', '调试模式')
    .action(executeBatchPolicyAdd);

  batchPolicyCommand
    .command('list [resourceName]')
    .description('查看批量配置中某个资源的策略列表')
    .option('-c, --config <path>', '指定批量配置文件路径')
    .option('--debug', '调试模式')
    .action(executeBatchPolicyList);

  batchCommand.addCommand(batchPolicyCommand);

  return batchCommand;
}


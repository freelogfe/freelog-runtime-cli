/**
 * 合集命令定义
 */

import { Command } from 'commander';
import { executeCollectionInit } from './init';
import { executeCollectionCreate } from './create';
import { executeCollectionUpdate } from './update';
import { executeCollectionItemAdd } from './item/add';
import { executeCollectionItemRemove } from './item/remove';
import { executeCollectionDepAdd } from './dep/add';
import { executeCollectionPolicyAdd, executeCollectionPolicyList } from './policy';
import { executeCollectionPublish, executeCollectionUnpublish } from './publish';

/**
 * 创建并配置合集命令
 */
export function createCollectionCommand(): Command {
  const collectionCommand = new Command('collection')
    .description('合集管理命令');

  collectionCommand
    .command('init [name]')
    .description('初始化合集配置')
    .option('-c, --config <path>', '指定合集配置文件路径')
    .option('--debug', '调试模式')
    .action(executeCollectionInit);

  collectionCommand
    .command('create [name]')
    .description('创建 Freelog 合集资源')
    .option('-c, --config <path>', '指定合集配置文件路径')
    .option('--debug', '调试模式')
    .action(executeCollectionCreate);

  collectionCommand
    .command('update [resource]')
    .description('更新合集资源信息（intro、coverImages、tags、status、catalogueProperty）')
    .option('-c, --config <path>', '指定合集配置文件路径')
    .option('--intro <text>', '资源介绍')
    .option('--cover <urls>', '封面图 URL（多个用逗号分隔）')
    .option('--tags <tags>', '标签（多个用逗号分隔）')
    .option('--status <status>', '资源状态（1:上架 4:下架）')
    .option('--debug', '调试模式')
    .action(executeCollectionUpdate);

  const collectionItemCommand = new Command('item')
    .description('合集单品管理命令');

  collectionItemCommand
    .command('add <resourceIdOrName>')
    .description('添加合集单品（需要签约支付流程，包括上抛资源）')
    .option('-c, --config <path>', '指定合集配置文件路径')
    .option('--debug', '调试模式')
    .action(executeCollectionItemAdd);

  collectionItemCommand
    .command('remove <resourceIdOrName>')
    .description('删除合集单品')
    .option('-c, --config <path>', '指定合集配置文件路径')
    .option('--debug', '调试模式')
    .action(executeCollectionItemRemove);

  collectionCommand.addCommand(collectionItemCommand);

  const collectionDepCommand = new Command('dep')
    .description('合集依赖管理命令');

  collectionDepCommand
    .command('add <resourceIdOrName>')
    .description('为合集添加依赖（需要完整的签约支付流程，包括主资源和上抛资源）')
    .option('-c, --config <path>', '指定合集配置文件路径')
    .option('--debug', '调试模式')
    .action(executeCollectionDepAdd);

  collectionCommand.addCommand(collectionDepCommand);

  const collectionPolicyCommand = new Command('policy')
    .description('合集策略管理命令');

  collectionPolicyCommand
    .command('add')
    .description('为合集添加授权策略')
    .option('-c, --config <path>', '指定合集配置文件路径')
    .option('--debug', '调试模式')
    .action(executeCollectionPolicyAdd);

  collectionPolicyCommand
    .command('list')
    .description('查看和管理合集的授权策略')
    .option('-c, --config <path>', '指定合集配置文件路径')
    .option('--debug', '调试模式')
    .action(executeCollectionPolicyList);

  collectionCommand.addCommand(collectionPolicyCommand);

  collectionCommand
    .command('publish')
    .description('上架合集（更新合集信息并提交草稿）')
    .option('-c, --config <path>', '指定合集配置文件路径')
    .option('--debug', '调试模式')
    .action(executeCollectionPublish);

  collectionCommand
    .command('unpublish')
    .description('下架合集')
    .option('-c, --config <path>', '指定合集配置文件路径')
    .option('--debug', '调试模式')
    .action(executeCollectionUnpublish);

  return collectionCommand;
}


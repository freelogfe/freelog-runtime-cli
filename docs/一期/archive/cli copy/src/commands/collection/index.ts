import { defineCommand } from 'citty';
import { createCmd } from './create.js';
import { itemCommand } from './item.js';
import { updateCmd } from './update.js';
import { versionCommand } from './version.js';
import { policyCommand } from './policy.js';
import { propertiesCommand } from './properties.js';
import { publishCmd } from './publish.js';
import { collectRulesCommand } from './collect-rules.js';
import { rssCommand } from './rss.js';
import { logsCmd } from './logs.js';
import { initFromFolderCmd } from './init-from-folder.js';

export const collectionCommand = defineCommand({
  meta: { name: 'collection', description: '合集创建与目录管理' },
  subCommands: {
    create: createCmd,
    'init-from-folder': initFromFolderCmd,
    item: itemCommand,
    update: updateCmd,
    version: versionCommand,
    policy: policyCommand,
    properties: propertiesCommand,
    publish: publishCmd,
    'collect-rules': collectRulesCommand,
    rss: rssCommand,
    logs: logsCmd,
  },
});

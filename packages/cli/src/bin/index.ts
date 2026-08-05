import { installToolsLibForNode } from '../platform/bootstrap.js';

installToolsLibForNode();

import { createRequire } from 'node:module';
import { defineCommand, runMain } from 'citty';
import { loginCommand } from '../commands/login.js';
import { logoutCommand } from '../commands/logout.js';
import { statusCommand } from '../commands/status.js';
import { initCommand } from '../commands/init.js';
import { createCommand } from '../commands/create.js';
import { publishCommand } from '../commands/publish.js';
import { policyCommand } from '../commands/policy.js';
import { onlineCommand, offlineCommand } from '../commands/online.js';
import { updateCommand } from '../commands/update.js';
import { pullCommand } from '../commands/pull.js';
import { draftCommand } from '../commands/draft.js';
import { depCommand } from '../commands/dep.js';
import { versionCommand } from '../commands/version.js';
import { collectionCommand } from '../commands/collection.js';
import { resourceCommand } from '../commands/resource.js';
import { typeCommand } from '../commands/type.js';
import { templateCommand } from '../commands/template.js';

const require = createRequire(import.meta.url);
const pkg = require('../../package.json') as { version?: string };

const main = defineCommand({
  meta: {
    name: 'freelog-cli',
    version: pkg.version || '0.5.0',
    description: 'Freelog CLI — 与 Console 同源 @freelog/tools-lib2 的资源脚手架与发行工具',
  },
  subCommands: {
    login: loginCommand,
    logout: logoutCommand,
    status: statusCommand,
    type: typeCommand,
    template: templateCommand,
    init: initCommand,
    create: createCommand,
    resource: resourceCommand,
    publish: publishCommand,
    draft: draftCommand,
    dep: depCommand,
    version: versionCommand,
    policy: policyCommand,
    online: onlineCommand,
    offline: offlineCommand,
    update: updateCommand,
    pull: pullCommand,
    collection: collectionCommand,
  },
});

runMain(main);

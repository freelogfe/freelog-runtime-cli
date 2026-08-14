import { installToolsLibForNode } from '../platform/bootstrap.js';

installToolsLibForNode();

import { createRequire } from 'node:module';
import { defineCommand, runMain, type SubCommandsDef } from 'citty';
import { loginCommand } from '../commands/login.js';
import { logoutCommand } from '../commands/logout.js';
import { statusCommand } from '../commands/status.js';
import { initCommand } from '../commands/init.js';
import { bindCommand } from '../commands/bind.js';
import { createCommand } from '../commands/create.js';
import { publishCommand } from '../commands/publish.js';
import { policyCommand } from '../commands/policy.js';
import { onlineCommand, offlineCommand } from '../commands/online.js';
import { updateCommand } from '../commands/update.js';
import { pullCommand } from '../commands/pull.js';
import { draftCommand } from '../commands/draft.js';
import { depCommand } from '../commands/dep.js';
import { versionCommand } from '../commands/version.js';
import { collectionCommand } from '../commands/collection/index.js';
import { resourceCommand } from '../commands/resource.js';
import { typeCommand } from '../commands/type.js';
import { templateCommand } from '../commands/template.js';
import { metaCommand } from '../commands/meta.js';
import { coverCommand } from '../commands/cover.js';
import { validateCommand, doctorCommand } from '../commands/validate.js';
import { diffCommand } from '../commands/diff.js';
import { releaseCommand } from '../commands/release.js';
import { completionCommand } from '../commands/completion.js';
import { configCommand } from '../commands/config.js';
import { workspaceCommand } from '../commands/workspace.js';
import { langCommand } from '../commands/lang.js';
import { sessionInteractiveCommand } from '../commands/sessionInteractive.js';
import { studioCommand } from '../commands/studio.js';
import { tryPrintInitPresetHelpFromArgv } from '../commands/initHelp.js';

if (tryPrintInitPresetHelpFromArgv(process.argv)) {
  process.exit(0);
}

const require = createRequire(import.meta.url);
const pkg = require('../../package.json') as { version?: string };

const subCommands: SubCommandsDef = {
    login: loginCommand,
    logout: logoutCommand,
    status: statusCommand,
    validate: validateCommand,
    doctor: doctorCommand,
    diff: diffCommand,
    release: releaseCommand,
    completion: completionCommand,
    config: configCommand,
    workspace: workspaceCommand,
    type: typeCommand,
    template: templateCommand,
    init: initCommand,
    bind: bindCommand,
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
    cover: coverCommand,
    lang: langCommand,
    session: sessionInteractiveCommand,
    studio: studioCommand,
};

if (process.env.FREELOG_DEV === '1') {
  subCommands.meta = metaCommand;
}

import { mainGlobalArgs } from '../core/cliArgs.js';

const main = defineCommand({
  meta: {
    name: 'freelog-cli',
    version: pkg.version || '0.5.0',
    description: 'Freelog CLI — 与 Console 同源 @freelog/tools-lib2 的资源脚手架与发行工具',
  },
  args: mainGlobalArgs,
  subCommands,
});

runMain(main);

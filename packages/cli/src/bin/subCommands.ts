import type { SubCommandsDef } from 'citty';
import { bindCommand } from '../commands/bind.js';
import { collectionCommand } from '../commands/collection/index.js';
import { completionCommand } from '../commands/completion.js';
import { configCommand } from '../commands/config.js';
import { coverCommand } from '../commands/cover.js';
import { createCommand } from '../commands/create.js';
import { depCommand } from '../commands/dep.js';
import { diffCommand } from '../commands/diff.js';
import { draftCommand } from '../commands/draft.js';
import { initCommand } from '../commands/init.js';
import { langCommand } from '../commands/lang.js';
import { loginCommand } from '../commands/login.js';
import { logoutCommand } from '../commands/logout.js';
import { metaCommand } from '../commands/meta.js';
import { offlineCommand, onlineCommand } from '../commands/online.js';
import { policyCommand } from '../commands/policy.js';
import { publishCommand } from '../commands/publish.js';
import { pullCommand } from '../commands/pull.js';
import { releaseCommand } from '../commands/release.js';
import { resourceCommand } from '../commands/resource.js';
import { sessionInteractiveCommand } from '../commands/sessionInteractive.js';
import { startCommand } from '../commands/start.js';
import { statusCommand } from '../commands/status.js';
import { studioCommand } from '../commands/studio.js';
import { templateCommand } from '../commands/template.js';
import { typeCommand } from '../commands/type.js';
import { updateCommand } from '../commands/update.js';
import { validateCommand, doctorCommand } from '../commands/validate.js';
import { versionCommand } from '../commands/version.js';
import { workspaceCommand } from '../commands/workspace.js';

export function createSubCommands(devMode = process.env.FREELOG_DEV === '1'): SubCommandsDef {
  const subCommands: SubCommandsDef = {
    start: startCommand,
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
    lang: langCommand,
    session: sessionInteractiveCommand,
    studio: studioCommand,
  };

  if (devMode) {
    subCommands.meta = metaCommand;
    subCommands.cover = coverCommand;
  }

  return subCommands;
}

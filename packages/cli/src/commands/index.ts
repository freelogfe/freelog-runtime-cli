import { Command } from 'commander';
import { addSharedOptions } from '../core/cliArgs';
import { createLoginCommand } from './account/login';
import { createLogoutCommand } from './account/logout';
import { createCreateCommand } from './create/create';
import { createUpdateCommand } from './listing/update';
import { createPolicyApplyCommand } from './policy/apply';
import { createPolicyListCommand } from './policy/list';
import { createPolicySetCommand } from './policy/set';
import { createPolicyTemplateCommand } from './policy/template';
import { createBindCommand } from './project/bind';
import { createInitCommand } from './project/init';
import { createStatusCommand } from './project/status';
import { createTemplateCommand } from './project/template';
import { createTypeCommand } from './project/type';
import { createOfflineCommand } from './shelf/offline';
import { createOnlineCommand } from './shelf/online';
import { createValidateCommand } from './shelf/validate';
import { createVersionAttrCommand } from './version/attr';
import { createCreateVersionCommand } from './version/create-version';
import { createVersionDepCommand } from './version/dep';
import { createVersionDescriptionCommand } from './version/description';
import { registerDraftDescription } from './version/description-draft';
import { createVersionDraftCommand } from './version/draft';
import { createVersionOptionCommand } from './version/option';
import { createVersionSetCommand } from './version/set';
import { createVersionShowCommand } from './version/show';
import { createUpdateVersionCommand } from './version/update-version';

export { addSharedOptions } from '../core/cliArgs';

function createVersionCommand(): Command {
  const version = addSharedOptions(new Command('version'));
  version.description(
    // i18n: cli.command.version.description
    '看线上、管工作稿、改稿',
  );
  version.addCommand(createVersionShowCommand());
  version.addCommand(createVersionSetCommand());
  const draft = createVersionDraftCommand();
  registerDraftDescription(draft);
  version.addCommand(draft);
  version.addCommand(createVersionDescriptionCommand());
  version.addCommand(createVersionAttrCommand());
  version.addCommand(createVersionOptionCommand());
  version.addCommand(createVersionDepCommand());
  return version;
}

function createPolicyCommand(): Command {
  const policy = addSharedOptions(new Command('policy'));
  policy.description(
    // i18n: cli.command.policy.description
    '授权策略',
  );
  policy.addCommand(createPolicyListCommand());
  policy.addCommand(createPolicyTemplateCommand());
  policy.addCommand(createPolicyApplyCommand());
  policy.addCommand(createPolicySetCommand());
  return policy;
}

export function createSubCommands(): Record<string, Command> {
  return {
    login: createLoginCommand(),
    logout: createLogoutCommand(),
    init: createInitCommand(),
    template: createTemplateCommand(),
    type: createTypeCommand(),
    bind: createBindCommand(),
    status: createStatusCommand(),
    create: createCreateCommand(),
    version: createVersionCommand(),
    'create-version': createCreateVersionCommand(),
    'update-version': createUpdateVersionCommand(),
    update: createUpdateCommand(),
    policy: createPolicyCommand(),
    validate: createValidateCommand(),
    online: createOnlineCommand(),
    offline: createOfflineCommand(),
  };
}

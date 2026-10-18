import { setPlatform } from './platform/runtime';
import { createNodePlatform } from './platform/node';
import FUtil from './utils';
import FServiceAPI from './service-API';
import NodeI18nNext from './i18n/I18nNext.node-runtime';

setPlatform(createNodePlatform());

let i18nNext: NodeI18nNext | undefined;
const FI18n = {
  // CLI callers importing API/tools must not start OSS traffic before argument/env checks.
  // Explicit internationalization consumers retain the same lazily created singleton.
  get i18nNext(): NodeI18nNext {
    return i18nNext ??= new NodeI18nNext();
  },
};

export { FUtil, FServiceAPI, FI18n };

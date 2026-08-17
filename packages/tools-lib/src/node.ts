import { setPlatform } from './platform/runtime';
import { createNodePlatform } from './platform/node';
import FUtil from './utils';
import FServiceAPI from './service-API';
import NodeI18nNext from './i18n/I18nNext.node-runtime';

setPlatform(createNodePlatform());

const FI18n = {
  i18nNext: new NodeI18nNext(),
};

export { FUtil, FServiceAPI, FI18n };

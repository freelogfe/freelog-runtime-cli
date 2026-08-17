import * as Format from './format';
import * as Regexp from './regexp';
import * as LinkTo from './linkTo';
import * as Predefined from './predefined';
import Axios, {request} from './axios';
import * as Tool from './tools';
import * as Domain from './domain';
import { configurePlatform } from '../platform/runtime';
// import I18n from '../i18n';

const FUtil = {
  Format,
  Regexp,
  LinkTo,
  Predefined,
  Axios,
  Request: request,
  Tool,
  Domain,
  configurePlatform,
  // i18n: new I18n(),
};

export default FUtil;

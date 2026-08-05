import { setPlatform } from './platform/runtime';
import { createBrowserPlatform } from './platform/browser';
import FUtil from './utils/browser';
import FServiceAPI from './service-API';
import BrowserI18nNext from './i18n/I18nNext.browser';

setPlatform({
  ...createBrowserPlatform(),
  onAuthError: async ({ kind }) => {
    if (kind === 'unauthorized') {
      await FServiceAPI.User.logout();
      window.location.replace(
        `${FUtil.Domain.completeUrlByDomain('user')}${FUtil.LinkTo.login({ goTo: window.location.href })}`
      );
      return;
    }
    window.location.replace(
      `${FUtil.Domain.completeUrlByDomain('user')}${FUtil.LinkTo.userFreeze({ goTo: window.location.href })}`
    );
  },
});

const FI18n = {
  i18nNext: new BrowserI18nNext(),
};

export { FUtil, FServiceAPI, FI18n };

import * as React from 'react';
import BrowserI18nNext from './I18nNext.browser';

export default function createBrowserI18n() {
  const i18nNext = new BrowserI18nNext();

  function useResourcesTick(): number {
    const [tick, setTick] = React.useState(0);
    React.useEffect(() => i18nNext.subscribe(() => setTick((n) => n + 1)), []);
    return tick;
  }

  return { i18nNext, useResourcesTick };
}

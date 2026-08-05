import htmlReactParser from 'html-react-parser';
import { I18nNextCore } from './I18nNext.core';

export default class BrowserI18nNext extends I18nNextCore<string | JSX.Element | JSX.Element[]> {
  constructor() {
    super((html) => htmlReactParser(html));
  }
}

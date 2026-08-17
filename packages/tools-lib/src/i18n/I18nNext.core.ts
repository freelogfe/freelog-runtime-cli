import i18next, { Resource } from 'i18next';
import axios from 'axios';
import { getPlatform } from '../platform/runtime';
import type { LanguageKeyType } from '../platform/types';

const ossJsonUrl = 'https://freelog-i18n.oss-cn-shenzhen.aliyuncs.com/configs/i18n.json';
const ossJsonUrl_Test = 'https://freelog-i18n.oss-cn-shenzhen.aliyuncs.com/configs-test/i18n.json';

const allLanguage = [
  { value: 'en_US', label: 'English' },
  { value: 'zh_CN', label: '简体中文' },
] as const;

export type I18nTextParser<T> = (html: string) => T;

export class I18nNextCore<TAuto = string> {
  private _loadingData: 'NotStart' | 'Start' | 'End' = 'NotStart';
  private _taskQueue: Function[] = [];
  private _currentLanguage: LanguageKeyType;
  private readonly _parseRichText?: I18nTextParser<TAuto>;

  constructor(parseRichText?: I18nTextParser<TAuto>) {
    this._parseRichText = parseRichText;
    this._currentLanguage = getPlatform().getLocale?.() || 'zh_CN';
    void i18next.init({
      lng: this._currentLanguage,
      fallbackLng: 'zh_CN',
      resources: {
        zh_CN: { translation: {} },
        en_US: { translation: {} },
      },
      interpolation: {
        escapeValue: false,
        prefix: '{',
        suffix: '}',
      },
    });

    this.ready();

    this.ready = this.ready.bind(this);
    this.t = this.t.bind(this);
    this.tAuto = this.tAuto.bind(this);
    this.tJSXElement = this.tJSXElement.bind(this);
    this.changeLanguage = this.changeLanguage.bind(this);
    this.getAllLanguage = this.getAllLanguage.bind(this);
    this.getCurrentLanguage = this.getCurrentLanguage.bind(this);
  }

  async ready(this: I18nNextCore<TAuto>): Promise<void> {
    const exc = () => {
      while (this._taskQueue.length > 0) {
        const task = this._taskQueue.shift();
        task && task();
      }
    };
    const handleTasks = async () => {
      if (this._loadingData === 'End') {
        exc();
        return;
      }
      if (this._loadingData === 'Start') return;

      this._loadingData = 'Start';
      await this._handleData();
      exc();
    };
    const promise = new Promise<void>((resolve) => {
      this._taskQueue.push(resolve);
    });
    handleTasks();
    return promise;
  }

  t(this: I18nNextCore<TAuto>, key: string, options?: { [key: string]: any }): string {
    const k = key.trim();
    const out = i18next.t(k, options);
    return out == null ? k : String(out);
  }

  tJSXElement(this: I18nNextCore<TAuto>, key: string, options?: { [key: string]: any }): string | TAuto {
    return this.tAuto(key, options);
  }

  tAuto(this: I18nNextCore<TAuto>, key: string, options?: { [key: string]: any }): string | TAuto {
    const k = key.trim();
    const raw = i18next.t(k, options);
    const i18nStr = raw == null ? k : String(raw);
    const trimmed = i18nStr.trim();
    if (!/^<div\s+class\s*=\s*["']i18n["']/i.test(trimmed)) return i18nStr;
    return this._parseRichText ? this._parseRichText(trimmed) : trimmed;
  }

  changeLanguage(this: I18nNextCore<TAuto>, lng: LanguageKeyType): void {
    this._currentLanguage = lng;
    getPlatform().setLocale?.(lng);
    void i18next.changeLanguage(lng);
  }

  getAllLanguage(this: I18nNextCore<TAuto>): typeof allLanguage {
    return allLanguage;
  }

  getCurrentLanguage(this: I18nNextCore<TAuto>): LanguageKeyType {
    return this._currentLanguage;
  }

  private async _handleData(this: I18nNextCore<TAuto>): Promise<void> {
    const lng = this._currentLanguage;
    const cache = getPlatform().getI18nCache?.();
    let i18nextResources: Resource | null = cache ? JSON.parse(cache) : null;

    if (!i18nextResources) {
      i18nextResources = await this._fetchData();
    } else {
      void this._fetchData();
    }

    await i18next.init({
      resources: i18nextResources,
      lng,
      fallbackLng: 'zh_CN',
      interpolation: {
        escapeValue: false,
        prefix: '{',
        suffix: '}',
      },
    });
    this._loadingData = 'End';
  }

  private async _fetchData(this: I18nNextCore<TAuto>): Promise<Resource> {
    const platform = getPlatform();
    const useProdBundle = platform.useProdI18nBundle?.() ?? platform.getEnv() === 'prod';
    const url = useProdBundle ? ossJsonUrl : ossJsonUrl_Test;
    const response = await axios.get(url + '?timestamp=' + Date.now(), {
      withCredentials: false,
    });
    const source = response.data ?? response;

    const en_US: { [key: string]: string } = {};
    const zh_CN: { [key: string]: string } = {};
    for (const [key, value] of Object.entries(source)) {
      en_US[key] = (value as any).en_US;
      zh_CN[key] = (value as any).zh_CN;
    }

    const result: Resource = {
      en_US: { translation: en_US },
      zh_CN: { translation: zh_CN },
    };
    platform.setI18nCache?.(JSON.stringify(result));
    return result;
  }
}

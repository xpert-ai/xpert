import { createI18nInstance, RequestContext } from '@xpert-ai/plugin-sdk';
import { i18n as I18nInstance, TOptions } from 'i18next';

let i18nObject: I18nInstance = null;
export function translate(key: string, options?: TOptions) {
  options = options || {};
  options.lng = options.lng || RequestContext.getLanguageCode();
  return i18nObject?.t(key, options) || key;
}

export function initI18n(pluginDir: string): void {
  createI18nInstance(pluginDir).then((i18n) => {
    i18nObject = i18n;
  });
}

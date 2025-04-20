import i18next from 'i18next';
import Backend from 'i18next-http-backend';
import LanguageDetector from 'i18next-browser-languagedetector';

export async function initI18n() {
  await i18next
    .use(Backend)
    .use(LanguageDetector)
    .init({
      fallbackLng: 'en',
      fallbackNS: 'common',
      debug: true,
      ns: ['common', 'core', 'sql', 'xmla', 'echarts'],
      defaultNS: 'common', // default namespace
      backend: {
        loadPath: '/assets/locales/{{ns}}/{{lng}}.json',
      },
      interpolation: {
        escapeValue: false,
      },
      supportedLngs: ['zh', 'en', 'zh-Hans'],
      detection: {
        order: ['querystring', 'cookie', 'localStorage', 'sessionStorage', 'navigator', 'htmlTag', 'path', 'subdomain'],
      }
    });
}

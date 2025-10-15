import { createInstance, i18n as I18nInstance } from 'i18next'
import FsBackend from 'i18next-fs-backend'
import path from 'path'
import fs from 'fs'

export async function createI18nInstance(pluginDir: string, language?: string): Promise<I18nInstance> {
  const instance = createInstance()
  const i18nDir = path.join(pluginDir, 'i18n')

  // detect available languages dynamically
  const lngs = fs
    .readdirSync(i18nDir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace('.json', ''))

  await instance
    .use(FsBackend)
    .init({
      lng: language,
      fallbackLng: 'en',
      preload: lngs,
      ns: ['default'],
      defaultNS: 'default',
      backend: {
        loadPath: path.join(i18nDir, '{{lng}}.json'),
      },
      interpolation: { escapeValue: false },
    })

  return instance
}

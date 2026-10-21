import { createInstance } from 'i18next'
import { LanguagesMap } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'

const messages = createInstance()
void messages.init({
  initImmediate: false,
  fallbackLng: 'en',
  resources: {
    en: {
      translation: {
        invalidOptions: 'Invalid GitHub integration settings. Check the App ID, URL slug and webhook secret length.',
        validationOnly:
          'Configuration validated locally. GitHub authorization and repository access are verified by the GitHub Connector.'
      }
    },
    'zh-Hans': {
      translation: {
        invalidOptions: 'GitHub 集成配置无效，请检查 App ID、URL 标识和 Webhook 密钥长度。',
        validationOnly: '已完成本地配置校验。GitHub 授权及仓库访问由 GitHub Connector 验证。'
      }
    }
  }
})
export function integrationMessage(key: 'invalidOptions' | 'validationOnly') {
  const language = RequestContext.getLanguageCode()
  return messages.t(key, { lng: LanguagesMap[language] ?? language })
}

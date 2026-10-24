import { init } from 'i18next'
import { dependencyUpdateEvent } from './dependency-update-event'
import en from '../../i18n/en.json'
import zh from '../../i18n/zh-Hans.json'

describe('dependency update recommendations', () => {
    it.each(['en', 'zh-Hans'])('provides localized, non-blocking advice in %s', async (lng) => {
        await init({ lng, resources: { en: { 'server-ai': en }, 'zh-Hans': { 'server-ai': zh } } })
        const event = dependencyUpdateEvent(
            {
                pluginName: '@xpert-ai/plugin-bid',
                installedVersion: '0.6.62',
                currentVersion: '0.6.63',
                changedComponents: [{ type: 'skill', key: 'bid-workflow-coordination' }]
            },
            'assistant'
        )
        expect(event.message).toContain('@xpert-ai/plugin-bid')
        expect(event.message).toContain('0.6.62')
        expect(event.message).toContain('0.6.63')
        expect(event.message).toContain('skill:bid-workflow-coordination')
        expect(event.message).toContain(lng === 'en' ? 'can continue' : '可继续')
        expect(event.title).toBe(lng === 'en' ? 'Assistant update available' : '助理有可用更新')
        expect(event).not.toHaveProperty('error')
        expect(event).not.toHaveProperty('status', 'fail')
    })
})

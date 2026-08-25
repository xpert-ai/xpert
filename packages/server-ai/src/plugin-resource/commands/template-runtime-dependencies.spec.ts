jest.mock('../plugin-resource-installer.service', () => ({
    PluginResourceInstallerService: class PluginResourceInstallerService {}
}))

import { PLUGIN_COMPONENT_TYPE } from '@xpert-ai/contracts'
import { resolveTemplateRuntimeDependencyComponents } from './template-runtime-dependencies'

describe('resolveTemplateRuntimeDependencyComponents', () => {
    it('treats dependencies.plugins as prerequisites rather than implicit portable-resource selectors', async () => {
        const installer = {
            resolveRuntimeComponents: jest.fn()
        }

        await expect(
            resolveTemplateRuntimeDependencyComponents(installer as any, '@xpert-ai/plugin-domain', {
                plugins: ['@xpert-ai/plugin-domain', '@xpert-ai/plugin-loop-guard']
            })
        ).resolves.toEqual([])
        expect(installer.resolveRuntimeComponents).not.toHaveBeenCalled()
    })

    it('resolves only explicitly declared portable resources', async () => {
        const resolved = [{ pluginName: '@xpert-ai/plugin-domain', component: { componentKey: 'skill-a' } }]
        const installer = {
            resolveRuntimeComponents: jest.fn().mockResolvedValue(resolved)
        }

        await expect(
            resolveTemplateRuntimeDependencyComponents(installer as any, '@xpert-ai/plugin-domain', {
                plugins: ['@xpert-ai/plugin-domain'],
                skills: [{ componentKey: 'skill-a', targetAgentKey: 'Agent_primary' }]
            })
        ).resolves.toEqual(resolved)
        expect(installer.resolveRuntimeComponents).toHaveBeenCalledWith('@xpert-ai/plugin-domain', [
            {
                pluginName: '@xpert-ai/plugin-domain',
                componentType: PLUGIN_COMPONENT_TYPE.SKILL,
                componentKey: 'skill-a',
                targetAgentKey: 'Agent_primary'
            }
        ])
    })
})

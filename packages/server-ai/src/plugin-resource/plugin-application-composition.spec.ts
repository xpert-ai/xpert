import { applicationComposition } from './plugin-application-composition'
import type { PluginTemplateApplicationSummary } from '@xpert-ai/contracts'

describe('App composition', () => {
    it('lists declared assistants and resources without duplicating marketing features', () => {
        const app: PluginTemplateApplicationSummary = {
            id: 'app',
            pluginName: '@test/app',
            appName: 'app',
            displayName: 'Coordinator',
            scope: 'organization',
            assistantTemplateKey: 'coordinator',
            config: {
                scope: 'organization',
                assistantTemplateKey: 'coordinator',
                workspace: { mode: 'dedicated', name: 'Workspace' },
                assistantSuite: {
                    version: '1',
                    coordinatorAgentKey: 'a',
                    roles: [{ key: 'sales', templateKey: 'sales', primaryAgentKey: 's', title: 'Sales' }],
                    standaloneAssistants: [
                        { key: 'data', templateKey: 'data', primaryAgentKey: 'd', title: 'Data admin' }
                    ]
                },
                knowledgebases: [{ key: 'catalog', name: 'Catalog', permission: 'organization' }],
                presentation: { features: [{ key: 'marketing', title: 'Business capability' }] }
            }
        }
        const result = applicationComposition(app)
        expect(result.map((item) => item.title)).toEqual(['Coordinator', 'Sales', 'Data admin', 'Workspace', 'Catalog'])
        expect(result.map((item) => item.role).filter(Boolean)).toEqual(['primary', 'specialist', 'standalone'])
        expect(JSON.stringify(result)).not.toContain('Business capability')
    })
})

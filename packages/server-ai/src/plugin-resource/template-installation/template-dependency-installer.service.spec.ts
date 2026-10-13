import { XpertTypeEnum, PLUGIN_COMPONENT_TYPE } from '@xpert-ai/contracts'
jest.mock('../plugin-resource-installer.service', () => ({ PluginResourceInstallerService: class {} }))
jest.mock('./template-readiness.service', () => ({ TemplateReadinessService: class {} }))
import { Test } from '@nestjs/testing'
import { DataSource } from 'typeorm'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { PluginResourceInstallerService } from '../plugin-resource-installer.service'
import { TemplateReadinessService } from './template-readiness.service'
import { TemplateDependencyInstaller } from './template-dependency-installer.service'

describe('template dependency concurrency', () => {
    afterEach(() => jest.restoreAllMocks())
    it('releases connections while waiting, rechecks versions under lock, and unlocks on failure', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant')
        const events: string[] = []
        let attempts = 0
        const runner = () => ({
            connect: jest.fn(),
            query: jest.fn(async (sql: string) => {
                if (sql.includes('try_advisory_lock')) return [{ locked: ++attempts > 1 }]
                events.push('unlock')
            }),
            release: jest.fn(async () => {
                events.push('release')
            })
        })
        const readiness = {
            assertDependencies: jest.fn(async () => {
                events.push('verify')
            })
        }
        const installer = {
            installComponentsForXpert: jest.fn(async () => {
                events.push('install')
                throw new Error('interrupted')
            })
        }
        const module = await Test.createTestingModule({
            providers: [
                TemplateDependencyInstaller,
                { provide: DataSource, useValue: { createQueryRunner: runner } },
                { provide: TemplateReadinessService, useValue: readiness },
                { provide: PluginResourceInstallerService, useValue: installer }
            ]
        }).compile()
        // The resource phase treats descriptors as opaque; the resolver owns their validation.
        const component = {
            pluginName: 'plugin',
            rootDir: '/plugin',
            pluginVersion: '1',
            component: {
                componentType: PLUGIN_COMPONENT_TYPE.SKILL,
                componentKey: 'selected',
                definitionHash: 'hash',
                displayName: 'Selected',
                path: 'skills/selected'
            }
        }
        await expect(
            module
                .get(TemplateDependencyInstaller)
                .install(
                    { id: 'assistant', slug: 'assistant', name: 'assistant', type: XpertTypeEnum.Agent },
                    [component],
                    []
                )
        ).rejects.toThrow('interrupted')
        expect(events).toEqual(['release', 'verify', 'install', 'unlock', 'release'])
        expect(installer.installComponentsForXpert).toHaveBeenCalledWith(
            { id: 'assistant', slug: 'assistant', name: 'assistant', type: XpertTypeEnum.Agent },
            [component]
        )
        await module.close()
    })
})

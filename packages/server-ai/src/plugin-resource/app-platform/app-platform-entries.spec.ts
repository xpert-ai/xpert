import { Test } from '@nestjs/testing'
import { getQueueToken } from '@nestjs/bull'
import { getRepositoryToken } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import { APP_PLATFORM_QUEUE, AppPlatformService } from './app-platform.service'
import { AppPlatformDelivery } from './app-platform-delivery.entity'
import { platformConfigurationSnapshotSchema } from './platform-configuration-snapshot'
import { PluginApplicationInstallation } from '../plugin-application-installation.entity'
import { Xpert } from '../../xpert/xpert.entity'

const id = (number: number) => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`
const snapshot = (apps: object[]) => ({
    digest: 'a'.repeat(64),
    definition: {
        schemaVersion: 1,
        key: 'test',
        version: 1,
        branding: { name: 'Test' },
        registration: { role: 'APP_USER', organization: 'per-account' },
        apps,
        experience: { home: 'main', navigation: ['main', 'optional'] },
        entitlements: { defaultPlanRef: 'trial' }
    },
    environment: {
        schemaVersion: 1,
        configurations: { default: { primary: { provider: 'test', model: 'test' } } },
        plans: {
            trial: { trialDays: 7, creditLimit: 100, maxProjects: 10, maxUploadBytes: 100000, maxConcurrentRuns: 2 }
        }
    }
})
const app = (key: string) => ({
    key,
    required: key === 'main',
    configurationRef: 'default',
    appRef: { pluginName: '@test/app', appName: key }
})

describe('installed App Assistant entries', () => {
    it('reads old nonempty allowlists as complete Apps while preserving an explicitly disabled App', () => {
        const result = platformConfigurationSnapshotSchema.parse(
            snapshot([
                { ...app('main'), entries: ['assistant'] },
                { ...app('optional'), entries: [] }
            ])
        )
        expect(result.definition.apps.map((item) => item.enabled)).toEqual([true, false])
        expect(result.definition.apps.every((item) => !('entries' in item))).toBe(true)
        expect(result.digest).toBe('a'.repeat(64))
    })

    it('lists the installed coordinator, External Assistants and standalone Assistant without authoring data', async () => {
        const refs = {
            assistant: id(1),
            'role:external': id(2),
            'role:standalone': id(3),
            'role:unpublished': id(4),
            'role:foreign': id(5),
            'knowledgebase:library': id(6),
            'legacy:assistant': id(7),
            'suite:version': 'v1'
        }
        const installation = Object.assign(new PluginApplicationInstallation(), {
            id: id(20),
            workspaceId: id(30),
            resourceRefs: refs
        })
        const assistants = Array.from({ length: 7 }, (_, i) =>
            Object.assign(new Xpert(), {
                id: id(i + 1),
                title: `Assistant ${i + 1}`,
                workspaceId: i === 4 ? id(31) : id(30),
                publishAt: i === 3 ? null : new Date(),
                prompt: 'private',
                graph: { private: true }
            })
        )
        const find = jest.fn().mockResolvedValue(assistants)
        const module = await Test.createTestingModule({
            providers: [
                AppPlatformService,
                {
                    provide: DataSource,
                    useValue: {
                        getRepository: (entity: typeof PluginApplicationInstallation | typeof Xpert) => {
                            if (entity === PluginApplicationInstallation)
                                return { findBy: jest.fn().mockResolvedValue([installation]) }
                            if (entity === Xpert) return { find }
                            throw new Error('Unexpected repository')
                        }
                    }
                },
                { provide: getRepositoryToken(AppPlatformDelivery), useValue: {} },
                { provide: getQueueToken(APP_PLATFORM_QUEUE), useValue: {} }
            ]
        }).compile()
        try {
            const delivery = Object.assign(new AppPlatformDelivery(), {
                tenantId: id(40),
                organizationId: id(41),
                configuration: platformConfigurationSnapshotSchema.parse(snapshot([app('main'), app('optional')])),
                apps: [{ key: 'main', status: 'ready', attempts: 1, installationId: installation.id }]
            })
            const service = module.get(AppPlatformService)
            const result = await service.status(delivery)
            expect(result.apps[0].entries.map((entry) => entry.id)).toEqual([id(1), id(2), id(3)])
            expect(result.apps[1].entries).toEqual([])
            expect(find.mock.calls[0][0].where).toMatchObject({ tenantId: id(40), organizationId: id(41) })
            expect(JSON.stringify(result)).not.toMatch(/private|prompt|graph/)
            delivery.configuration.definition.apps[0].enabled = false
            expect((await service.status(delivery)).apps[0].entries).toEqual([])
        } finally {
            await module.close()
        }
    })
})

import { Test } from '@nestjs/testing'
import { CommandBus } from '@nestjs/cqrs'
import { getRepositoryToken } from '@nestjs/typeorm'
import { ForbiddenException } from '@nestjs/common'
import {
    IXpert,
    TXpertTeamDraft,
    LanguagesEnum,
    XpertTypeEnum,
    PluginTemplateApplicationSummary
} from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { ApplicationUpdateService } from './application-update.service'
import { PluginApplicationInstallation } from '../plugin-application-installation.entity'
import { TemplateInstallationLocks } from '../template-installation/template-installation-locks'
import { XpertService } from '../../xpert/xpert.service'
import { XpertTemplateService } from '../../xpert-template/xpert-template.service'
import { XpertSyncTemplateCommand } from '../../xpert/commands/sync-template.command'
import { XpertPublishCommand } from '../../xpert/commands/publish.command'

const application: PluginTemplateApplicationSummary = {
    id: 'plugin:app',
    pluginName: 'plugin',
    appName: 'app',
    displayName: 'App',
    scope: 'organization',
    assistantTemplateKey: 'main',
    config: {
        scope: 'organization',
        assistantTemplateKey: 'main',
        workspace: { mode: 'dedicated', name: 'App' },
        assistantSuite: {
            version: 'v2',
            coordinatorAgentKey: 'Main',
            roles: [{ key: 'child', templateKey: 'child', primaryAgentKey: 'Child' }]
        }
    }
}
const operationId = '5ba81aa5-978e-4664-9f81-f66dcd3e5ddb'
const input = { pluginName: 'plugin', appName: 'app', operationId, resume: false }

describe('App update uses the shared suite release engine', () => {
    let service: ApplicationUpdateService, installation: PluginApplicationInstallation
    let teams: Map<string, IXpert>, events: string[], failPublish: boolean, locked: boolean
    const xperts = { assertCanAuthorById: jest.fn(), getTeam: jest.fn(), saveDraft: jest.fn() }
    const templates = { getTemplateDetail: jest.fn() }
    const repository = { findOneByOrFail: jest.fn(), update: jest.fn() }
    const commands = { execute: jest.fn() }
    const locks = {
        databaseForExecution: async () => ({
            transaction: async (run) => run({ query: async () => [{ acquired: !locked }] })
        })
    }
    beforeAll(async () => {
        const module = await Test.createTestingModule({
            providers: [
                ApplicationUpdateService,
                { provide: XpertService, useValue: xperts },
                { provide: XpertTemplateService, useValue: templates },
                { provide: CommandBus, useValue: commands },
                { provide: TemplateInstallationLocks, useValue: locks },
                { provide: getRepositoryToken(PluginApplicationInstallation), useValue: repository }
            ]
        }).compile()
        service = module.get(ApplicationUpdateService)
    })
    beforeEach(() => {
        jest.clearAllMocks()
        jest.spyOn(RequestContext, 'getLanguageCode').mockReturnValue(LanguagesEnum.English)
        failPublish = false
        locked = false
        events = []
        installation = Object.assign(new PluginApplicationInstallation(), {
            id: 'installation',
            tenantId: 'tenant',
            organizationId: 'org',
            workspaceId: 'workspace',
            xpertId: 'main',
            status: 'ready',
            resourceRefs: { 'role:child': 'child', assistant: 'main', 'suite:version': 'v1' }
        })
        teams = new Map(
            ['main', 'child'].map((id) => {
                const agent = { key: id === 'main' ? 'Main' : 'Child', name: id }
                const team: IXpert = {
                    id,
                    slug: id,
                    type: XpertTypeEnum.Agent,
                    name: `custom-${id}`,
                    title: `Custom ${id}`,
                    tenantId: 'tenant',
                    organizationId: 'org',
                    workspaceId: 'workspace',
                    latest: true,
                    version: '1',
                    publishAt: new Date(),
                    environmentId: 'instance-env',
                    copilotModel: { copilotId: 'local', model: 'custom' },
                    agent,
                    options: { templateSource: { templateId: `plugin:${id}`, pluginName: 'plugin', templateKey: id } },
                    graph: {
                        nodes: [{ key: agent.key, type: 'agent', entity: agent, position: { x: 0, y: 0 } }],
                        connections: []
                    }
                }
                return [id, team]
            })
        )
        repository.findOneByOrFail.mockImplementation(async () => structuredClone(installation))
        repository.update.mockImplementation(async (_where, patch) => {
            Object.assign(installation, structuredClone(patch))
            return { affected: 1 }
        })
        xperts.assertCanAuthorById.mockResolvedValue(undefined)
        xperts.getTeam.mockImplementation(async (id: string) => structuredClone(teams.get(id)))
        xperts.saveDraft.mockImplementation(async (id: string, draft: TXpertTeamDraft) => {
            teams.get(id).draft = structuredClone(draft)
        })
        templates.getTemplateDetail.mockImplementation(async (id: string) => ({
            id,
            key: id,
            name: id.split(':')[1],
            pluginName: 'plugin',
            pluginVersion: '2',
            export_data: 'updated definition and skills'
        }))
        commands.execute.mockImplementation(async (command: XpertSyncTemplateCommand | XpertPublishCommand) => {
            const team = teams.get(command instanceof XpertSyncTemplateCommand ? command.xpertId : command.id)
            if (command instanceof XpertSyncTemplateCommand) {
                events.push(`sync:${team.id}`)
                const { graph, draft, ...instance } = team
                team.draft = { ...structuredClone(graph), team: structuredClone(instance) }
                return
            }
            events.push(`publish:${team.id}`)
            if (failPublish && team.id === 'main') throw new Error('publication failed')
            team.graph = { nodes: team.draft.nodes, connections: team.draft.connections }
            team.version = String(Number(team.version) + 1)
            team.draft = null
        })
    })
    afterEach(() => jest.restoreAllMocks())

    it('prepares the whole suite, publishes children first and preserves instance models/environment', async () => {
        const result = await service.update(application, installation, '2', input)
        expect(result.status).toBe('completed')
        expect(result.completed).toBe(2)
        expect(events).toEqual(['sync:child', 'sync:main', 'publish:child', 'publish:main'])
        expect(teams.get('main')).toMatchObject({
            id: 'main',
            name: 'custom-main',
            environmentId: 'instance-env',
            copilotModel: { model: 'custom' }
        })
        expect(installation.resourceRefs['suite:version']).toBe('v2')
        expect(JSON.stringify(installation.updateRelease)).not.toContain('custom-main')
        await service.update(application, installation, '2', input)
        expect(events).toHaveLength(4)
    })

    it('persists failure and resumes without synchronizing or publishing successful children twice', async () => {
        failPublish = true
        await expect(service.update(application, installation, '2', input)).rejects.toThrow()
        expect(installation.updateRelease.status).toBe('failed')
        expect((await service.progress(installation)).completed).toBe(1)
        failPublish = false
        const resumed = await service.update(application, installation, '2', { ...input, resume: true })
        expect(resumed.status).toBe('completed')
        expect(events.filter((x) => x === 'sync:child')).toHaveLength(1)
        expect(events.filter((x) => x === 'publish:child')).toHaveLength(1)
    })

    it('rejects permission loss and cross-scope targets before mutating any Assistant', async () => {
        xperts.assertCanAuthorById.mockImplementation(async (id: string) => {
            if (id === 'child') throw new ForbiddenException()
        })
        await expect(service.update(application, installation, '2', input)).rejects.toThrow()
        expect(events).toEqual([])
        xperts.assertCanAuthorById.mockResolvedValue(undefined)
        teams.get('child').organizationId = 'other'
        await expect(service.update(application, installation, '2', { ...input, resume: true })).rejects.toThrow()
        expect(events).toEqual([])
    })

    it('refuses unpublished instance drafts before claiming or mutating a release', async () => {
        const team = teams.get('child')
        team.draft = { team, ...team.graph }
        await expect(service.update(application, installation, '2', input)).rejects.toThrow()
        expect(events).toEqual([])
        expect(repository.update).not.toHaveBeenCalled()
    })

    it('does not mutate Assistants when initialization wins the atomic claim', async () => {
        repository.update.mockResolvedValueOnce({ affected: 0 })
        await expect(service.update(application, installation, '2', input)).rejects.toThrow()
        expect(events).toEqual([])
    })

    it('prevents another replica or a new release from replacing unfinished checkpoints', async () => {
        locked = true
        await expect(service.update(application, installation, '2', input)).rejects.toThrow()
        expect(repository.update).not.toHaveBeenCalled()
        locked = false
        failPublish = true
        await expect(service.update(application, installation, '2', input)).rejects.toThrow()
        const checkpoint = structuredClone(installation.updateRelease)
        await expect(
            service.update(application, installation, '2', { ...input, operationId: 'other' })
        ).rejects.toThrow()
        expect(installation.updateRelease).toEqual(checkpoint)
    })
})

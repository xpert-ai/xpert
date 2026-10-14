import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { IXpert, IWFNMiddleware, TXpertTeamDraft, SKILLS_MIDDLEWARE_NAME } from '@xpert-ai/contracts'
import { ReconcileTemplateSkillReferencesHandler } from './reconcile-template-skills.handler'
import { ReconcileTemplateSkillReferencesCommand } from './template-readiness.command'
import { PluginResourceInstallation } from '../plugin-resource-installation.entity'

jest.mock('../plugin-resource-installation.entity', () => ({ PluginResourceInstallation: class {} }))

describe('template source migration skill references', () => {
    it('removes only replaced generated references, scoped to this Assistant, while preserving user skills and rollback input', async () => {
        const query = {
            where: jest.fn().mockReturnThis(),
            getMany: jest.fn().mockResolvedValue([
                { runtimeId: 'old-generated', componentKey: 'ledger', definitionHash: 'old-hash' },
                { runtimeId: 'unrelated', componentKey: 'custom', definitionHash: 'custom-hash' }
            ])
        }
        const handler = (
            await Test.createTestingModule({
                providers: [
                    ReconcileTemplateSkillReferencesHandler,
                    {
                        provide: getRepositoryToken(PluginResourceInstallation),
                        useValue: { createQueryBuilder: () => query }
                    }
                ]
            }).compile()
        ).get(ReconcileTemplateSkillReferencesHandler)
        const assistant = {
            id: 'assistant',
            tenantId: 'tenant',
            organizationId: 'org',
            workspaceId: 'workspace'
        } as IXpert
        const draft = {
            nodes: [
                {
                    type: 'workflow',
                    key: 'skills',
                    position: { x: 0, y: 0 },
                    entity: {
                        type: 'middleware',
                        id: 'skills',
                        key: 'skills',
                        provider: SKILLS_MIDDLEWARE_NAME,
                        options: { skills: ['old-generated', 'unrelated', 'user-selected'] }
                    } as IWFNMiddleware
                }
            ],
            connections: [],
            team: {}
        } as TXpertTeamDraft
        const before = [
            {
                pluginName: 'native',
                version: '1',
                components: [{ type: 'skill' as const, key: 'ledger', hash: 'old-hash' }]
            }
        ]
        const result = await handler.execute(new ReconcileTemplateSkillReferencesCommand(assistant, draft, before, []))
        expect(result.nodes[0].entity).toMatchObject({ options: { skills: ['unrelated', 'user-selected'] } })
        expect(draft.nodes[0].entity).toMatchObject({
            options: { skills: ['old-generated', 'unrelated', 'user-selected'] }
        })
        expect(query.where).toHaveBeenCalledWith({
            tenantId: 'tenant',
            organizationId: 'org',
            workspaceId: 'workspace',
            xpertId: 'assistant',
            pluginName: 'native',
            componentType: 'skill'
        })
        query.where.mockClear()
        const unchanged = await handler.execute(
            new ReconcileTemplateSkillReferencesCommand(assistant, draft, before, before)
        )
        expect(unchanged).toEqual(draft)
        expect(query.where).not.toHaveBeenCalled()
    })
})

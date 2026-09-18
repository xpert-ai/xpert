jest.mock('../shared/tag-associations', () => ({ assertValidTagAssociations: jest.fn() }))

import { Repository } from 'typeorm'
import { IPromptWorkflow } from '@xpert-ai/contracts'
import { assertValidTagAssociations } from '../shared/tag-associations'
import { XpertWorkspaceAccessService } from '../xpert-workspace/workspace-access.service'
import { Xpert } from '../xpert/xpert.entity'
import { PromptWorkflow } from './prompt-workflow.entity'
import { isPromptWorkflowApplicable, resolvePromptWorkflowAssociations } from './prompt-workflow-associations'

const expertId = '11111111-1111-4111-8111-111111111111'
const tagId = '22222222-2222-4222-8222-222222222222'

describe('prompt workflow associations', () => {
    const repository = {} as Repository<PromptWorkflow>
    const find = jest.fn()
    const experts = { find } as unknown as Repository<Xpert>
    const assertCan = jest.fn(async () => ({ workspace: { id: 'workspace-1', tenantId: 'tenant-1' } }))
    const access = { assertCan } as unknown as XpertWorkspaceAccessService

    beforeEach(() => {
        jest.clearAllMocks()
        find.mockResolvedValue([{ id: expertId }])
    })

    it('makes an unassigned prompt available to every expert, while preserving unavailable associations', () => {
        expect(isPromptWorkflowApplicable({}, 'expert-a')).toBe(true)
        expect(isPromptWorkflowApplicable({ associatedXpertIds: [] }, 'expert-b')).toBe(true)
        expect(isPromptWorkflowApplicable({ associatedXpertIds: [expertId] }, expertId)).toBe(true)
        expect(isPromptWorkflowApplicable({ associatedXpertIds: [expertId] }, 'other')).toBe(false)
    })

    it('preserves omitted configuration instead of clearing existing links', async () => {
        expect(await resolvePromptWorkflowAssociations(repository, access, experts, 'workspace-1', {})).toEqual({})
        expect(assertCan).not.toHaveBeenCalled()
    })

    it('validates organization tag IDs using the prompt relationship and scopes expert additions', async () => {
        const result = await resolvePromptWorkflowAssociations(repository, access, experts, 'workspace-1', {
            organizationTagIds: [tagId, tagId],
            associatedXpertIds: [expertId]
        })
        expect(result).toEqual({ organizationTags: [{ id: tagId }], associatedXpertIds: [expertId] })
        expect(assertValidTagAssociations).toHaveBeenCalledWith(
            repository,
            access,
            { workspaceId: 'workspace-1', tags: [{ id: tagId }] },
            'prompt_workflow',
            undefined,
            'organizationTags'
        )
        expect(find).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    workspaceId: 'workspace-1',
                    tenantId: 'tenant-1',
                    latest: true
                })
            })
        )
    })

    it('rejects experts outside the workspace and malformed IDs', async () => {
        find.mockResolvedValue([])
        await expect(
            resolvePromptWorkflowAssociations(repository, access, experts, 'workspace-1', {
                associatedXpertIds: [expertId]
            })
        ).rejects.toThrow()
        await expect(
            resolvePromptWorkflowAssociations(repository, access, experts, 'workspace-1', {
                organizationTagIds: ['not-an-id']
            })
        ).rejects.toThrow()
    })

    it('keeps existing unavailable experts until the user explicitly clears their association', async () => {
        const current: IPromptWorkflow = { name: 'review', template: '{{args}}', associatedXpertIds: [expertId] }
        const preserved = await resolvePromptWorkflowAssociations(
            repository,
            access,
            experts,
            'workspace-1',
            {
                associatedXpertIds: [expertId]
            },
            current
        )
        expect(preserved.associatedXpertIds).toEqual([expertId])
        expect(find).not.toHaveBeenCalled()
        const cleared = await resolvePromptWorkflowAssociations(
            repository,
            access,
            experts,
            'workspace-1',
            {
                associatedXpertIds: []
            },
            current
        )
        expect(cleared.associatedXpertIds).toEqual([])
    })
})

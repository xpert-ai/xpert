import { BadRequestException } from '@nestjs/common'
import { IPromptWorkflow, PromptWorkflowInput } from '@xpert-ai/contracts'
import { t } from 'i18next'
import { In, Repository } from 'typeorm'
import { z } from 'zod'
import { assertValidTagAssociations } from '../shared/tag-associations'
import type { XpertWorkspaceAccessService } from '../xpert-workspace/workspace-access.service'
import type { Xpert } from '../xpert/xpert.entity'
import type { PromptWorkflow } from './prompt-workflow.entity'

const idsSchema = z
    .array(z.string().uuid())
    .max(500)
    .transform((ids) => [...new Set(ids)])
const associationsSchema = z.object({
    organizationTagIds: idsSchema.optional(),
    associatedXpertIds: idsSchema.optional()
})

export function isPromptWorkflowApplicable(workflow: Pick<IPromptWorkflow, 'associatedXpertIds'>, xpertId: string) {
    return !workflow.associatedXpertIds?.length || workflow.associatedXpertIds.includes(xpertId)
}

export async function resolvePromptWorkflowAssociations(
    repository: Repository<PromptWorkflow>,
    workspaceAccess: XpertWorkspaceAccessService,
    experts: Repository<Xpert>,
    workspaceId: string,
    input: PromptWorkflowInput,
    current?: IPromptWorkflow
): Promise<Pick<IPromptWorkflow, 'organizationTags' | 'associatedXpertIds'>> {
    const parsed = associationsSchema.safeParse(input)
    if (!parsed.success) throw invalidAssociations()
    const { organizationTagIds, associatedXpertIds } = parsed.data
    const result: Pick<IPromptWorkflow, 'organizationTags' | 'associatedXpertIds'> = {}
    if (organizationTagIds) {
        const tags = organizationTagIds.map((id) => ({ id }))
        await assertValidTagAssociations(
            repository,
            workspaceAccess,
            { workspaceId, tags },
            'prompt_workflow',
            current?.id,
            'organizationTags'
        )
        result.organizationTags = tags
    }
    if (associatedXpertIds) {
        const added = associatedXpertIds.filter((id) => !current?.associatedXpertIds?.includes(id))
        if (added.length) {
            const { workspace } = await workspaceAccess.assertCan(workspaceId, 'write')
            const selected = await experts.find({
                select: ['id'],
                where: { id: In(added), workspaceId, tenantId: workspace.tenantId, latest: true }
            })
            if (selected.length !== added.length) throw invalidAssociations()
        }
        result.associatedXpertIds = associatedXpertIds
    }
    return result
}

function invalidAssociations() {
    return new BadRequestException(
        t('server-ai:Error.PromptWorkflowAssociationsUnavailable', {
            defaultValue: 'The selected tags or experts are unavailable. Refresh and select items from this workspace.'
        })
    )
}

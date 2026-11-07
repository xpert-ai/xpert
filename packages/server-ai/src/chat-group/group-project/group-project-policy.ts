import { BadRequestException, ConflictException } from '@nestjs/common'
import { GENERAL_PROJECT_TYPE, type XpertProjectTypeRef } from '@xpert-ai/contracts'
import { t } from 'i18next'
import { EntityManager, Not } from 'typeorm'
import { ChatConversation } from '../../chat-conversation/conversation.entity'

export function assertGroupProjectType(
    project: { applicationKey?: string; projectTypeKey?: string },
    required: XpertProjectTypeRef
) {
    const legacy = !project.applicationKey && !project.projectTypeKey
    const actual = legacy ? GENERAL_PROJECT_TYPE : project
    if (actual.applicationKey !== required.applicationKey || actual.projectTypeKey !== required.projectTypeKey)
        throw new BadRequestException(t('server-ai:Error.GroupProjectTypeUnsupported'))
}

/** Serialize cross-group claims, including retryable creation IDs, before testing exclusive use. */
export async function assertGroupProjectReuse(
    manager: EntityManager,
    group: ChatConversation,
    projectId: string,
    reuse: boolean
) {
    await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
        `group-project:${group.tenantId}:${group.organizationId}:${projectId}`
    ])
    if (group.projectId === projectId || reuse) return
    const used = await manager.getRepository(ChatConversation).existsBy({
        tenantId: group.tenantId,
        organizationId: group.organizationId,
        purpose: 'group',
        projectId,
        id: Not(group.id)
    })
    if (used)
        throw new ConflictException({
            statusCode: 409,
            error: 'Conflict',
            code: 'GROUP_PROJECT_REUSE_REQUIRED',
            message: t('server-ai:Error.GroupProjectReuseRequired')
        })
}

import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { getTagTargets, TagCategoryEnum } from '@xpert-ai/contracts'
import { RequestContext, Tag } from '@xpert-ai/server-core'
import { t } from 'i18next'
import { In, IsNull, ObjectLiteral, Repository } from 'typeorm'
import { z } from 'zod'
import type { XpertWorkspaceAccessService } from '../xpert-workspace/workspace-access.service'

type TagAssociationWrite = {
    id?: string
    workspaceId?: string | null
    tags?: unknown
}

const tagsSchema = z.array(z.object({ id: z.string().uuid().optional() }).passthrough()).nullish()

/** Validate additions against stored tags; persisted links remain valid historical associations. */
export async function assertValidTagAssociations<T extends ObjectLiteral>(
    repository: Repository<T>,
    workspaceAccess: XpertWorkspaceAccessService,
    entity: TagAssociationWrite,
    target: TagCategoryEnum,
    existingResourceId = entity.id
): Promise<void> {
    const parsed = tagsSchema.safeParse(entity.tags)
    if (!parsed.success) throw invalidAssociation()
    // ID-less definitions retain the legacy import path; definition-edit permissions are a separate policy.
    const ids = [...new Set(parsed.data?.flatMap((tag) => (tag.id ? [tag.id] : [])) ?? [])]
    if (!ids.length) return

    const workspaceId = entity.workspaceId?.trim()
    const scope = workspaceId
        ? (await workspaceAccess.assertCan(workspaceId, 'write')).workspace
        : { tenantId: RequestContext.currentTenantId(), organizationId: RequestContext.getOrganizationId() }
    if (!scope.tenantId) throw new ForbiddenException()

    const existing = existingResourceId
        ? await repository
              .createQueryBuilder('resource')
              .innerJoin('resource.tags', 'tag')
              .select('tag.id', 'id')
              .where('resource.id = :resourceId', { resourceId: existingResourceId })
              .andWhere('resource.tenantId = :tenantId', { tenantId: scope.tenantId })
              .getRawMany<{ id: string }>()
        : []
    const existingIds = new Set(existing.map((tag) => tag.id))
    const addedIds = ids.filter((id) => !existingIds.has(id))
    if (!addedIds.length) return

    const sharedScope = { id: In(addedIds), tenantId: scope.tenantId, organizationId: IsNull() }
    const tags = await repository.manager.getRepository(Tag).find({
        where: scope.organizationId
            ? [sharedScope, { ...sharedScope, organizationId: scope.organizationId }]
            : sharedScope
    })
    if (
        tags.length !== addedIds.length ||
        tags.some(
            (tag) =>
                tag.tenantId !== scope.tenantId ||
                (!!tag.organizationId && tag.organizationId !== scope.organizationId) ||
                tag.isActive === false ||
                !getTagTargets(tag).includes(target)
        )
    ) {
        throw invalidAssociation()
    }
}

function invalidAssociation() {
    return new BadRequestException(
        t('server-ai:Error.TagAssociationUnavailable', {
            defaultValue: 'A selected tag is unavailable for this resource. Refresh the tag list and select again.'
        })
    )
}

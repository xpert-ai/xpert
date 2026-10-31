import { AIPermissionsEnum } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { EntityManager } from 'typeorm'
import { z } from 'zod/v3'

const references = z.array(z.object({ id: z.string().uuid() }))

/** Business library grants come from ready installations, never from authoring workspace membership. */
export async function appPlatformKnowledgeIds(manager: EntityManager, workspaceId?: string): Promise<string[] | null> {
    const tenantId = RequestContext.currentTenantId(), organizationId = RequestContext.getOrganizationId(), userId = RequestContext.currentUserId()
    if (!tenantId || !organizationId || !userId) return []
    const enrollment = z.array(z.object({ enrolled: z.boolean() })).parse(await manager.query(
        'SELECT EXISTS (SELECT 1 FROM app_platform_delivery WHERE "tenantId"=$1 AND "userId"=$2) AS enrolled', [tenantId, userId]
    ))
    if (!enrollment[0].enrolled) return null
    const rows: unknown = await manager.query(`SELECT DISTINCT kb.id FROM app_platform_delivery delivery
        CROSS JOIN LATERAL jsonb_array_elements(delivery.apps) state
        JOIN plugin_application_installation installation ON installation.id::text = state->>'installationId'
        CROSS JOIN LATERAL jsonb_each_text(installation."resourceRefs"::jsonb) resource
        JOIN knowledgebase kb ON kb.id::text = resource.value
        WHERE delivery."tenantId"=$1 AND delivery."organizationId"=$2 AND delivery."userId"=$3
          AND EXISTS (SELECT 1 FROM "user" actor JOIN role_permission permission
            ON permission."roleId"=actor."roleId" AND permission."tenantId"=actor."tenantId"
            WHERE actor.id=delivery."userId" AND actor."tenantId"=delivery."tenantId" AND actor."isActive"=true
              AND permission.permission=$5 AND permission.enabled=true)
          AND delivery."readyAt" IS NOT NULL AND state->>'status'<>'disabled'
          AND (state->>'status'='ready' OR state->>'appliedDigest' IS NOT NULL)
          AND installation."tenantId"=$1 AND installation."organizationId"=$2
          AND resource.key LIKE 'knowledgebase:%' AND kb."tenantId"=$1 AND kb."organizationId"=$2
          AND kb."deletedAt" IS NULL AND ($4::text IS NULL OR installation."workspaceId"::text=$4)`,
        [tenantId, organizationId, userId, workspaceId ?? null, AIPermissionsEnum.CHAT_VIEW])
    return references.parse(rows).map((row) => row.id)
}

import { AIPermissionsEnum } from '@xpert-ai/contracts'
import { SelectQueryBuilder } from 'typeorm'
import { Xpert } from './xpert.entity'

/** Resource grants remain necessary. The App's installed template suite defines its runtime Assistants. */
export function applyAppPlatformPublishedFilter(query: SelectQueryBuilder<Xpert>, tenantId: string, organizationId: string, userId: string, resourceParentId?: string) {
  // Delegated reads must still bind parent and child to the same assigned installation.
  const target = resourceParentId ? `EXISTS (
    SELECT 1 FROM xpert parent WHERE parent.id = :platformParent
      AND parent."tenantId" = delivery."tenantId" AND parent."organizationId" = delivery."organizationId"
      AND parent."workspaceId"::text = installation."workspaceId"
      AND (exported.id = parent.id OR (exported.slug IS NOT NULL AND exported.slug = parent.slug))
  ) AND EXISTS (
    SELECT 1 FROM jsonb_each_text(installation."resourceRefs"::jsonb) resource
    JOIN xpert child ON child.id::text = resource.value
    WHERE (resource.key = 'assistant' OR resource.key LIKE 'role:%')
      AND (child.id = xpert.id OR (child.slug IS NOT NULL AND child.slug = xpert.slug))
  )` : `(exported.id = xpert.id OR (exported.slug IS NOT NULL AND exported.slug = xpert.slug))`
  query.andWhere(`(
    NOT EXISTS (SELECT 1 FROM app_platform_delivery enrollment
      WHERE enrollment."userId" = :platformUser AND enrollment."tenantId" = :platformTenant)
    OR EXISTS (
      SELECT 1 FROM app_platform_delivery delivery
      CROSS JOIN LATERAL jsonb_array_elements(delivery.apps) state
      JOIN plugin_application_installation installation ON installation.id::text = state->>'installationId'
      CROSS JOIN LATERAL jsonb_array_elements(delivery.configuration->'definition'->'apps') entry
      CROSS JOIN LATERAL jsonb_each_text(installation."resourceRefs"::jsonb) visible(key, id)
      JOIN xpert exported ON exported.id::text = visible.id
      WHERE delivery."tenantId" = :platformTenant AND delivery."organizationId" = :platformOrganization
        AND delivery."userId" = :platformUser AND delivery."readyAt" IS NOT NULL
        AND EXISTS (SELECT 1 FROM "user" actor JOIN role_permission permission
          ON permission."roleId" = actor."roleId" AND permission."tenantId" = actor."tenantId"
          WHERE actor.id = delivery."userId" AND actor."tenantId" = delivery."tenantId"
            AND actor."isActive" = true AND permission.permission = :platformChatPermission AND permission.enabled = true)
        AND state->>'status' <> 'disabled' AND (state->>'status' = 'ready' OR state->>'appliedDigest' IS NOT NULL)
        AND entry->>'key' = state->>'key'
        AND COALESCE((entry->>'enabled')::boolean, entry->'entries' <> '[]'::jsonb, true)
        AND (visible.key = 'assistant' OR visible.key ~ '^role:[a-z0-9_-]+$')
        AND installation."tenantId" = delivery."tenantId" AND installation."organizationId" = delivery."organizationId"
        AND installation."pluginName" = entry->'appRef'->>'pluginName' AND installation."appName" = entry->'appRef'->>'appName'
        AND xpert."tenantId" = delivery."tenantId" AND xpert."organizationId" = delivery."organizationId"
        AND xpert."workspaceId"::text = installation."workspaceId"
        AND ${target}
    )
  )`, { platformUser: userId, platformTenant: tenantId, platformOrganization: organizationId,
    platformParent: resourceParentId, platformChatPermission: AIPermissionsEnum.CHAT_VIEW })
}

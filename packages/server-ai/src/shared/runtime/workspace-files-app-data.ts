import { ResolvePluginArtifactNamespaceQuery } from '@xpert-ai/server-core'
import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { RequestContext, type WorkspaceAppDataOptions, type WorkspaceFileScope } from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import { ResolveAssistantFileAccessCommand } from '../../xpert/assistant-files/resolve-assistant-file-access.command'
import type { VolumeClient } from '../volume'
import { VolumeWorkspaceStorage } from '../volume/workspace-storage'

function denied(): never {
    throw new ForbiddenException(t('server-ai:Error.WorkspaceFileAccessDenied'))
}

/** The published Assistant, never a requested catalog or the creator, determines the data volume. */
export async function authorizeAssistantWorkspace(
    binding: WorkspaceFileScope,
    operation: 'read' | 'write' | 'delete',
    commands: Pick<CommandBus, 'execute'>
) {
    const assistantId = binding.xpertId || binding.scopeId
    const tenantId = RequestContext.currentTenantId()
    const userId = RequestContext.currentUserId()
    const organizationId = RequestContext.getOrganizationId()
    if (
        !assistantId ||
        !tenantId ||
        !userId ||
        !organizationId ||
        (binding.tenantId && binding.tenantId !== tenantId) ||
        (binding.userId && binding.userId !== userId) ||
        (binding.organizationId && binding.organizationId !== organizationId)
    )
        denied()
    const { scope } = await commands.execute(new ResolveAssistantFileAccessCommand(assistantId, operation, 'runtime'))
    if (
        scope.tenantId !== tenantId ||
        scope.xpertId !== assistantId ||
        (scope.catalog === 'user-xperts' && scope.userId !== userId) ||
        // A previously private projection must never follow a policy change into a shared volume.
        ((binding.catalog === 'user-xperts' || binding.isolateByUser === true) && scope.catalog !== 'user-xperts') ||
        (binding.scopeId && binding.scopeId !== assistantId)
    )
        denied()
    return scope
}

export function createWorkspaceAppData(
    defaults: WorkspaceFileScope,
    options: WorkspaceAppDataOptions,
    commands: Pick<CommandBus, 'execute'>,
    volumes: Pick<VolumeClient, 'resolve'>,
    queries: Pick<QueryBus, 'execute'>
) {
    if (
        !defaults.xpertId ||
        defaults.projectId ||
        (defaults.catalog && defaults.catalog !== 'xperts' && defaults.catalog !== 'user-xperts')
    ) {
        throw new BadRequestException(t('server-ai:Error.WorkspaceAppDataScopeRequired'))
    }
    const binding = Object.freeze({
        ...defaults,
        tenantId: defaults.tenantId ?? RequestContext.currentTenantId(),
        organizationId: defaults.organizationId ?? RequestContext.getOrganizationId(),
        userId: defaults.userId ?? RequestContext.currentUserId()
    })
    if (!binding.tenantId || !binding.organizationId || !binding.userId) denied()
    const pluginName = options.pluginName
    const requireUserIsolation = options.requireUserIsolation === true
    // Resolve on each operation: uninstalled plugins and changed installation scope fail closed.
    return new VolumeWorkspaceStorage(
        async (operation) => {
            const scope = await authorizeAssistantWorkspace(binding, operation, commands)
            if (requireUserIsolation && scope.catalog !== 'user-xperts') {
                throw new BadRequestException({
                    code: 'assistant_user_workspace_required',
                    message: t('server-ai:Error.AssistantUserWorkspaceRequired')
                })
            }
            return volumes.resolve(scope)
        },
        () => queries.execute(new ResolvePluginArtifactNamespaceQuery(pluginName))
    )
}

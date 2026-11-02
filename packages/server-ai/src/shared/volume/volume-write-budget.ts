import { CommandBus } from '@nestjs/cqrs'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import {
    StorageBudgetResource,
    CheckStorageQuotaCommand,
    RequestStorageUsageRefreshCommand
} from '@xpert-ai/server-core'
import type { VolumeScope } from './volume'
import { lstat } from 'node:fs/promises'
import path from 'node:path'

export interface VolumeWriteBudget {
    <T>(
        scope: VolumeScope,
        root: string,
        relativePath: string,
        bytes: number | null,
        commit: () => Promise<T>
    ): Promise<T>
}

export function volumeBudgetResource(scope: VolumeScope): StorageBudgetResource | null {
    const owner = {
        tenantId: scope.tenantId,
        userId: scope.userId ?? RequestContext.currentUserId(),
        organizationId: scope.organizationId
    }
    switch (scope.catalog) {
        case 'projects':
            return { ...owner, kind: 'project', id: scope.projectId! }
        case 'xperts':
        case 'user-xperts':
            return { ...owner, kind: 'assistant', id: scope.xpertId! }
        case 'knowledges':
            return { ...owner, kind: 'knowledge', id: scope.knowledgeId! }
        case 'workspaces':
            return { ...owner, kind: 'workspace', id: scope.workspaceId! }
        case 'users':
            return { ...owner, kind: 'user' }
        // Job volumes are temporary and governed by the immutable Sandbox Runtime profile.
        case 'runtime-jobs':
            return null
        // Authoring entry points retain their own authorization; admission uses the current account.
        case 'environment':
        case 'skills':
            return { ...owner, kind: 'user' }
    }
}

export function commandVolumeWriteBudget(commands: Pick<CommandBus, 'execute'>): VolumeWriteBudget {
    return async (scope, root, relativePath, bytes, commit) => {
        const resource = volumeBudgetResource(scope)
        if (!resource) return commit()
        if (bytes !== null) {
            // Volume validates containment before this adapter runs. A smaller replacement
            // can recover capacity even when the last snapshot is above the allowance.
            const previous = await lstat(path.resolve(root, relativePath)).catch((error: NodeJS.ErrnoException) => {
                if (error.code === 'ENOENT') return null
                throw error
            })
            const growthBytes = bytes - (previous?.isFile() ? previous.size : 0)
            await commands.execute(new CheckStorageQuotaCommand({ kind: 'write', scope: resource, growthBytes }))
        }
        const result = await commit()
        if (bytes === null)
            await commands.execute(new RequestStorageUsageRefreshCommand(resource)).catch(() => undefined)
        return result
    }
}

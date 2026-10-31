import { CommandBus } from '@nestjs/cqrs'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { StorageBudgetResource, WithStorageBudgetCommand } from '@xpert-ai/server-core'
import type { VolumeScope } from './volume'

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
        // App accounts cannot own these authoring roots; the budget handler rejects
        // roots outside their registered account resources, including background calls.
        case 'environment':
        case 'skills':
            return { ...owner, kind: 'user' }
    }
}

export function commandVolumeWriteBudget(commands: Pick<CommandBus, 'execute'>): VolumeWriteBudget {
    return (scope, root, relativePath, bytes, commit) => {
        const resource = volumeBudgetResource(scope)
        return resource
            ? commands.execute(
                  new WithStorageBudgetCommand(
                      bytes === null
                          ? { kind: 'remove', resource, root }
                          : { kind: 'file', resource, root, path: relativePath, bytes },
                      commit
                  )
              )
            : commit()
    }
}

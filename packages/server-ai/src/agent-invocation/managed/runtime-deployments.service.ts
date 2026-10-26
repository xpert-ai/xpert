import { Injectable } from '@nestjs/common'
import { getConfig } from '@xpert-ai/server-config'
import {
    AgentRuntimeDeployment,
    AgentInvocationScope,
    ManagedAgentRuntimeProfile,
    IAgentRuntimeStrategy,
    StrategySource,
    agentRuntimeDeploymentSpecSchema
} from '@xpert-ai/plugin-sdk'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { mkdir, realpath } from 'node:fs/promises'
import { invocationError } from '../invocation-runtime'

/** Infrastructure declarations never grant workspace access or enter persisted invocation JSON. */
@Injectable()
export class RuntimeDeploymentsService {
    async resolve(
        provider: string,
        profile: ManagedAgentRuntimeProfile,
        strategy: IAgentRuntimeStrategy,
        source: StrategySource,
        scope: AgentInvocationScope
    ): Promise<AgentRuntimeDeployment | undefined> {
        const value = await strategy.resolveManagedDeployment?.(
            profile.reference,
            Object.freeze(structuredClone(scope))
        )
        if (value === undefined) return undefined
        // A separately installed plugin can carry another SDK version. Validate at that boundary.
        const parsed = agentRuntimeDeploymentSpecSchema.safeParse(value)
        if (!parsed.success || parsed.data.type !== profile.environment) throw invocationError('ProviderUnavailable')
        const deployment = parsed.data
        const workspaceRoot = join(getConfig().assetOptions.dataPath, 'agent-runtimes')
        const settings =
            deployment.type === 'service'
                ? deployment
                : {
                      ...deployment,
                      environment: Object.fromEntries(
                          Object.entries(deployment.environment).sort(([a], [b]) => a.localeCompare(b))
                      )
                  }
        const revision = createHash('sha256')
            .update(
                JSON.stringify({
                    source,
                    provider,
                    reference: profile.reference,
                    version: profile.version,
                    ...settings,
                    workspaceRoot
                })
            )
            .digest('hex')
        return { ...deployment, provider, revision, workspaceRoot }
    }

    async prepare(deployment: AgentRuntimeDeployment, scope: AgentInvocationScope) {
        // Every actor/Assistant/project has a separate root. Plugins append the invocation ID.
        const owner = createHash('sha256')
            .update(
                JSON.stringify([
                    scope.tenantId,
                    scope.organizationId,
                    scope.userId,
                    scope.workspaceId,
                    scope.callerXpertId,
                    scope.projectId,
                    scope.conversationId
                ])
            )
            .digest('hex')
        await mkdir(deployment.workspaceRoot, { recursive: true, mode: 0o700 })
        const root = join(await realpath(deployment.workspaceRoot), owner)
        await mkdir(root, { recursive: true, mode: 0o700 })
        if ((await realpath(root)) !== root) throw invocationError('InvalidScope')
        return { ...deployment, workspaceRoot: root }
    }
}

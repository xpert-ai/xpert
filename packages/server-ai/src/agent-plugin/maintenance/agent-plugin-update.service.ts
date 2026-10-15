import type { EntityManager } from 'typeorm'
import { AgentPluginPackage } from '../agent-plugin.entity'
import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { DEFAULT_AGENT_PLUGINS_SOURCE, type AgentPluginUpdateProgress } from '@xpert-ai/contracts'
import { getErrorMessage } from '@xpert-ai/plugin-sdk'
import { randomUUID } from 'node:crypto'
import { rm } from 'node:fs/promises'
import { t } from 'i18next'
import { AgentPluginService, requireResourceAdmin } from '../agent-plugin.service'
import { agentPluginScopeWhere, type AgentPluginScope } from '../agent-plugin-scope'
import { stagePortableGit } from '../agent-plugin-source'
import { parseAgentPlugin } from '../agent-plugin-parser'
import { AgentPluginUpdateStore } from './agent-plugin-update.store'

@Injectable()
export class AgentPluginUpdateService {
    private readonly logger = new Logger(AgentPluginUpdateService.name)
    constructor(
        private readonly plugins: AgentPluginService,
        private readonly store: AgentPluginUpdateStore
    ) {}
    status() {
        return this.store.read(requireResourceAdmin())
    }
    private async target(scope: AgentPluginScope, id: string, manager?: EntityManager) {
        const pkg = await (manager ? manager.getRepository(AgentPluginPackage) : this.plugins.packages).findOneBy({
            ...agentPluginScopeWhere(scope),
            id
        })
        if (!pkg) throw new NotFoundException(t('server-ai:Error.AgentPluginNotFound'))
        if (pkg.source.kind !== 'git' || !pkg.source.url)
            throw new BadRequestException(t('server-ai:Error.AgentPluginUpdateGitRequired'))
        return pkg
    }
    async start(
        packageId: string,
        input: { branch?: string; operationId?: string }
    ): Promise<AgentPluginUpdateProgress> {
        const scope = requireResourceAdmin()
        const progress = await this.store.control(scope, async (manager) => {
            let current = await this.store.read(scope, manager)
            if (input.operationId) {
                if (current.operationId !== input.operationId || current.packageId !== packageId)
                    throw new ConflictException(t('server-ai:Error.AgentPluginUpdateChanged'))
            } else if (current.phase === 'updating') {
                if (current.packageId !== packageId || (input.branch && input.branch !== current.branch))
                    throw new ConflictException(t('server-ai:Error.AgentPluginUpdateBusy'))
            } else {
                const pkg = await this.target(scope, packageId, manager)
                const official =
                    pkg.source.url === DEFAULT_AGENT_PLUGINS_SOURCE.url &&
                    pkg.source.subdirectory?.startsWith(`${DEFAULT_AGENT_PLUGINS_SOURCE.subdirectory}/`)
                const branch = (
                    input.branch ?? (official ? DEFAULT_AGENT_PLUGINS_SOURCE.ref : pkg.source.ref)
                )?.replace(/^refs\/heads\//, '')
                if (!branch || /^[a-f\d]{40,64}$/i.test(branch))
                    throw new BadRequestException(t('server-ai:Error.AgentPluginUpdateBranchRequired'))
                current = { operationId: randomUUID(), packageId, branch, commit: null, phase: 'updating' }
                await this.store.save(scope, current, manager)
            }
            return structuredClone(current)
        })
        if (progress.phase === 'updating')
            void this.run(scope, progress.operationId).catch((error: unknown) =>
                this.logger.error(getErrorMessage(error))
            )
        return progress
    }
    private async run(scope: AgentPluginScope, operationId: string) {
        const worker = await this.store.acquire(scope)
        if (!worker) return
        const { manager } = worker
        try {
            const progress = await this.store.read(scope, manager)
            if (progress.operationId !== operationId || progress.phase !== 'updating') return
            try {
                const pkg = await this.target(scope, progress.packageId, manager)
                const staged = await stagePortableGit(
                    pkg.source.url,
                    progress.commit ?? `refs/heads/${progress.branch}`,
                    pkg.source.subdirectory
                )
                try {
                    progress.commit = staged.commit
                    await this.store.save(scope, progress, manager)
                    if ((await parseAgentPlugin(staged.root)).name !== pkg.descriptor.name)
                        throw new BadRequestException(t('server-ai:Error.AgentPluginUpdateIdentityChanged'))
                    const result = await this.plugins.importStagedDirectory(
                        staged.root,
                        {
                            ...pkg.source,
                            ref: progress.branch,
                            commit: staged.commit
                        },
                        true,
                        manager
                    )
                    progress.result = { packageId: result.id, status: result.importStatus }
                } finally {
                    await rm(staged.temp, { recursive: true, force: true })
                }
                progress.phase = 'completed'
            } catch (error) {
                progress.phase = 'failed'
                progress.error = getErrorMessage(error)
            }
            await this.store.save(scope, progress, manager)
        } finally {
            await worker.release()
        }
    }
}

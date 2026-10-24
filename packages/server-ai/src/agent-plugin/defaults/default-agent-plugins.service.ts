// HTTP requests only create/resume a receipt; Git and package imports run outside their lifetime.
// Resume IDs cannot create a second job after completion. Both HTTP and setup share the same worker lock.
import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common'
import type { DefaultAgentPluginsImportProgress, DefaultAgentPluginsImportResult } from '@xpert-ai/contracts'
import { getErrorMessage } from '@xpert-ai/plugin-sdk'
import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { t } from 'i18next'
import { requireResourceAdmin } from '../agent-plugin.service'
import type { AgentPluginScope } from '../agent-plugin-scope'
import { DefaultAgentPluginsStore } from './default-agent-plugins.store'
import { DefaultAgentPluginsImporter } from './default-agent-plugins.importer'

const active = (progress: DefaultAgentPluginsImportProgress) =>
    !!progress.operationId && (progress.phase === 'fetching' || progress.phase === 'importing')

@Injectable()
export class DefaultAgentPluginsService {
    private readonly logger = new Logger(DefaultAgentPluginsService.name)
    constructor(
        private readonly store: DefaultAgentPluginsStore,
        private readonly importer: DefaultAgentPluginsImporter
    ) {}

    status() {
        return this.store.read(requireResourceAdmin())
    }

    async start(input: { operationId?: string } = {}): Promise<DefaultAgentPluginsImportProgress> {
        const scope = requireResourceAdmin()
        const progress = await this.store.control(scope, async (manager) => {
            let progress = await this.store.read(scope, manager)
            if (input.operationId && input.operationId !== progress.operationId)
                throw new ConflictException(t('server-ai:Error.DefaultAgentPluginsImportChanged'))
            if (!input.operationId && !active(progress)) {
                progress =
                    progress.phase === 'failed' && progress.operationId
                        ? {
                              ...progress,
                              phase: 'fetching',
                              currentId: null,
                              error: undefined
                          }
                        : {
                              operationId: randomUUID(),
                              phase: 'fetching',
                              commit: null,
                              total: 0,
                              currentId: null,
                              items: [],
                              updatedAt: new Date().toISOString()
                          }
                await this.store.save(scope, progress, manager)
            }
            return structuredClone(progress)
        })
        if (active(progress)) {
            // Async continuation inherits this authenticated request's scope; no tokens enter the receipt.
            void this.run(scope, progress.operationId).catch((error: unknown) =>
                this.logger.error(getErrorMessage(error))
            )
        }
        return progress
    }

    private async run(scope: AgentPluginScope, operationId: string) {
        const worker = await this.store.acquire(scope)
        if (!worker) return
        const { manager } = worker
        try {
            const progress = await this.store.read(scope, manager)
            if (progress.operationId !== operationId || !active(progress)) return
            try {
                await this.importer.run(scope, progress, () => this.store.save(scope, progress, manager), manager)
            } catch (error) {
                progress.phase = 'failed'
                progress.currentId = null
                progress.error = getErrorMessage(error)
                await this.store.save(scope, progress, manager)
            }
        } finally {
            await worker.release()
        }
    }

    /** Setup already runs outside HTTP; preserve its existing final-result command contract. */
    async importAndWait(): Promise<DefaultAgentPluginsImportResult> {
        let progress = await this.start()
        while (active(progress)) {
            await delay(1000)
            progress = await this.start({ operationId: progress.operationId })
        }
        if (progress.phase !== 'completed' || !progress.commit)
            throw new BadRequestException(progress.error || t('server-ai:Error.DefaultAgentPluginsSourceUnavailable'))
        return { commit: progress.commit, items: progress.items }
    }
}

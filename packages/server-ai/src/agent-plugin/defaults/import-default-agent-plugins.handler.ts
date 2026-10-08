// One official Git snapshot supplies the whole batch. An organization lock serializes retries;
// content digests reuse imported versions, while each package failure leaves the rest importable.
import { BadRequestException, ConflictException } from '@nestjs/common'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { DataSource } from 'typeorm'
import { readFile, rm } from 'node:fs/promises'
import { t } from 'i18next'
import { DEFAULT_AGENT_PLUGINS_SOURCE, type DefaultAgentPluginsImportResult } from '@xpert-ai/contracts'
import { ImportDefaultAgentPluginsCommand, getErrorMessage } from '@xpert-ai/plugin-sdk'
import { AgentPluginService, requireResourceAdmin } from '../agent-plugin.service'
import { stagePortableGit } from '../agent-plugin-source'
import { containedPath } from '../agent-plugin-parser'
import { defaultAgentPluginsManifest } from './default-agent-plugins.schema'

@CommandHandler(ImportDefaultAgentPluginsCommand)
export class ImportDefaultAgentPluginsHandler implements ICommandHandler<ImportDefaultAgentPluginsCommand> {
    constructor(
        private readonly plugins: AgentPluginService,
        private readonly database: DataSource
    ) {}

    async execute(): Promise<DefaultAgentPluginsImportResult> {
        const scope = requireResourceAdmin()
        const connection = this.database.createQueryRunner()
        await connection.connect()
        const lockKey = `xpert:agent-plugin-defaults:${scope.tenantId}:${scope.organizationId}`
        let acquired = false
        try {
            const locks: { acquired: boolean }[] = await connection.query(
                'SELECT pg_try_advisory_lock(hashtext($1)) AS acquired',
                [lockKey]
            )
            acquired = locks[0]?.acquired === true
            if (!acquired) throw new ConflictException(t('server-ai:Error.DefaultAgentPluginsImportBusy'))
            return await this.importPackages(scope)
        } finally {
            try {
                if (acquired) await connection.query('SELECT pg_advisory_unlock(hashtext($1))', [lockKey])
            } finally {
                await connection.release()
            }
        }
    }

    private async readManifest(root: string) {
        try {
            const path = await containedPath(root, 'quickstart.json')
            const data = await readFile(path, 'utf8')
            if (Buffer.byteLength(data) > 1024 * 1024) throw new Error('Manifest exceeds size limit')
            return defaultAgentPluginsManifest.parse(JSON.parse(data))
        } catch {
            throw new BadRequestException(t('server-ai:Error.DefaultAgentPluginsManifestInvalid'))
        }
    }

    private async importPackages(
        scope: ReturnType<typeof requireResourceAdmin>
    ): Promise<DefaultAgentPluginsImportResult> {
        const source = DEFAULT_AGENT_PLUGINS_SOURCE
        const staged = await stagePortableGit(source.url, source.ref, source.subdirectory).catch(() => {
            throw new BadRequestException(t('server-ai:Error.DefaultAgentPluginsSourceUnavailable'))
        })
        try {
            const manifest = await this.readManifest(staged.root)
            const existing = new Set((await this.plugins.packages.find({ where: scope })).map((pkg) => pkg.digest))
            const result: DefaultAgentPluginsImportResult = { commit: staged.commit, items: [] }
            for (const { id } of manifest.plugins) {
                try {
                    const root = await containedPath(staged.root, id)
                    const pkg = await this.plugins.importStagedDirectory(root, {
                        kind: 'git',
                        url: source.url,
                        ref: staged.commit,
                        commit: staged.commit,
                        subdirectory: `${source.subdirectory}/${id}`
                    })
                    result.items.push({
                        id,
                        packageId: pkg.id,
                        status: existing.has(pkg.digest) ? 'existing' : 'imported',
                        title: pkg.descriptor.extension?.interface?.displayName || pkg.descriptor.name,
                        diagnosticCount: pkg.descriptor.diagnostics.length
                    })
                    existing.add(pkg.digest)
                } catch (error) {
                    result.items.push({ id, status: 'failed', error: getErrorMessage(error) })
                }
            }
            return result
        } finally {
            await rm(staged.temp, { recursive: true, force: true })
        }
    }
}

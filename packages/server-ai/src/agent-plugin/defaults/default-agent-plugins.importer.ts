// Pin one Git snapshot for the batch and persist each item before continuing.
// Resumed work skips recorded outcomes; digest reuse covers a crash after import but before its receipt.
import { BadRequestException, Injectable } from '@nestjs/common'
import { readFile, rm } from 'node:fs/promises'
import { t } from 'i18next'
import {
    DEFAULT_AGENT_PLUGINS_SOURCE,
    resolveI18nText,
    type DefaultAgentPluginsImportProgress
} from '@xpert-ai/contracts'
import { getErrorMessage } from '@xpert-ai/plugin-sdk'
import { AgentPluginService } from '../agent-plugin.service'
import { agentPluginScopeWhere, type AgentPluginScope } from '../agent-plugin-scope'
import { stagePortableGit } from '../agent-plugin-source'
import { containedPath } from '../agent-plugin-parser'
import { defaultAgentPluginsManifest } from './default-agent-plugins.schema'

@Injectable()
export class DefaultAgentPluginsImporter {
    constructor(private readonly plugins: AgentPluginService) {}

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

    async run(
        scope: AgentPluginScope,
        progress: DefaultAgentPluginsImportProgress,
        persist: () => Promise<void>
    ): Promise<void> {
        const source = DEFAULT_AGENT_PLUGINS_SOURCE
        progress.phase = 'fetching'
        progress.currentId = null
        await persist()
        const staged = await stagePortableGit(source.url, progress.commit ?? source.ref, source.subdirectory).catch(
            () => {
                throw new BadRequestException(t('server-ai:Error.DefaultAgentPluginsSourceUnavailable'))
            }
        )
        try {
            const manifest = await this.readManifest(staged.root)
            const existing = new Set(
                (await this.plugins.packages.find({ where: agentPluginScopeWhere(scope) })).map((pkg) => pkg.digest)
            )
            progress.commit = staged.commit
            progress.total = manifest.plugins.length
            progress.phase = 'importing'
            await persist()
            const completed = new Set(progress.items.map((item) => item.id))
            for (const { id, path } of manifest.plugins) {
                if (completed.has(id)) continue
                progress.currentId = id
                await persist()
                try {
                    const directory = path ?? id
                    const root = await containedPath(staged.root, directory)
                    const pkg = await this.plugins.importStagedDirectory(root, {
                        kind: 'git',
                        url: source.url,
                        ref: staged.commit,
                        commit: staged.commit,
                        subdirectory: `${source.subdirectory}/${directory}`
                    })
                    progress.items.push({
                        id,
                        packageId: pkg.id,
                        status: existing.has(pkg.digest) ? 'existing' : 'imported',
                        title: resolveI18nText(pkg.descriptor.extension?.interface?.displayName) || pkg.descriptor.name,
                        diagnosticCount: pkg.descriptor.diagnostics.length
                    })
                    existing.add(pkg.digest)
                } catch (error) {
                    progress.items.push({ id, status: 'failed', error: getErrorMessage(error) })
                }
                await persist()
            }
        } finally {
            await rm(staged.temp, { recursive: true, force: true })
        }
        // A terminal receipt allows a new batch; finish cleanup before publishing it.
        progress.phase = 'completed'
        progress.currentId = null
        await persist()
    }
}

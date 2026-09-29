import { Inject, Injectable } from '@nestjs/common'
import { createHash } from 'node:crypto'
import {
    countFileChangeLines,
    parseFileChangeReport,
    type ChatFileChange,
    type FileChangeLineStats,
    type MessageFileChangeStats
} from '@xpert-ai/chatkit-types'
import { ArtifactsService, type ArtifactManagementResolvedVersion } from '../artifacts/artifacts.service'

export type FileChangeArtifactReader = {
    resolveForManagementAccess(ref: { artifactId: string; artifactVersionId: string }): Promise<{
        buffer: Buffer
        artifact: Pick<ArtifactManagementResolvedVersion['artifact'], 'pluginName' | 'resourceType'>
    }>
}

const CACHE_SIZE = 512

@Injectable()
export class FileChangeStatsService {
    private readonly cache = new Map<string, FileChangeLineStats>()
    constructor(@Inject(ArtifactsService) private readonly artifacts: FileChangeArtifactReader) {}

    async forChanges(messageId: string, changes: ChatFileChange[]): Promise<MessageFileChangeStats> {
        const items: MessageFileChangeStats['items'] = []
        for (let offset = 0; offset < changes.length; offset += 4) {
            items.push(
                ...(await Promise.all(
                    changes.slice(offset, offset + 4).map(async (change) => ({
                        workspacePath: change.workspacePath,
                        resource: change.resource,
                        stats: await this.forChange(change)
                    }))
                ))
            )
        }
        return { messageId, items }
    }

    private async forChange(change: ChatFileChange): Promise<FileChangeLineStats> {
        if (!change.resource || change.coverage !== 'observed') return { status: 'unavailable' }
        try {
            const { first, last } = change.resource
            // Re-authorize every request, including cache hits; never cache authorization or private reports.
            const read = async (ref: typeof first) => {
                const value = await this.artifacts.resolveForManagementAccess(ref)
                if (
                    value.buffer.length > 300_000 ||
                    value.artifact.pluginName !== 'platform.file-activity' ||
                    value.artifact.resourceType !== 'file-change'
                )
                    return null
                return parseFileChangeReport(JSON.parse(value.buffer.toString('utf8')))
            }
            const initial = read(first)
            const [before, after] = await Promise.all([
                initial,
                first.artifactId === last.artifactId && first.artifactVersionId === last.artifactVersionId
                    ? initial
                    : read(last)
            ])
            if (
                !before ||
                !after ||
                before.workspacePath !== change.workspacePath ||
                after.workspacePath !== change.workspacePath
            )
                return { status: 'unavailable' }
            const report = { ...after, before: before.before }
            const key = createHash('sha256')
                .update(JSON.stringify([report.before, report.after]))
                .digest('hex')
            const cached = this.cache.get(key)
            if (cached) return cached
            const stats = countFileChangeLines(report)
            if (this.cache.size >= CACHE_SIZE) this.cache.delete(this.cache.keys().next().value!)
            this.cache.set(key, stats)
            return stats
        } catch {
            return { status: 'unavailable' }
        }
    }
}

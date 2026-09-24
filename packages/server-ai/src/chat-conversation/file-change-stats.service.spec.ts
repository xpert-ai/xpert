jest.mock('../artifacts/artifacts.service', () => ({ ArtifactsService: class {} }))
import { FileChangeStatsService, type FileChangeArtifactReader } from './file-change-stats.service'
import type { ChatFileChange, FileChangeReport } from '@xpert-ai/chatkit-types'

const revision = (text: string) => ({ text, size: text.length, sha256: 'a'.repeat(64) })
const first: FileChangeReport = {
    schema: 'xpert.file-change.v1',
    workspacePath: 'a.txt',
    before: revision('a\nold\nz\n'),
    after: revision('intermediate\n'.repeat(100))
}
const last: FileChangeReport = { ...first, before: first.after, after: revision('a\nnew\nz\n') }
const change: ChatFileChange = {
    id: 'c',
    workspacePath: 'a.txt',
    title: 'a.txt',
    operation: 'modified',
    coverage: 'observed',
    resource: {
        type: 'file_change',
        first: { artifactId: 'a', artifactVersionId: '1' },
        last: { artifactId: 'a', artifactVersionId: '2' }
    }
}

describe('message change statistics', () => {
    const resolve = jest.fn<
        ReturnType<FileChangeArtifactReader['resolveForManagementAccess']>,
        Parameters<FileChangeArtifactReader['resolveForManagementAccess']>
    >()
    const resolved = (report: FileChangeReport) => ({
        buffer: Buffer.from(JSON.stringify(report)),
        artifact: { pluginName: 'platform.file-activity', resourceType: 'file-change' }
    })
    beforeEach(() => {
        resolve.mockReset()
        resolve.mockImplementation(async ({ artifactVersionId }) => resolved(artifactVersionId === '1' ? first : last))
    })
    it('counts earliest before to latest after, returning no private text', async () => {
        const service = new FileChangeStatsService({ resolveForManagementAccess: resolve })
        const value = await service.forChanges('m', [change])
        expect(value.items[0].stats).toEqual({ status: 'ready', added: 1, removed: 1 })
        expect(JSON.stringify(value)).not.toContain('intermediate')
        expect(JSON.stringify(value)).not.toContain('sha256')
        expect(resolve).toHaveBeenCalledTimes(2)
    })
    it('rechecks access before using cached counts, and does not expose denied versions', async () => {
        const service = new FileChangeStatsService({ resolveForManagementAccess: resolve })
        await service.forChanges('m', [change])
        resolve.mockRejectedValue(new Error('access denied'))
        expect((await service.forChanges('m', [change])).items[0].stats).toEqual({ status: 'unavailable' })
        expect(resolve).toHaveBeenCalledTimes(4)
    })
    it('does not count mismatched paths, incomplete history or legacy metadata', async () => {
        const service = new FileChangeStatsService({ resolveForManagementAccess: resolve })
        expect(
            (await service.forChanges('m', [{ ...change, workspacePath: 'different.txt' }])).items[0].stats.status
        ).toBe('unavailable')
        resolve.mockClear()
        expect((await service.forChanges('m', [{ ...change, coverage: 'legacy' }])).items[0].stats.status).toBe(
            'unavailable'
        )
        expect(resolve).not.toHaveBeenCalled()
    })
})

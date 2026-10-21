import { ForbiddenException, INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { analyticsInventoryDigest, RequestContext } from '@xpert-ai/plugin-sdk'
import { ArtifactsService } from '../artifacts.service'
import { ArtifactDraftsService } from '../drafts/artifact-drafts.service'
import { WorkspaceFilesRuntimeCapabilityService } from '../../shared/runtime/workspace-files-runtime-capability.service'
import { ArtifactAnalyticsInventoryService } from './artifact-analytics-inventory.service'
import { ArtifactAnalyticsInventoryController } from './artifact-analytics-inventory.controller'

const id = 'b1234567-1234-4234-8234-123456789012',
    version = 'c1234567-1234-4234-8234-123456789012'
const bytes = readFileSync(
    join(__dirname, '../../../../plugin-sdk/src/lib/data/analytics/testing/published-dashboard-v1.json')
)
const artifact = {
    id,
    pluginName: '@xpert-ai/plugin-live-dashboard',
    resourceType: 'live-dashboard',
    userId: 'viewer',
    status: 'active'
}
const draft = {
    id: version,
    artifactId: id,
    revision: 2,
    baseVersionId: version,
    sha256: analyticsInventoryDigest(bytes),
    workspaceFileRef: { source: 'platform.workspace.files' }
}
describe('artifact analytics inventory uses owning capabilities', () => {
    let app: INestApplication
    const getArtifact = jest.fn(),
        resolveForManagementAccess = jest.fn(),
        getDraft = jest.fn(),
        readBuffer = jest.fn()
    beforeEach(async () => {
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('viewer')
        getArtifact.mockReset().mockResolvedValue(artifact)
        resolveForManagementAccess.mockReset().mockResolvedValue({ buffer: bytes })
        getDraft.mockReset().mockResolvedValue(draft)
        readBuffer.mockReset().mockResolvedValue({ buffer: bytes })
        const module = await Test.createTestingModule({
            controllers: [ArtifactAnalyticsInventoryController],
            providers: [
                ArtifactAnalyticsInventoryService,
                { provide: ArtifactsService, useValue: { getArtifact, resolveForManagementAccess } },
                { provide: ArtifactDraftsService, useValue: { get: getDraft } },
                {
                    provide: WorkspaceFilesRuntimeCapabilityService,
                    useValue: { createScopedApi: () => ({ readBuffer }) }
                }
            ]
        }).compile()
        app = module.createNestApplication()
        await app.listen(0, '127.0.0.1')
    })
    afterEach(async () => {
        await app.close()
        jest.restoreAllMocks()
    })
    async function get(path: string, status = 200) {
        const response = await fetch(`${await app.getUrl()}/artifacts/analytics-inventory/${path}`)
        expect(response.status).toBe(status)
        return response.json()
    }
    it('reads the exact historical version through management authorization and returns only inventory metadata', async () => {
        const before = Buffer.from(bytes)
        const report = await get(`${id}/versions/${version}`)
        expect(resolveForManagementAccess).toHaveBeenCalledWith({ artifactId: id, artifactVersionId: version })
        expect(report.contentDigest).toBe(analyticsInventoryDigest(bytes))
        expect(report.bindings).toHaveLength(5)
        expect(JSON.stringify(report)).not.toMatch(/<html|bindingPayload|workspaceFileRef/)
        expect(bytes.equals(before)).toBe(true)
        expect(getArtifact).toHaveBeenCalledTimes(2)
    })
    it('checks the current user draft, immutable content digest and revision after reading', async () => {
        const report = await get(`${id}/draft`)
        expect(report).toMatchObject({ state: 'draft', revision: 2, baseVersionId: version })
        expect(readBuffer).toHaveBeenCalledWith(draft.workspaceFileRef)
        expect(getDraft).toHaveBeenCalledTimes(2)
        getDraft.mockResolvedValueOnce(draft).mockResolvedValueOnce({ ...draft, revision: 3 })
        await get(`${id}/draft`, 400)
        getDraft.mockResolvedValue({ ...draft, sha256: 'f'.repeat(64) })
        await get(`${id}/draft`, 400)
    })
    it('does not substitute the owner to inspect another user draft', async () => {
        getArtifact.mockResolvedValue({ ...artifact, userId: 'owner' })
        expect(await get(`${id}/draft`)).toEqual({ artifactId: id, state: 'not-editable' })
        expect(getDraft).not.toHaveBeenCalled()
        expect(readBuffer).not.toHaveBeenCalled()
    })
    it('preserves artifact permission denials and fails before accessing content', async () => {
        getArtifact.mockRejectedValue(new ForbiddenException())
        await get(`${id}/draft`, 403)
        await get(`${id}/versions/${version}`, 403)
        expect(readBuffer).not.toHaveBeenCalled()
        expect(resolveForManagementAccess).not.toHaveBeenCalled()
    })
    it('rejects unsupported owners and malformed resource IDs at the HTTP boundary', async () => {
        await get(`invalid/versions/${version}`, 400)
        expect(getArtifact).not.toHaveBeenCalled()
        getArtifact.mockResolvedValue({ ...artifact, pluginName: 'unrelated' })
        await get(`${id}/versions/${version}`, 400)
        expect(resolveForManagementAccess).not.toHaveBeenCalled()
    })
})

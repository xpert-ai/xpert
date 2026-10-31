import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { ForbiddenException } from '@nestjs/common'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { VolumeHandle, VolumeSubtreeClient } from '../shared/volume'
import { ArtifactContentRuntimeService } from './artifact-content-runtime.service'
import { Artifact, ArtifactVersion } from './entities'

describe('Artifact-owned content storage', () => {
    let root: string
    beforeEach(async () => {
        root = await mkdtemp(path.join(tmpdir(), 'artifact-protected-'))
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user')
    })
    afterEach(async () => {
        jest.restoreAllMocks()
        await rm(root, { recursive: true, force: true })
    })
    function fixture() {
        const artifact = {
            id: randomUUID(),
            tenantId: 'tenant',
            organizationId: 'org',
            userId: null,
            projectId: randomUUID(),
            status: 'active'
        }
        let member = false,
            revoked = false
        const versions: Array<{ workspaceFileRef: { filePath: string } }> = []
        const volume = new VolumeHandle(
            { tenantId: 'tenant', catalog: 'projects', projectId: artifact.projectId },
            root,
            '',
            '',
            root
        )
        const access = {
            assert: jest.fn(async (_artifact, _actor, operation, surface) => {
                if (revoked || (member && (operation !== 'read' || surface === 'draft'))) throw new ForbiddenException()
            })
        }
        const db = {
            getRepository: (entity: unknown) => {
                if (entity === Artifact)
                    return { findOneBy: async (input) => (input.id === artifact.id ? artifact : null) }
                if (entity === ArtifactVersion) return { findBy: async () => versions }
                throw new Error('unexpected repository')
            }
        }
        const service = new ArtifactContentRuntimeService(db as never, access as never, { resolve: () => volume })
        return {
            artifact,
            versions,
            volume,
            service,
            member: () => {
                member = true
            },
            revoke: () => {
                revoked = true
            }
        }
    }
    it('rejects malformed artifact identities before consulting persistence', async () => {
        const f = fixture()
        await expect(f.service.write({ artifactId: 'invalid-id', buffer: Buffer.from('data') })).rejects.toThrow(
            ForbiddenException
        )
        await expect(
            f.service.write({ artifactId: f.artifact.id, buffer: Buffer.alloc(50 * 1024 * 1024 + 1) })
        ).rejects.toThrow(ForbiddenException)
    })
    it('keeps draft bytes out of generic project files; members read only a published reference', async () => {
        const f = fixture(),
            bytes = Buffer.from('{"title":"draft"}')
        const ref = await f.service.write({ artifactId: f.artifact.id, buffer: bytes })
        expect((await f.service.read(ref)).buffer).toEqual(bytes)
        expect((await f.service.read({ ...ref, userId: 'user' })).buffer).toEqual(bytes)
        await expect(f.service.read({ ...ref, organizationId: 'other-org' })).rejects.toThrow(ForbiddenException)
        await expect(
            new VolumeSubtreeClient(f.volume, { allowRootWorkspace: true }).readBuffer('', ref.filePath)
        ).rejects.toThrow()
        f.member()
        await expect(f.service.read(ref)).rejects.toThrow(ForbiddenException)
        await expect(f.service.write({ artifactId: f.artifact.id, buffer: bytes })).rejects.toThrow(ForbiddenException)
        f.versions.push({ workspaceFileRef: ref })
        expect((await f.service.read(ref)).buffer).toEqual(bytes)
        await expect(f.service.read({ ...ref, projectId: randomUUID() })).rejects.toThrow(ForbiddenException)
        f.revoke()
        await expect(f.service.read(ref)).rejects.toThrow(ForbiddenException)
    })
})

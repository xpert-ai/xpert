import { ForbiddenException, GoneException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { ArtifactPresentationRegistry, RequestContext } from '@xpert-ai/plugin-sdk'
import type { ArtifactPresentationContext, IArtifactPresentationProvider } from '@xpert-ai/plugin-sdk'
import { captureRequestContext, runWithCapturedRequestContext } from '../../shared/request-context'
import { Artifact, ArtifactLink, ArtifactVersion } from '../entities'
import { ArtifactsService, ArtifactResolvedVersion } from '../artifacts.service'
import { ArtifactPresentationService } from './artifact-presentation.service'

describe('Authenticated Artifact presentations', () => {
    async function fixture() {
        const artifact = Object.assign(new Artifact(), {
            id: 'artifact',
            tenantId: 'tenant',
            organizationId: 'team',
            userId: 'owner',
            pluginName: 'example-plugin',
            resourceType: 'report',
            resourceId: 'report-1',
            status: 'active',
            title: 'PRIVATE DRAFT TITLE'
        })
        const version = Object.assign(new ArtifactVersion(), {
            id: 'version-1',
            artifactId: artifact.id,
            versionNumber: 1,
            title: 'Published title'
        })
        const link = Object.assign(new ArtifactLink(), { accessMode: 'organization_all', status: 'active' })
        let allowed = true
        const authorize = () => {
            if (!allowed) throw new ForbiddenException()
            if (link.status !== 'active') throw new GoneException()
            return { artifact, version, link }
        }
        const read = jest.fn(
            async (): Promise<ArtifactResolvedVersion> => ({
                ...authorize(),
                buffer: Buffer.from('published'),
                mimeType: 'application/json',
                fileName: 'report.json',
                disposition: 'inline'
            })
        )
        const describe = jest.fn(async () => authorize())
        const seen: ArtifactPresentationContext[] = []
        const query = jest.fn(async (context: ArtifactPresentationContext) => {
            seen.push(context)
            expect(RequestContext.currentUserId()).toBe('viewer')
            expect(RequestContext.getOrganizationId()).toBe('team')
            return { result: 42 }
        })
        const providerRead = jest.fn(async (context: ArtifactPresentationContext) => {
            seen.push(context)
            return { text: context.content.toString() }
        })
        const provider: IArtifactPresentationProvider = {
            operations: ['dataset'],
            getEntry: async () => ({ html: '<html><head></head></html>' }),
            read: providerRead,
            query
        }
        const registrations = jest.fn(
            (): ReturnType<ArtifactPresentationRegistry['listRegistrations']> => [
                {
                    type: 'example-plugin:report',
                    source: { kind: 'plugin', pluginName: 'example-plugin', scopeKey: 'team' },
                    strategy: provider
                }
            ]
        )
        const module = await Test.createTestingModule({
            providers: [
                ArtifactPresentationService,
                {
                    provide: ArtifactsService,
                    useValue: { resolveForAuthenticatedAccess: read, resolveDescriptorForAuthenticatedAccess: describe }
                },
                { provide: ArtifactPresentationRegistry, useValue: { listRegistrations: registrations } }
            ]
        }).compile()
        const service = module.get(ArtifactPresentationService)
        const run = <T>(work: () => Promise<T>) =>
            runWithCapturedRequestContext(
                captureRequestContext({
                    user: { id: 'viewer', tenantId: 'tenant' },
                    tenantId: 'tenant',
                    organizationId: 'untrusted-current-org'
                }),
                work
            )
        return {
            service,
            run,
            seen,
            artifact,
            version,
            link,
            read,
            describe,
            query,
            providerRead,
            registrations,
            deny: () => {
                allowed = false
            },
            target: { artifactId: artifact.id, versionId: version.id }
        }
    }

    it('returns published metadata and executes as the viewer in the authorized organization', async () => {
        const f = await fixture()
        const page = await f.run(() => f.service.read('team-link'))
        expect(page).toMatchObject({
            title: 'Published title',
            readOnly: true,
            target: f.target,
            operations: ['dataset']
        })
        expect(JSON.stringify(page)).not.toContain('PRIVATE DRAFT')
        expect(f.seen[0].actor).toEqual({ userId: 'viewer', tenantId: 'tenant', organizationId: 'team' })
        expect(
            await f.run(() => f.service.query('team-link', { target: f.target, operation: 'dataset', input: {} }))
        ).toEqual({ result: 42 })
        expect(f.describe).toHaveBeenCalledTimes(2)
    })
    it.each(['save', 'publish', 'revoke-share', 'arbitrary-sql'])(
        'rejects undeclared operation %s',
        async (operation) => {
            const f = await fixture()
            await expect(
                f.run(() => f.service.query('team-link', { target: f.target, operation, input: {} }))
            ).rejects.toBeInstanceOf(ForbiddenException)
            expect(f.query).not.toHaveBeenCalled()
        }
    )
    it('rejects another version or Artifact before executing a query', async () => {
        const f = await fixture()
        for (const target of [
            { ...f.target, versionId: 'older-version' },
            { ...f.target, artifactId: 'foreign-artifact' }
        ])
            await expect(
                f.run(() => f.service.query('team-link', { target, operation: 'dataset', input: {} }))
            ).rejects.toMatchObject({ status: 409 })
        expect(f.query).not.toHaveBeenCalled()
    })
    it('rechecks membership and revocation before releasing an in-flight result', async () => {
        for (const reason of ['membership', 'revoked', 'version']) {
            const f = await fixture()
            f.query.mockImplementationOnce(async () => {
                if (reason === 'membership') f.deny()
                if (reason === 'revoked') f.link.status = 'revoked'
                if (reason === 'version') f.version.id = 'version-2'
                return { result: 42 }
            })
            await expect(
                f.run(() => f.service.query('team-link', { target: f.target, operation: 'dataset', input: {} }))
            ).rejects.toThrow()
        }
    })
    it('rejects an unavailable plugin registration and anonymous link policies', async () => {
        const f = await fixture()
        f.registrations.mockReturnValue([])
        await expect(f.run(() => f.service.read('team-link'))).rejects.toMatchObject({ status: 404 })
        f.link.accessMode = 'public_link'
        await expect(f.run(() => f.service.read('team-link'))).rejects.toBeInstanceOf(ForbiddenException)
    })
    it.each([
        { kind: 'plugin' as const, pluginName: 'foreign-plugin', scopeKey: 'team' },
        { kind: 'builtin' as const, scopeKey: 'team' }
    ])('rejects a registration that does not belong to the Artifact source: $kind', async (source) => {
        const f = await fixture()
        const [registration] = f.registrations()
        f.registrations.mockReturnValue([{ ...registration, source }])
        await expect(f.run(() => f.service.read('team-link'))).rejects.toMatchObject({ status: 404 })
        expect(f.providerRead).not.toHaveBeenCalled()
    })
    it('rejects a different tenant even if the Artifact resolver supplies a result', async () => {
        const f = await fixture()
        f.artifact.tenantId = 'foreign-tenant'
        await expect(f.run(() => f.service.read('team-link'))).rejects.toBeInstanceOf(ForbiddenException)
        expect(f.providerRead).not.toHaveBeenCalled()
    })
    it('does not release a presentation after membership is revoked during provider rendering', async () => {
        const f = await fixture()
        f.providerRead.mockImplementationOnce(async () => {
            f.deny()
            return { text: 'private data' }
        })
        await expect(f.run(() => f.service.read('team-link'))).rejects.toBeInstanceOf(ForbiddenException)
    })
})

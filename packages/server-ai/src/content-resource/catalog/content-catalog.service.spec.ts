import { createHash } from 'node:crypto'
import { parseAnalysisEvidence, analysisEvidenceDigestInput } from '@xpert-ai/plugin-sdk/analytics'
import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { ContentCatalogService } from './content-catalog.service'
import { getMetadataArgsStorage } from 'typeorm'
import { ContentResourceEntry } from './content-entry.entity'
import { contentSnapshotSchema } from './catalog.schema'

it('rejects contained paths that escape the Project or ambiguously cover its root', () => {
    for (const path of ['', '/', '../private', 'folder/../private', '/absolute', 'folder//asset', 'folder\\asset']) {
        expect(
            contentSnapshotSchema.safeParse({ ...fixture().snapshot, containedPaths: [{ path, recursive: true }] })
                .success
        ).toBe(false)
    }
    expect(
        contentSnapshotSchema.safeParse({
            ...fixture().snapshot,
            containedPaths: [{ path: 'owned/assets', recursive: true }]
        }).success
    ).toBe(true)
})

const projectId = '10000000-0000-4000-8000-000000000001'
const input = {
    actor: { tenantId: 'tenant', organizationId: 'org', userId: 'editor' },
    projectId,
    assistantId: 'assistant'
}
function fixture() {
    const snapshot = {
        projectId,
        typeId: 'presentation',
        modelId: 'deck',
        schemaVersion: '1',
        editProtocol: { id: 'deck', version: '1' },
        title: 'Deck',
        revision: '3',
        updatedAt: '2026-10-25T00:00:00.000Z',
        deleted: false,
        source: { kind: 'managed' },
        defaultEditorKey: 'deck.editor',
        allowedActions: ['rename']
    }
    const catalog = {
        acceptedTransferSchemas: [] as string[],
        types: [{ typeId: 'presentation', modelId: 'deck', schemaVersion: '1', implementationKey: 'deck' }],
        describe: jest.fn().mockResolvedValue(snapshot),
        discover: jest.fn().mockResolvedValue({ resourceIds: ['deck-1'] }),
        extract: jest.fn().mockResolvedValue({
            revision: '3',
            sections: [{ anchor: { kind: 'slide', id: 'slide-1' }, text: 'Body' }]
        }),
        create: jest.fn().mockResolvedValue({ providerKey: 'decks', resourceId: 'deck-1' }),
        mutate: jest.fn()
    }
    const provider = { catalog, authorize: jest.fn().mockResolvedValue({ canWrite: true }) }
    const providers = {
        get: jest.fn().mockReturnValue(provider),
        listRegistrations: jest.fn(() => [{ type: 'decks', strategy: provider }])
    }
    const identities = { principal: jest.fn().mockImplementation((actor) => ({ ...actor, groupIds: [] })) }
    const projects = {
        assertAssistant: jest.fn().mockResolvedValue({ role: 'editor', archived: false }),
        listReadable: jest.fn()
    }
    const rows: ContentResourceEntry[] = []
    const insert = {
        insert: jest.fn().mockReturnThis(),
        values: jest.fn().mockReturnThis(),
        orIgnore: jest.fn().mockReturnThis(),
        execute: jest.fn().mockImplementation(() => {
            const value = insert.values.mock.calls.at(-1)?.[0]
            if (!rows.length) rows.push({ ...value, id: 'catalog-id', bindingRevision: 1 })
            Object.assign(value, { id: 'insert-returning-id', createdAt: new Date() })
        })
    }
    const entries = {
        update: jest.fn(),
        createQueryBuilder: () => insert,
        find: async () => rows,
        findOneBy: jest
            .fn()
            .mockImplementation((where) =>
                rows.find((row) => row.id === where.id && row.projectId === where.projectId)
            ),
        findOneOrFail: jest.fn().mockImplementation(({ where, lock }) => {
            expect(lock).toEqual({ mode: 'pessimistic_write' })
            if ('createdAt' in where || 'id' in where) throw new Error('Insert RETURNING leaked into lookup')
            return rows[0]
        }),
        manager: { transaction: jest.fn() }
    }
    entries.manager.transaction.mockImplementation((callback) => callback({ getRepository: () => entries }))
    const operations = { retain: jest.fn().mockResolvedValue({}), finish: jest.fn() }
    return {
        service: new ContentCatalogService(
            entries as never,
            providers as never,
            identities as never,
            projects as never,
            operations as never
        ),
        snapshot,
        provider,
        providers,
        catalog,
        projects,
        operations,
        rows,
        entries
    }
}
describe('project content catalog', () => {
    it.each([200, 201, 256])('can persist an accepted opaque revision of %i characters', async (length) => {
        const f = fixture()
        const revision = 'r'.repeat(length)
        f.catalog.describe.mockResolvedValue({ ...f.snapshot, revision })
        const column = getMetadataArgsStorage().columns.find(
            ({ target, propertyName }) => target === ContentResourceEntry && propertyName === 'sourceRevision'
        )
        // Validate persistence capacity as well as the provider boundary; a mock repository
        // alone would accept values that PostgreSQL rejects after registration.
        expect(contentSnapshotSchema.safeParse({ ...f.snapshot, revision }).success).toBe(true)
        expect(Number(column?.options.length)).toBeGreaterThanOrEqual(length)
        const item = await f.service.register({ ...input, source: { providerKey: 'decks', resourceId: 'deck-1' } })
        expect(item.revision).toBe(revision)
        expect(f.entries.update).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ sourceRevision: revision })
        )
    })
    it('does not discover or register providers excluded by the consuming directory', async () => {
        const f = fixture()
        await f.service.register({ ...input, source: { providerKey: 'decks', resourceId: 'deck-1' } })
        f.catalog.describe.mockClear()
        expect((await f.service.list({ ...input, excludedProviderKeys: ['decks'] })).items).toEqual([])
        expect(f.catalog.discover).not.toHaveBeenCalled()
        expect(f.catalog.describe).not.toHaveBeenCalled()
    })
    it('gives a resource one stable catalog identity across Assistants and retries', async () => {
        const f = fixture()
        const source = { providerKey: 'decks', resourceId: 'deck-1' }
        const first = await f.service.register({ ...input, source })
        const second = await f.service.register({ ...input, assistantId: 'other-assistant', source })
        expect(first.contentId).toBe(second.contentId)
        expect(f.rows).toHaveLength(1)
    })
    it('re-reads the source after locking instead of projecting a delayed pre-lock response', async () => {
        const f = fixture()
        f.catalog.describe.mockResolvedValueOnce(f.snapshot).mockResolvedValueOnce({
            ...f.snapshot,
            revision: 'new-opaque-revision',
            title: 'New title',
            deleted: true
        })
        const item = await f.service.register({ ...input, source: { providerKey: 'decks', resourceId: 'deck-1' } })
        expect(item.title).toBe('New title')
        expect(f.entries.update).toHaveBeenCalledWith(
            { id: 'catalog-id', bindingRevision: 1 },
            expect.objectContaining({ sourceRevision: 'new-opaque-revision', title: 'New title', deleted: true })
        )
    })
    it('reauthorizes direct links and omits revoked resources from lists', async () => {
        const f = fixture()
        const list = await f.service.list(input)
        expect(list.items).toHaveLength(1)
        f.provider.authorize.mockRejectedValue(new ForbiddenException())
        expect((await f.service.list(input)).items).toHaveLength(0)
        await expect(f.service.get({ ...input, contentId: list.items[0].contentId })).rejects.toThrow(
            ForbiddenException
        )
    })
    it('rejects a provider describing a resource outside the requested Project', async () => {
        const f = fixture()
        f.catalog.describe.mockResolvedValue({ ...f.snapshot, projectId: '20000000-0000-4000-8000-000000000002' })
        await expect(
            f.service.register({ ...input, source: { providerKey: 'decks', resourceId: 'other' } })
        ).rejects.toThrow(ForbiddenException)
        expect(f.rows).toHaveLength(0)
    })
    it('never returns a projection if its source changed or access was revoked', async () => {
        const f = fixture(),
            item = (await f.service.list(input)).items[0]
        expect(
            (await f.service.projectText({ ...input, contentId: item.contentId, expectedRevision: '3' }))?.sections
        ).toHaveLength(1)
        f.catalog.extract.mockImplementationOnce(async () => {
            f.catalog.describe.mockResolvedValue({ ...f.snapshot, revision: '4' })
            return { revision: '3', sections: [] }
        })
        await expect(
            f.service.projectText({ ...input, contentId: item.contentId, expectedRevision: '3' })
        ).rejects.toThrow()
        f.provider.authorize.mockRejectedValue(new ForbiddenException())
        await expect(
            f.service.projectText({ ...input, contentId: item.contentId, expectedRevision: '4' })
        ).rejects.toThrow()
    })
    it('only exposes an offline source when its provider explicitly delegated to current Project permissions', async () => {
        const f = fixture(),
            item = (await f.service.list(input)).items[0]
        f.providers.listRegistrations.mockReturnValue([])
        await expect(f.service.get({ ...input, contentId: item.contentId })).rejects.toThrow(ForbiddenException)
        f.rows[0].offlineSnapshot = {
            ...f.snapshot,
            source: { kind: 'managed' },
            allowedActions: ['rename'],
            offlineAccess: 'project'
        }
        const fallback = await f.service.get({ ...input, contentId: item.contentId })
        expect(fallback.availability).toBe('provider-unavailable')
        expect(fallback.canWrite).toBe(false)
        expect(fallback.allowedActions).toEqual([])
        await expect(
            f.service.mutate({
                ...input,
                contentId: item.contentId,
                expectedRevision: '3',
                change: { action: 'rename', title: 'Cannot edit offline' }
            })
        ).rejects.toThrow(ForbiddenException)
        await expect(
            f.service.projectText({ ...input, contentId: item.contentId, expectedRevision: '3' })
        ).rejects.toThrow(BadRequestException)
        await expect(
            f.service.create({
                ...input,
                providerKey: 'decks',
                implementationKey: 'deck',
                title: 'New',
                requestId: 'request'
            })
        ).rejects.toThrow(BadRequestException)
        expect(f.catalog.mutate).not.toHaveBeenCalled()
        expect(f.catalog.create).not.toHaveBeenCalled()
        f.projects.assertAssistant.mockRejectedValue(new ForbiddenException())
        await expect(f.service.get({ ...input, contentId: item.contentId })).rejects.toThrow(ForbiddenException)
    })
    it('requires live editor rights and current revisions before mutation', async () => {
        const f = fixture(),
            item = (await f.service.list(input)).items[0]
        await expect(
            f.service.mutate({
                ...input,
                contentId: item.contentId,
                expectedRevision: 'old',
                change: { action: 'rename', title: 'New' }
            })
        ).rejects.toThrow()
        expect(f.catalog.mutate).not.toHaveBeenCalled()
        f.projects.assertAssistant.mockResolvedValue({ role: 'member', archived: false })
        expect((await f.service.get({ ...input, contentId: item.contentId })).allowedActions).toEqual([])
        await expect(
            f.service.create({
                ...input,
                providerKey: 'decks',
                implementationKey: 'deck',
                title: 'New',
                requestId: 'request'
            })
        ).rejects.toThrow(ForbiddenException)
        expect(f.catalog.create).not.toHaveBeenCalled()
    })
})

describe('authorized content transfer', () => {
    const create = {
        ...input,
        providerKey: 'decks',
        implementationKey: 'deck',
        requestId: 'new-target',
        title: 'Copy',
        transferFrom: { contentId: 'catalog-id', expectedRevision: '3' }
    }
    async function prepared() {
        const f = fixture()
        f.catalog.acceptedTransferSchemas.push('xpert.content-transfer@1')
        await f.service.register({ ...input, source: { providerKey: 'decks', resourceId: 'deck-1' } })
        return f
    }
    it('derives a bounded source projection on the host and carries original element identities', async () => {
        const f = await prepared()
        await f.service.create(create)
        expect(f.catalog.create).toHaveBeenCalledWith(
            expect.objectContaining({
                initialContent: {
                    schema: 'xpert.content-transfer@1',
                    source: { providerKey: 'decks', resourceId: 'deck-1', revision: '3', title: 'Deck' },
                    sections: [{ anchor: { kind: 'slide', id: 'slide-1' }, text: 'Body' }]
                }
            })
        )
    })
    it('rejects unsupported target transfer and stale source revisions before target creation', async () => {
        const f = await prepared()
        f.catalog.acceptedTransferSchemas.length = 0
        await expect(f.service.create(create)).rejects.toThrow()
        f.catalog.acceptedTransferSchemas.push('xpert.content-transfer@1')
        await expect(
            f.service.create({ ...create, transferFrom: { ...create.transferFrom, expectedRevision: '2' } })
        ).rejects.toThrow()
        expect(f.catalog.create).not.toHaveBeenCalled()
    })
    it('reauthorizes after source extraction and does not release revoked source content to the target', async () => {
        const f = await prepared()
        f.catalog.extract.mockImplementation(async () => {
            f.provider.authorize.mockRejectedValue(new ForbiddenException())
            return { revision: '3', sections: [] }
        })
        await expect(f.service.create(create)).rejects.toThrow()
        expect(f.catalog.create).not.toHaveBeenCalled()
    })
    it('negotiates validated evidence, checks integrity and prevents post-write revocation delivery', async () => {
        const f = await prepared()
        f.catalog.acceptedTransferSchemas.push('xpert.content-analysis-transfer@1')
        const evidence = parseAnalysisEvidence({
            schema: 'xpert.analysis-evidence@1',
            id: projectId,
            title: 'Revenue',
            capturedAt: '2026-11-12T00:00:00.000Z',
            source: { artifactId: projectId, versionId: projectId, projectId },
            controls: {},
            datasets: [
                {
                    schema: 'xpert.analytics.dataset',
                    datasetId: 'sales',
                    fields: [
                        {
                            id: 'value',
                            sourceField: 'value',
                            label: 'Revenue',
                            logicalType: 'float64',
                            nullable: false,
                            role: 'measure'
                        }
                    ],
                    rows: [{ value: 3500 }],
                    grain: [],
                    completeness: {
                        returnedRows: 1,
                        totalRows: 1,
                        totalAccuracy: 'exact',
                        scope: 'full_query_result',
                        truncated: false
                    },
                    freshness: { executedAt: '2026-11-12T00:00:00.000Z', sourceFetchedAt: '2026-11-12T00:00:00.000Z' },
                    provenance: { executionId: 'run', bindingId: 'sales', providerId: 'test' }
                }
            ],
            statements: [],
            sha256: '0'.repeat(64)
        })
        evidence.sha256 = createHash('sha256').update(analysisEvidenceDigestInput(evidence)).digest('hex')
        const payload = {
            schema: 'xpert.content-analysis-transfer@1',
            source: { providerKey: 'decks', resourceId: 'deck-1', revision: '3', title: 'Deck' },
            evidence
        }
        const transfer = jest.fn().mockResolvedValue(payload)
        Object.assign(f.catalog, { transfer })
        await f.service.create(create)
        expect(transfer).toHaveBeenCalledWith(
            expect.objectContaining({ expectedRevision: '3', acceptedSchemas: f.catalog.acceptedTransferSchemas })
        )
        expect(f.catalog.create).toHaveBeenCalledWith(expect.objectContaining({ initialContent: payload }))
        evidence.datasets[0].rows[0].value = 1
        f.catalog.create.mockClear()
        await expect(f.service.create(create)).rejects.toThrow()
        expect(f.catalog.create).not.toHaveBeenCalled()
        evidence.datasets[0].rows[0].value = 3500
        f.catalog.create.mockImplementation(async () => {
            f.provider.authorize.mockRejectedValue(new ForbiddenException())
            return { providerKey: 'decks', resourceId: 'deck-1' }
        })
        await expect(f.service.create(create)).rejects.toThrow()
    })
    it('does not forward caller supplied content when the source projection is absent', async () => {
        const f = await prepared()
        await f.service.create({
            ...create,
            transferFrom: undefined,
            initialContent: { sections: [{ text: 'forged' }] }
        } as never)
        expect(f.catalog.create).toHaveBeenCalledWith(expect.objectContaining({ initialContent: undefined }))
        const retained = f.operations.retain.mock.calls.find(([payload]) => payload.kind === 'create')?.[0].input
        expect(retained).not.toHaveProperty('initialContent')
    })
    it('rejects nested scope overrides before creating a cross-project copy', async () => {
        const f = await prepared()
        const otherProject = '20000000-0000-4000-8000-000000000002'
        f.rows[0].projectId = otherProject
        f.catalog.describe.mockResolvedValue({ ...f.snapshot, projectId: otherProject })
        const forged = { ...create, transferFrom: { ...create.transferFrom, projectId: otherProject } }
        await expect(f.service.create(forged)).rejects.toThrow()
        expect(f.catalog.create).not.toHaveBeenCalled()
    })
    it.each(['envelope', 'source'])('rejects undeclared fields in the transfer %s', async (location) => {
        const f = await prepared()
        const payload = {
            schema: 'xpert.content-transfer@1',
            source: { providerKey: 'decks', resourceId: 'deck-1', revision: '3', title: 'Deck' },
            sections: [{ anchor: { kind: 'slide', id: 'slide-1' }, text: 'Body' }]
        }
        Object.assign(f.catalog, {
            transfer: jest
                .fn()
                .mockResolvedValue(
                    location === 'source'
                        ? { ...payload, source: { ...payload.source, credentials: 'private' } }
                        : { ...payload, credentials: 'private' }
                )
        })
        await expect(f.service.create(create)).rejects.toThrow(BadRequestException)
        expect(f.catalog.create).not.toHaveBeenCalled()
    })
    it('reauthorizes target editing after source extraction', async () => {
        const f = await prepared()
        f.catalog.extract.mockImplementation(async () => {
            f.projects.assertAssistant.mockResolvedValue({ role: 'viewer', archived: false })
            return { revision: '3', sections: [] }
        })
        await expect(f.service.create(create)).rejects.toThrow(ForbiddenException)
        expect(f.catalog.create).not.toHaveBeenCalled()
    })
    it('does not invoke a target provider replaced during extraction', async () => {
        const f = await prepared()
        f.catalog.extract.mockImplementation(async () => {
            f.providers.listRegistrations.mockReturnValue([
                { type: 'decks', strategy: { ...f.provider, catalog: { ...f.catalog } } }
            ])
            return { revision: '3', sections: [] }
        })
        await expect(f.service.create(create)).rejects.toThrow(BadRequestException)
        expect(f.catalog.create).not.toHaveBeenCalled()
    })
    it.each(['revision', 'binding', 'deleted'])('rejects a native transfer when source %s changes', async (change) => {
        const f = await prepared()
        Object.assign(f.catalog, {
            transfer: jest.fn().mockImplementation(async () => {
                if (change === 'binding') f.rows[0].bindingRevision += 1
                else
                    f.catalog.describe.mockResolvedValue({
                        ...f.snapshot,
                        ...(change === 'revision' ? { revision: '4' } : { deleted: true })
                    })
                return {
                    schema: 'xpert.content-transfer@1',
                    source: { providerKey: 'decks', resourceId: 'deck-1', revision: '3', title: 'Deck' },
                    sections: []
                }
            })
        })
        await expect(f.service.create(create)).rejects.toThrow()
        expect(f.catalog.create).not.toHaveBeenCalled()
    })
    it.each(['providerKey', 'resourceId', 'revision'])('rejects a producer substituting source %s', async (field) => {
        const f = await prepared()
        Object.assign(f.catalog, {
            transfer: jest.fn().mockResolvedValue({
                schema: 'xpert.content-transfer@1',
                source: {
                    providerKey: 'decks',
                    resourceId: 'deck-1',
                    revision: '3',
                    title: 'Deck',
                    [field]: 'other'
                },
                sections: []
            })
        })
        await expect(f.service.create(create)).rejects.toThrow(BadRequestException)
        expect(f.catalog.create).not.toHaveBeenCalled()
    })
    it.each(['duplicate anchors', 'oversized text'])(
        'applies projection limits to native transfers: %s',
        async (scenario) => {
            const f = await prepared()
            const sections =
                scenario === 'duplicate anchors'
                    ? Array.from({ length: 2 }, () => ({ anchor: { kind: 'slide', id: 'same' }, text: 'Body' }))
                    : Array.from({ length: 11 }, (_, i) => ({
                          anchor: { kind: 'slide', id: String(i) },
                          text: 'x'.repeat(100000)
                      }))
            Object.assign(f.catalog, {
                transfer: jest.fn().mockResolvedValue({
                    schema: 'xpert.content-transfer@1',
                    source: { providerKey: 'decks', resourceId: 'deck-1', revision: '3', title: 'Deck' },
                    sections
                })
            })
            await expect(f.service.create(create)).rejects.toThrow(BadRequestException)
            expect(f.catalog.create).not.toHaveBeenCalled()
        }
    )
})

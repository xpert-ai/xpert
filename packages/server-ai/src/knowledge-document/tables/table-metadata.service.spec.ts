jest.mock('../../shared/agent/middleware-runtime', () => ({ AgentMiddlewareRuntimeService: class {} }))
import { Repository } from 'typeorm'
import {
    IKnowledgebase,
    KBDocumentCategoryEnum,
    KnowledgeTableSource,
    KnowledgebaseTypeEnum
} from '@xpert-ai/contracts'
import { KnowledgeDocument } from '../document.entity'
import {
    KnowledgeTableMetadataService,
    TableMetadataStaleError,
    tableMetadataInputHash
} from './table-metadata.service'
import { AgentMiddlewareRuntimeService } from '../../shared/agent/middleware-runtime'

function fixture() {
    const knowledgebase: IKnowledgebase = {
        id: 'kb',
        name: 'Orders',
        type: KnowledgebaseTypeEnum.Standard,
        chatModel: { id: 'chat', copilotId: 'copilot', model: 'llm' },
        parserConfig: {
            chunkSize: 500,
            chunkOverlap: 0,
            delimiter: null,
            tableMetadataRequirements: 'Amounts use CNY.'
        }
    }
    const document = Object.assign(new KnowledgeDocument(), {
        id: 'doc',
        tenantId: 'tenant',
        organizationId: 'org',
        knowledgebaseId: 'kb',
        version: 1,
        publicationEpoch: 2,
        sourceHash: 'bytes',
        type: 'csv',
        category: KBDocumentCategoryEnum.Sheet,
        parserConfig: { tableMetadataRequirements: '', indexedFields: ['amount'] },
        metadata: { owner: 'alice' },
        knowledgebase
    })
    const source: KnowledgeTableSource = {
        tableId: 'table',
        sheetName: 'Orders',
        range: 'A1:B2',
        rowCount: 1,
        columns: [
            { columnId: 'A', key: 'amount', label: 'amount', column: 1 },
            { columnId: 'B', key: 'secret', label: 'secret', column: 2 }
        ],
        samples: [{ rowNumber: 2, values: { A: 100, B: 'private forecast' } }]
    }
    const parameters: { [key: string]: unknown } = {}
    const builder = {
        update: jest.fn(() => builder),
        set: jest.fn(() => builder),
        where: jest.fn((_sql: string, values: object) => {
            Object.assign(parameters, values)
            return builder
        }),
        andWhere: jest.fn((_sql: string, values?: object) => {
            Object.assign(parameters, values)
            return builder
        }),
        setParameters: jest.fn((values: object) => {
            Object.assign(parameters, values)
            return builder
        }),
        execute: jest.fn(async () => {
            const state = document.metadata.tableMetadata
            if (
                parameters.version !== document.version ||
                (state ? JSON.stringify(state) : null) !== parameters.previousState
            )
                return { affected: 0 }
            document.metadata.tableMetadata = JSON.parse(String(parameters.nextState))
            return { affected: 1 }
        })
    }
    const repository = { findOne: jest.fn(async () => structuredClone(document)), createQueryBuilder: () => builder }
    const invoke = jest.fn(
        async (_messages: Array<{ role: string; content: string }>, _options?: { runName?: string }) => ({
            content: JSON.stringify({
                summary: 'Sales orders',
                columns: [{ columnId: 'A', description: 'Order amount' }]
            })
        })
    )
    const detectLanguage = jest.fn(async (_messages: Array<{ role: string; content: string }>) => ({
        content: '{"language":"en"}'
    }))
    const runtime = {
        createModelClient: jest.fn(async () => ({
            invoke: (messages: Array<{ role: string; content: string }>, options?: { runName?: string }) =>
                options?.runName === 'knowledge-table-language' ? detectLanguage(messages) : invoke(messages, options)
        }))
    }
    const service = new KnowledgeTableMetadataService(
        repository as unknown as Repository<KnowledgeDocument>,
        runtime as unknown as AgentMiddlewareRuntimeService
    )
    return { knowledgebase, document, source, repository, invoke, detectLanguage, runtime, service, builder }
}

describe('KnowledgeTableMetadataService', () => {
    it('uses the model-selected Japanese language for Han-only headers and reuses it on retry', async () => {
        const f = fixture()
        f.source.sheetName = '\u58f2\u4e0a'
        f.source.columns[0].label = '\u58f2\u4e0a\u91d1\u984d'
        f.detectLanguage.mockResolvedValue({ content: '{"language":"ja"}' })
        f.invoke.mockRejectedValueOnce(new Error('temporary failure')).mockResolvedValue({
            content: JSON.stringify({
                summary: '\u58f2\u4e0a\u306b\u95a2\u3059\u308b\u8a18\u9332\u3067\u3059',
                columns: [{ columnId: 'A', description: '\u58f2\u4e0a\u306e\u91d1\u984d\u3067\u3059' }]
            })
        })
        expect((await f.service.prepare(f.document, f.knowledgebase, [f.source])).status).toBe('failed')
        const result = await f.service.prepare(f.document, f.knowledgebase, [f.source])
        expect(result).toMatchObject({ status: 'generated', language: 'ja' })
        expect(f.detectLanguage).toHaveBeenCalledTimes(1)
        expect(f.invoke.mock.calls[0][0][0].content).toContain('"ja"')
        expect(JSON.stringify(f.detectLanguage.mock.calls)).not.toContain('secret')
        expect(JSON.stringify(f.detectLanguage.mock.calls)).not.toContain('private forecast')
    })

    it('preflights every table before any paid call when a single header cannot fit', async () => {
        const f = fixture()
        const oversized = {
            ...f.source,
            tableId: 'oversized',
            columns: [{ ...f.source.columns[0], label: 'enormous header '.repeat(20000) }]
        }
        expect((await f.service.prepare(f.document, f.knowledgebase, [f.source, oversized])).status).toBe('failed')
        expect(f.runtime.createModelClient).not.toHaveBeenCalled()
        expect(f.invoke).not.toHaveBeenCalled()
        expect(f.detectLanguage).not.toHaveBeenCalled()
    })

    it('generates hundreds of long headers and reduces all header groups to one summary', async () => {
        const f = fixture()
        f.document.parserConfig.indexedFields = undefined
        f.source.columns = Array.from({ length: 300 }, (_, index) => ({
            columnId: String(index),
            key: `sensor${index}`,
            column: index + 1,
            label: `Sensor ${index} ${'temperature pressure measurement details '.repeat(6)}`
        }))
        f.source.samples = []
        f.invoke.mockImplementation(async (messages, options) => {
            const input: KnowledgeTableSource = JSON.parse(messages[1].content)
            return {
                content: JSON.stringify({
                    summary: 'Equipment measurements',
                    columns:
                        options.runName === 'knowledge-table-summary'
                            ? []
                            : input.columns.map((column) => ({ columnId: column.columnId, description: '' }))
                })
            }
        })
        const result = await f.service.prepare(f.document, f.knowledgebase, [f.source])
        expect(result.status).toBe('generated')
        expect(result.completedColumns.table).toHaveLength(300)
        const summaryCalls = f.invoke.mock.calls.filter((call) => call[1].runName === 'knowledge-table-summary')
        expect(summaryCalls.length).toBeGreaterThan(2)
        expect(JSON.stringify(summaryCalls)).toContain('Sensor 299')
        expect(summaryCalls.at(-1)[0][1].content).toContain('"summaries"')
        expect(result.tables[0].summary).toBe('Equipment measurements')
    })

    it('does not silently apply changed library defaults to historical document settings', () => {
        const f = fixture()
        f.document.parserConfig.indexedFields = undefined
        f.document.parserConfig.tableMetadataRequirements = undefined
        const before = tableMetadataInputHash(f.document, f.knowledgebase)
        f.knowledgebase.parserConfig.spreadsheet = { firstRowAsHeader: false }
        f.knowledgebase.parserConfig.tableMetadataRequirements = 'New library defaults'
        expect(tableMetadataInputHash(f.document, f.knowledgebase)).toBe(before)
        f.document.parserConfig.tableMetadataRequirements = 'Explicitly applied defaults'
        expect(tableMetadataInputHash(f.document, f.knowledgebase)).not.toBe(before)
    })

    it('corrects invalid semantic output once before publishing', async () => {
        const f = fixture()
        f.invoke.mockResolvedValueOnce({
            content: JSON.stringify({ summary: '', columns: [{ columnId: 'A', description: 'Amount', unit: 'USD' }] })
        })
        const result = await f.service.prepare(f.document, f.knowledgebase, [f.source])
        expect(result.status).toBe('generated')
        expect(f.invoke).toHaveBeenCalledTimes(2)
        expect(result.tables[0].columns[0].unit).toBeUndefined()
    })

    it('shows complete structure after a wide-table failure and resumes only unfinished column batches', async () => {
        const f = fixture()
        f.document.parserConfig.indexedFields = undefined
        f.source.columns = Array.from({ length: 30 }, (_, index) => ({
            columnId: String(index),
            key: `field${index}`,
            label: `Field ${index}`,
            column: index + 1
        }))
        f.source.samples = []
        const response = (columns: KnowledgeTableSource['columns']) => ({
            content: JSON.stringify({
                summary: 'Business records',
                columns: columns.map((column) => ({ columnId: column.columnId, description: '' }))
            })
        })
        f.invoke
            .mockResolvedValueOnce(response(f.source.columns.slice(0, 24)))
            .mockRejectedValueOnce(new Error('second batch unavailable'))
            .mockResolvedValueOnce(response(f.source.columns.slice(24)))
            .mockResolvedValueOnce({ content: JSON.stringify({ summary: 'Complete table purpose', columns: [] }) })
        const failed = await f.service.prepare(f.document, f.knowledgebase, [f.source])
        expect(failed.status).toBe('failed')
        expect(failed.tables[0].columns).toHaveLength(30)
        expect(failed.completedColumns.table).toHaveLength(24)
        const completed = await f.service.prepare(f.document, f.knowledgebase, [f.source])
        expect(completed.status).toBe('generated')
        expect(completed.tables[0].summary).toBe('Complete table purpose')
        expect(f.invoke).toHaveBeenCalledTimes(4)
    })
    it('reuses historical input by full parsed fingerprint and invalidates changed rows', async () => {
        const f = fixture()
        f.document.sourceHash = null
        await f.service.prepare(f.document, f.knowledgebase, [f.source], 'all-rows-v1')
        await f.service.prepare(f.document, f.knowledgebase, [f.source], 'all-rows-v1')
        expect(f.invoke).toHaveBeenCalledTimes(1)
        await f.service.prepare(f.document, f.knowledgebase, [f.source], 'all-rows-v2')
        expect(f.invoke).toHaveBeenCalledTimes(2)
    })

    it('generates with empty guidance, hides excluded samples and reuses the paid result before indexing', async () => {
        const f = fixture()
        const state = await f.service.prepare(structuredClone(f.document), f.knowledgebase, [f.source])
        expect(state).toMatchObject({ status: 'generated', tables: [{ summary: 'Sales orders' }] })
        expect(JSON.stringify(f.invoke.mock.calls)).not.toContain('private forecast')
        expect(JSON.stringify(f.invoke.mock.calls)).not.toContain('Amounts use CNY.')
        expect(f.document.metadata.owner).toBe('alice')
        expect(f.service.canSkip(f.document, f.knowledgebase)).toBe(false)
        await f.service.prepare(structuredClone(f.document), f.knowledgebase, [f.source])
        expect(f.invoke).toHaveBeenCalledTimes(1)
        expect(await f.service.markApplied(f.document, state)).toBe(true)
        expect(f.service.canSkip(f.document, f.knowledgebase)).toBe(true)
    })

    it('skips missing models and empty tables without invoking the model', async () => {
        const f = fixture()
        f.knowledgebase.chatModel = null
        const missing = await f.service.prepare(f.document, f.knowledgebase, [f.source])
        expect(missing).toMatchObject({
            status: 'skipped',
            reason: 'missing_model',
            tables: [{ range: 'A1:B2', columns: [{ description: '' }, { description: '' }] }]
        })
        expect(f.runtime.createModelClient).not.toHaveBeenCalled()
        f.knowledgebase.chatModel = { copilotId: 'copilot', model: 'llm' }
        const empty = await f.service.prepare(f.document, f.knowledgebase, [{ ...f.source, rowCount: 0 }])
        expect(empty).toMatchObject({ status: 'skipped', reason: 'no_data', tables: [{ rowCount: 0 }] })
        expect(f.invoke).not.toHaveBeenCalled()
    })

    it('keeps model failures optional and retries them during full reprocessing', async () => {
        const f = fixture()
        f.invoke.mockRejectedValueOnce(new Error('model timeout'))
        const failed = await f.service.prepare(f.document, f.knowledgebase, [f.source])
        expect(failed).toMatchObject({ status: 'failed', error: 'model timeout' })
        expect(f.service.canSkip(f.document, f.knowledgebase)).toBe(false)
        const success = await f.service.prepare(f.document, f.knowledgebase, [f.source])
        expect(success.status).toBe('generated')
        expect(f.invoke).toHaveBeenCalledTimes(2)
    })

    it('does not publish a late model response after the document source changes', async () => {
        const f = fixture()
        const snapshot = structuredClone(f.document)
        f.invoke.mockImplementationOnce(async () => {
            f.document.sourceHash = 'replaced source'
            f.document.version++
            return { content: '{"summary":"Old","columns":[{"columnId":"A","description":"Amount"}]}' }
        })
        await expect(f.service.prepare(snapshot, f.knowledgebase, [f.source])).rejects.toBeInstanceOf(
            TableMetadataStaleError
        )
        expect(f.document.metadata.tableMetadata?.tables).toEqual([])
        expect(f.document.metadata.owner).toBe('alice')
    })

    it('fences A-to-B-to-A publication epochs even when the source hash repeats', async () => {
        const f = fixture()
        const snapshot = structuredClone(f.document)
        f.invoke.mockImplementationOnce(async () => {
            f.document.publicationEpoch += 2
            return { content: '{"summary":"Old","columns":[{"columnId":"A","description":"Amount"}]}' }
        })
        await expect(f.service.prepare(snapshot, f.knowledgebase, [f.source])).rejects.toBeInstanceOf(
            TableMetadataStaleError
        )
    })

    it('regenerates for changed model configuration and refuses to reuse a ready index stamp', async () => {
        const f = fixture()
        const state = await f.service.prepare(f.document, f.knowledgebase, [f.source])
        await f.service.markApplied(f.document, state)
        f.knowledgebase.chatModel.model = 'replacement-model'
        expect(f.service.canSkip(f.document, f.knowledgebase)).toBe(false)
        const regenerated = await f.service.prepare(f.document, f.knowledgebase, [f.source])
        expect(regenerated.generationId).not.toBe(state.generationId)
        expect(f.invoke).toHaveBeenCalledTimes(2)
    })

    it('does not overwrite a competing generation between the read and atomic JSONB update', async () => {
        const f = fixture()
        f.builder.execute.mockResolvedValueOnce({ affected: 0 })
        await expect(f.service.prepare(f.document, f.knowledgebase, [f.source])).rejects.toBeInstanceOf(
            TableMetadataStaleError
        )
        expect(f.invoke).not.toHaveBeenCalled()
        expect(f.document.metadata).toEqual({ owner: 'alice' })
    })

    it('does not reuse results for a source without a durable byte hash', async () => {
        const f = fixture()
        f.document.sourceHash = null
        const state = await f.service.prepare(f.document, f.knowledgebase, [f.source])
        await f.service.markApplied(f.document, state)
        expect(f.service.canSkip(f.document, f.knowledgebase)).toBe(false)
        await f.service.prepare(f.document, f.knowledgebase, [f.source])
        expect(f.invoke).toHaveBeenCalledTimes(2)
    })

    it('preserves every parsed column for display while only generating semantics for indexed columns', async () => {
        const f = fixture()
        const state = await f.service.prepare(f.document, f.knowledgebase, [f.source])
        expect(state.tables[0].columns).toEqual([
            { ...f.source.columns[0], description: 'Order amount' },
            { ...f.source.columns[1], description: '' }
        ])
    })

    it('rejects a parsed snapshot from an older document version before claiming a generation', async () => {
        const f = fixture()
        const parsedSnapshot = structuredClone(f.document)
        f.document.version++
        await expect(f.service.prepare(parsedSnapshot, f.knowledgebase, [f.source])).rejects.toBeInstanceOf(
            TableMetadataStaleError
        )
        expect(f.invoke).not.toHaveBeenCalled()
    })

    it('keeps invalid persisted state outside the typed generation boundary', async () => {
        const f = fixture()
        Object.assign(f.document.metadata, { tableMetadata: { schemaVersion: 1, status: 'ready', tables: 'broken' } })
        expect(f.service.canSkip(f.document, f.knowledgebase)).toBe(false)
        expect((await f.service.prepare(f.document, f.knowledgebase, [f.source])).status).toBe('generated')
        expect(f.invoke).toHaveBeenCalledTimes(1)
    })

    it('refuses index publication after another background job claims the document', async () => {
        const f = fixture()
        f.document.jobId = 'job-1'
        const snapshot = structuredClone(f.document)
        const state = await f.service.prepare(snapshot, f.knowledgebase, [f.source])
        f.document.jobId = 'job-2'
        f.document.version++
        await expect(f.service.markApplied(snapshot, state)).rejects.toBeInstanceOf(TableMetadataStaleError)
        expect(f.document.metadata.tableMetadata.status).toBe('generated')
    })
})

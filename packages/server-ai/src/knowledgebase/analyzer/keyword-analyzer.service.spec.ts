import { DiscoveryService, ModulesContainer, Reflector } from '@nestjs/core'
import { DataSource } from 'typeorm'
import { KnowledgebaseTypeEnum } from '@xpert-ai/contracts'
import {
    BUILTIN_GLOBAL_SCOPE,
    IKeywordAnalyzerStrategy,
    KeywordAnalyzerRegistry,
    SYSTEM_GLOBAL_SCOPE
} from '@xpert-ai/plugin-sdk'
import { BasicKeywordAnalyzer } from './basic.strategy'
import { KnowledgeKeywordAnalyzerService } from './keyword-analyzer.service'

describe('knowledge keyword analyzers', () => {
    function customAnalyzer(term: string): IKeywordAnalyzerStrategy {
        return {
            meta: { id: 'custom', label: 'Custom', revision: 'v1', languages: ['zh'] },
            analyze: async () => [term]
        }
    }

    it('keeps the pinned global plugin when the organization installs the same provider', async () => {
        const { registry, service, kb } = setup()
        registry.register('custom', customAnalyzer('global'), {
            kind: 'plugin',
            scopeKey: SYSTEM_GLOBAL_SCOPE,
            pluginName: '@example/analyzer'
        })
        const keywordAnalyzer = service.options('org').find((option) => option.analyzer.provider === 'custom')!.analyzer
        registry.register('custom', customAnalyzer('organization'), {
            kind: 'plugin',
            scopeKey: 'org',
            pluginName: '@example/analyzer'
        })
        expect(await service.query({ ...kb, keywordAnalyzer }, 'text')).toBe("'global'")
        expect(await service.vector({ ...kb, keywordAnalyzer }, 'text')).toBe("'global':1")
        expect(service.options('org').find((option) => option.analyzer.provider === 'custom')?.analyzer.source).toEqual(
            { kind: 'plugin', scopeKey: 'org', pluginName: '@example/analyzer' }
        )
    })

    it('keeps an existing built-in binding when a plugin shadows its provider', async () => {
        const { registry, service, kb } = setup()
        registry.register('basic', customAnalyzer('plugin'), {
            kind: 'plugin',
            scopeKey: 'org',
            pluginName: '@example/analyzer'
        })
        expect(await service.query(kb, 'text')).toBe("'text'")
    })

    it('rejects an inaccessible source and does not substitute another plugin or fallback', async () => {
        const { registry, service, kb } = setup()
        const source = { kind: 'plugin', scopeKey: 'another-org', pluginName: '@example/analyzer' } as const
        registry.register('custom', customAnalyzer('secret'), source)
        const keywordAnalyzer = { provider: 'custom', revision: 'v1', source }
        expect(() => service.forCreate(keywordAnalyzer, 'org')).toThrow('available')
        registry.register('custom', customAnalyzer('different'), {
            kind: 'plugin',
            scopeKey: 'org',
            pluginName: '@example/different'
        })
        await expect(
            service.query(
                { ...kb, keywordAnalyzer: { ...keywordAnalyzer, source: { ...source, scopeKey: 'org' } } },
                'text'
            )
        ).rejects.toThrow('available')
    })

    function setup() {
        const registry = new KeywordAnalyzerRegistry(new DiscoveryService(new ModulesContainer()), new Reflector())
        const basic = new BasicKeywordAnalyzer()
        registry.register('basic', basic, { kind: 'builtin', scopeKey: BUILTIN_GLOBAL_SCOPE })
        const dataSource = new DataSource({ type: 'postgres' })
        const query = jest.spyOn(dataSource, 'query').mockResolvedValue([])
        const service = new KnowledgeKeywordAnalyzerService(registry, dataSource)
        const kb = {
            id: 'kb',
            tenantId: 'tenant',
            organizationId: 'org',
            type: KnowledgebaseTypeEnum.Standard,
            keywordAnalyzer: service.forCreate(undefined)
        }
        return { registry, service, kb, query, basic }
    }

    it('defaults new knowledgebases to the pinned built-in Basic (Unicode) implementation', () => {
        const { service, kb } = setup()
        expect(kb.keywordAnalyzer).toEqual(expect.objectContaining({ provider: 'basic', source: { kind: 'builtin' } }))
        expect(service.options()).toEqual([
            expect.objectContaining({ label: 'Basic (Unicode)', analyzer: kb.keywordAnalyzer })
        ])
    })

    it('uses basic Unicode token boundaries on both sides and normalizes mixed text', async () => {
        const { service, kb, basic } = setup()
        expect(await basic.analyze('人工智能技术')).toEqual(['人工智能技术'])
        expect(await service.vector(kb, '如何 申请 退款')).toContain("'退款':3")
        expect(await service.query(kb, '退款')).toBe("'退款'")
        expect(await service.query(kb, 'ＡＩ 退款')).toBe("'ai' & '退款'")
    })

    it('lists scoped plugin analyzers and pins their source, without exposing another organization', () => {
        const { registry, service } = setup()
        registry.register(
            'custom',
            {
                meta: { id: 'custom', label: 'Custom', revision: 'dict-v1', languages: ['zh'] },
                analyze: async () => ['词']
            },
            { kind: 'plugin', scopeKey: 'org', pluginName: '@example/analyzer' }
        )
        const option = service.options('org').find((item) => item.analyzer.provider === 'custom')
        expect(option?.analyzer.source).toEqual({ kind: 'plugin', scopeKey: 'org', pluginName: '@example/analyzer' })
        expect(service.options('another-org')).toHaveLength(1)
    })

    it('rejects a changed analysis revision instead of querying an incompatible index', async () => {
        const { service, kb } = setup()
        await expect(
            service.query({ ...kb, keywordAnalyzer: { ...kb.keywordAnalyzer, revision: 'old' } }, '退款')
        ).rejects.toThrow('version')
    })

    it('rejects malformed API configuration and missing providers', () => {
        const { service, kb } = setup()
        expect(() => service.forCreate({ provider: 'basic' })).toThrow('Invalid')
        expect(() => service.forCreate({ ...kb.keywordAnalyzer, provider: 'missing' })).toThrow('available')
    })

    it('does not change an unchanged legacy or pinned configuration', async () => {
        const { service, kb, query } = setup()
        await service.change(kb, kb.keywordAnalyzer)
        await service.change({ ...kb, keywordAnalyzer: null }, null)
        expect(query).not.toHaveBeenCalled()
    })

    it('uses a conditional write and rejects a locked or nonempty knowledgebase', async () => {
        const { service, kb, query } = setup()
        await expect(service.change({ ...kb, keywordAnalyzer: null }, kb.keywordAnalyzer)).rejects.toThrow(
            'cannot be changed'
        )
        expect(query).toHaveBeenCalledWith(
            expect.stringContaining('"keywordAnalyzerLocked" = false'),
            expect.any(Array)
        )
        query.mockResolvedValueOnce([{ id: kb.id }])
        await expect(service.change({ ...kb, keywordAnalyzer: null }, kb.keywordAnalyzer)).resolves.toEqual(
            kb.keywordAnalyzer
        )
    })
})

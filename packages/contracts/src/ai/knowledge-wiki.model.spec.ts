import {
  DEFAULT_KNOWLEDGEBASE_WIKI_CONFIG,
  isKnowledgeWikiChunkMetadata,
  isKnowledgeWikiPageContributionPayload,
  normalizeKnowledgebaseWikiConfig
} from './knowledge-wiki.model'

describe('knowledge Wiki contracts', () => {
  it('keeps historical knowledgebases disabled by default', () => {
    expect(normalizeKnowledgebaseWikiConfig()).toEqual(DEFAULT_KNOWLEDGEBASE_WIKI_CONFIG)
  })

  it('preserves an explicitly enabled extraction granularity', () => {
    expect(
      normalizeKnowledgebaseWikiConfig({
        enabled: true,
        extractionGranularity: 'exhaustive',
        contentGenerationRequirements: 'Prefer timelines and risk notices.',
        extractionFocus: 'Products, versions, organizations and owners.'
      })
    ).toEqual({
      enabled: true,
      extractionGranularity: 'exhaustive',
      contentGenerationRequirements: 'Prefer timelines and risk notices.',
      extractionFocus: 'Products, versions, organizations and owners.'
    })
  })

  it('uses empty optional Wiki instructions by default', () => {
    expect(DEFAULT_KNOWLEDGEBASE_WIKI_CONFIG).toMatchObject({
      contentGenerationRequirements: '',
      extractionFocus: ''
    })
  })

  it('recognizes Wiki chunks only through the typed discriminator and identity fields', () => {
    expect(
      isKnowledgeWikiChunkMetadata({
        chunkId: 'section-1',
        contentKind: 'wiki',
        wikiPageId: 'page-1',
        wikiPageVersionId: 'version-1',
        wikiPageKey: 'entity:customer',
        wikiPageType: 'entity',
        wikiRevision: 1,
        sectionAnchor: 'overview',
        projectionStatus: 'ready'
      })
    ).toBe(true)

    expect(
      isKnowledgeWikiChunkMetadata({
        chunkId: 'section-1',
        contentKind: 'wiki',
        wikiPageId: 'page-1',
        wikiPageType: 'entity'
      })
    ).toBe(false)

    expect(
      isKnowledgeWikiChunkMetadata({
        chunkId: 'section-1',
        contentKind: 'faq',
        wikiPageId: 'page-1',
        wikiPageVersionId: 'version-1',
        wikiPageKey: 'entity:customer',
        wikiPageType: 'entity',
        wikiRevision: 1,
        sectionAnchor: 'overview',
        projectionStatus: 'ready'
      })
    ).toBe(false)
  })

  it('accepts only bounded, source-linked Map contribution payloads', () => {
    const payload = {
      schemaVersion: 1,
      pageType: 'concept',
      canonicalName: 'Retrieval',
      aliases: ['Search'],
      summary: 'Retrieval combines candidate sources.',
      facts: [{ text: 'Weighted RRF fuses ranked lists.', sourceChunkIds: ['chunk-1'] }],
      suggestedLinks: [{ targetType: 'entity', targetCanonicalName: 'Weighted RRF' }]
    }

    expect(isKnowledgeWikiPageContributionPayload(payload)).toBe(true)
    expect(isKnowledgeWikiPageContributionPayload({ ...payload, pageType: 'index' })).toBe(false)
    expect(
      isKnowledgeWikiPageContributionPayload({
        ...payload,
        facts: [{ text: 'Unsupported fact without evidence.', sourceChunkIds: [] }]
      })
    ).toBe(false)
  })
})

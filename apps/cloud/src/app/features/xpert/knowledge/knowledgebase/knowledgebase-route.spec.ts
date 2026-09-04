import { KnowledgebaseTypeEnum } from '@xpert-ai/contracts'
import { getKnowledgebaseDefaultRoute } from './knowledgebase-route'

describe('knowledgebase default route', () => {
  it('routes FAQ knowledgebases directly to the FAQ manager', () => {
    expect(getKnowledgebaseDefaultRoute({ id: 'kb-faq', type: KnowledgebaseTypeEnum.FAQ })).toEqual([
      '/xpert/knowledges',
      'kb-faq',
      'faq'
    ])
  })

  it('keeps standard knowledgebases on documents and external knowledgebases on their existing root', () => {
    expect(getKnowledgebaseDefaultRoute({ id: 'kb-standard', type: KnowledgebaseTypeEnum.Standard })).toEqual([
      '/xpert/knowledges',
      'kb-standard',
      'documents'
    ])
    expect(getKnowledgebaseDefaultRoute({ id: 'kb-external', type: KnowledgebaseTypeEnum.External })).toEqual([
      '/xpert/knowledges',
      'kb-external'
    ])
  })

  it('treats legacy knowledgebases without a type as document knowledgebases', () => {
    expect(getKnowledgebaseDefaultRoute({ id: 'kb-legacy-null', type: null })).toEqual([
      '/xpert/knowledges',
      'kb-legacy-null',
      'documents'
    ])
    expect(getKnowledgebaseDefaultRoute({ id: 'kb-legacy-undefined', type: undefined })).toEqual([
      '/xpert/knowledges',
      'kb-legacy-undefined',
      'documents'
    ])
  })
})

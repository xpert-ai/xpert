import { ASSISTANT_CITATION_OPEN_EVENT, KNOWLEDGEBASE_OPEN_CITATION_EFFECT } from '@xpert-ai/contracts'
import {
  createKnowledgebaseCitationOpenHostEvent,
  getKnowledgebaseCitationTargetFromEffectEvent
} from './knowledgebase-citation-effect'

describe('knowledgebase citation effect helpers', () => {
  it('normalizes a ChatKit citation effect into a workbench host event', () => {
    const event = createKnowledgebaseCitationOpenHostEvent(
      {
        name: KNOWLEDGEBASE_OPEN_CITATION_EFFECT,
        data: {
          knowledgebaseId: 'kb-1',
          documentId: 'doc-1',
          chunkId: 'chunk-1',
          documentName: 'handbook.pdf',
          citationUrl: 'xpert://knowledgebase/chunk?knowledgebaseId=kb-1&documentId=doc-1&chunkId=chunk-1'
        }
      },
      {
        hostType: 'agent',
        hostId: 'assistant-1',
        threadId: 'thread-1'
      }
    )

    expect(event).toEqual(
      expect.objectContaining({
        type: ASSISTANT_CITATION_OPEN_EVENT,
        source: 'chatkit',
        hostType: 'agent',
        hostId: 'assistant-1',
        threadId: 'thread-1',
        data: {
          knowledgebaseId: 'kb-1',
          documentId: 'doc-1',
          chunkId: 'chunk-1',
          documentName: 'handbook.pdf',
          citationUrl: 'xpert://knowledgebase/chunk?knowledgebaseId=kb-1&documentId=doc-1&chunkId=chunk-1'
        }
      })
    )
  })

  it('rejects unsupported or incomplete effects', () => {
    expect(getKnowledgebaseCitationTargetFromEffectEvent({ name: 'refresh_studio', data: {} })).toBeNull()
    expect(
      getKnowledgebaseCitationTargetFromEffectEvent({
        name: KNOWLEDGEBASE_OPEN_CITATION_EFFECT,
        data: {
          knowledgebaseId: 'kb-1'
        }
      })
    ).toBeNull()
  })
})

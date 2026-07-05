import { DocumentInterface } from '@langchain/core/documents'
import { buildChunkTree, IDocChunkMetadata } from './knowledge-doc-chunk.model'

describe('buildChunkTree', () => {
  function makeDoc(
    chunkId: string,
    parentId?: string,
    extra?: Partial<IDocChunkMetadata>
  ): DocumentInterface<IDocChunkMetadata> {
    return {
      pageContent: `Content ${chunkId}`,
      metadata: {
        chunkId,
        parentId,
        ...extra
      } as IDocChunkMetadata
    }
  }

  it('does not mutate input documents', () => {
    const chunks: DocumentInterface<IDocChunkMetadata>[] = [
      {
        pageContent: 'Parent chunk',
        metadata: { chunkId: '1' }
      },
      {
        pageContent: 'Parent chunk',
        metadata: { chunkId: '2' }
      },
      {
        pageContent: 'Child 1',
        metadata: { chunkId: '1-1', parentId: '1', type: 'child' }
      },
      {
        pageContent: 'Child 2',
        metadata: { chunkId: '1-2', parentId: '1', type: 'child' }
      },
      {
        pageContent: 'Grandchild of 1-2',
        metadata: { chunkId: '1-2-1', parentId: '1-2', type: 'child' }
      }
    ]

    const tree = buildChunkTree(chunks)
    console.log('Tree:', JSON.stringify(tree, null, 2))
  })

  it('falls back to the top-level id when metadata.chunkId is missing', () => {
    const chunks = [
      {
        id: 'root-1',
        pageContent: 'Root chunk',
        metadata: {
          enabled: false
        } as IDocChunkMetadata
      }
    ] as Array<DocumentInterface<IDocChunkMetadata> & { id: string }>

    const tree = buildChunkTree(chunks)

    expect(tree).toHaveLength(1)
    expect(tree[0].metadata.chunkId).toBe('root-1')
    expect(tree[0].pageContent).toBe('Root chunk')
  })

  it('sorts roots and children by chunkIndex without mutating input documents', () => {
    const chunks = [
      makeDoc('root-2', undefined, { chunkIndex: 2 }),
      makeDoc('child-2', 'root-1', { chunkIndex: 2 }),
      makeDoc('root-1', undefined, { chunkIndex: 1 }),
      makeDoc('child-1', 'root-1', { chunkIndex: 1 })
    ]

    const tree = buildChunkTree(chunks)

    expect(tree.map((chunk) => chunk.metadata.chunkId)).toEqual(['root-1', 'root-2'])
    expect(tree[0].metadata.children?.map((chunk) => chunk.metadata.chunkId)).toEqual(['child-1', 'child-2'])
    expect(chunks[2].metadata.children).toBeUndefined()
  })
})

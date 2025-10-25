import { DocumentInterface } from "@langchain/core/documents"
import { buildChunkTree, IDocChunkMetadata } from "./knowledge-doc-chunk.model"

describe("buildChunkTree", () => {
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
        ...extra,
      } as IDocChunkMetadata,
    }
  }

  it("does not mutate input documents", () => {
    const chunks: DocumentInterface<IDocChunkMetadata>[] = [
      {
        pageContent: 'Parent chunk',
        metadata: { chunkId: '1' },
      },
      {
        pageContent: 'Parent chunk',
        metadata: { chunkId: '2' },
      },
      {
        pageContent: 'Child 1',
        metadata: { chunkId: '1-1', parentId: '1', type: 'child' },
      },
      {
        pageContent: 'Child 2',
        metadata: { chunkId: '1-2', parentId: '1', type: 'child' },
      },
      {
        pageContent: 'Grandchild of 1-2',
        metadata: { chunkId: '1-2-1', parentId: '1-2', type: 'child' },
      },
    ]

    const tree = buildChunkTree(chunks)
    console.log('Tree:', JSON.stringify(tree, null, 2))
  })
})
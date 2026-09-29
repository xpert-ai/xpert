import { sortChunksByDocumentOrder } from './document-chunk-order'

it('keeps equal logical chunk indices stable instead of reversing their persisted order', () => {
    const chunks = [0, 1, 2, 3].map((index) => ({
        id: `part-${index}`,
        metadata: { chunkId: 'logical', chunkIndex: 1 }
    }))
    expect(sortChunksByDocumentOrder(chunks)).toEqual(chunks)
})

it('orders embedding splits within their logical chunk before the next chunk', () => {
    const chunks = [
        { id: 'next', metadata: { chunkId: 'logical', chunkIndex: 2, embeddingSplitIndex: 0 } },
        { id: 'last', metadata: { chunkId: 'logical', chunkIndex: 1, embeddingSplitIndex: 3 } },
        { id: 'header', metadata: { chunkId: 'logical', chunkIndex: 1, embeddingSplitIndex: 0 } },
        { id: 'middle', metadata: { chunkId: 'logical', chunkIndex: 1, embeddingSplitIndex: 2 } },
        { id: 'first', metadata: { chunkId: 'logical', chunkIndex: 1, embeddingSplitIndex: 1 } }
    ]
    expect(sortChunksByDocumentOrder(chunks).map((chunk) => chunk.id)).toEqual([
        'header',
        'first',
        'middle',
        'last',
        'next'
    ])
    expect(chunks[0].id).toBe('next')
})

it('keeps legacy and invalid indices stable after indexed chunks', () => {
    const chunks = [
        { id: 'legacy', metadata: { chunkId: 'logical' } },
        { id: 'invalid', metadata: { chunkId: 'logical', chunkIndex: Number.NaN } },
        { id: 'second', metadata: { chunkId: 'logical', chunkIndex: 2 } },
        { id: 'first', metadata: { chunkId: 'logical', chunkIndex: 1 } }
    ]
    expect(sortChunksByDocumentOrder(chunks).map((chunk) => chunk.id)).toEqual(['first', 'second', 'legacy', 'invalid'])
})

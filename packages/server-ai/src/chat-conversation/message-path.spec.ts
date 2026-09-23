import { messageAncestorPath } from './message-path'

describe('messageAncestorPath', () => {
    const messages = [
        { id: 'a2', parentId: 'h2' },
        { id: 'a1', parentId: 'h1' },
        { id: 'sibling', parentId: 'h1' },
        { id: 'h2', parentId: 'a1' },
        { id: 'h1', parentId: null }
    ]
    it('selects only the root-to-selected prefix independent of row order or timestamps', () => {
        expect(messageAncestorPath(messages, 'a2', 'a1').map((message) => message.id)).toEqual(['h1', 'a1'])
    })
    it('rejects sibling branches and incomplete ancestry', () => {
        expect(() => messageAncestorPath(messages, 'a2', 'sibling')).toThrow()
        expect(() => messageAncestorPath(messages.slice(0, -1), 'a2')).toThrow()
    })
    it('rejects cycles instead of looping', () => {
        expect(() => messageAncestorPath([{ id: 'a', parentId: 'a' }], 'a')).toThrow()
    })
})

import { avatarForChat } from './avatar'

describe('chat avatar serialization', () => {
    it('resolves stored Emoji Mart IDs without changing the stored avatar', () => {
        const avatar = { emoji: { id: 'memo' }, background: 'var(--avatar-background)' }
        expect(avatarForChat(avatar)).toEqual({ ...avatar, emoji: { id: 'memo', unified: '1f4dd' } })
        expect(avatar.emoji).toEqual({ id: 'memo' })
    })

    it('preserves image avatars and explicit Unicode variants', () => {
        const url = { url: '/avatars/expert.png' }
        const emoji = { emoji: { id: 'wave', unified: '1F44B-1F3FB' } }
        expect(avatarForChat(url)).toBe(url)
        expect(avatarForChat(emoji)).toBe(emoji)
        expect(avatarForChat()).toBeUndefined()
        expect(avatarForChat({ emoji: { id: 'custom-unknown' } })).toEqual({ emoji: { id: 'custom-unknown' } })
    })
})

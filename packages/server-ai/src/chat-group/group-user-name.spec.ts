import { groupUserName } from './group-user-name'

describe('group user display names', () => {
    it.each([
        [{ name: ' Alice Smith ', username: 'alice', email: 'alice@example.com' }, 'Alice Smith'],
        [{ firstName: ' Alice ', lastName: ' Smith ' }, 'Alice Smith'],
        [{ lastName: 'Smith' }, 'Smith'],
        [{ name: ' ', firstName: ' ', username: ' alice ', email: 'alice@example.com' }, 'alice'],
        [{ firstName: null, lastName: null, username: null, email: ' alice@example.com ' }, 'alice@example.com'],
        [{ email: ' ', username: ' ' }, 'user-id']
    ])('resolves the first nonblank profile label for %j', (profile, expected) => {
        expect(groupUserName({ id: 'user-id', ...profile })).toBe(expected)
    })

    it('preserves a saved member label when the current profile has no usable label', () => {
        expect(groupUserName({ id: 'user-id' }, 'Saved name')).toBe('Saved name')
    })
})

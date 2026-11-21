import { organizationMembershipStorageBytes, normalizeIncludedStorageBytes } from './membership-storage'

describe('organization storage grants', () => {
    const scope = { tenantId: 'tenant', organizationId: 'org' }
    const now = new Date('2030-07-15T00:00:00Z')
    it('reads only current enabled organization grants without joining the member roster', async () => {
        const manager = { query: jest.fn().mockResolvedValue([{ bytes: '40' }]) }
        await expect(organizationMembershipStorageBytes(manager as never, scope, now)).resolves.toBe(40)
        expect(manager.query).toHaveBeenCalledWith(expect.stringContaining('max(bytes)'), ['tenant', 'org', now])
        const sql = manager.query.mock.calls[0][0]
        expect(sql).toContain('"tenantId"=$1 AND "organizationId"=$2')
        expect(sql).toContain('enabled AND NOT paused')
        expect(sql).toContain('"startsAt" <= $3 AND "endsAt" > $3')
        expect(sql).not.toContain('userId')
    })
    it('retains base capacity when no current grant exists', async () => {
        const manager = { query: jest.fn().mockResolvedValue([{ bytes: null }]) }
        await expect(organizationMembershipStorageBytes(manager as never, scope, now)).resolves.toBeNull()
    })
    it('requires explicit organization identity', async () => {
        const manager = { query: jest.fn() }
        await expect(
            organizationMembershipStorageBytes(manager as never, { ...scope, organizationId: '' }, now)
        ).rejects.toThrow()
        expect(manager.query).not.toHaveBeenCalled()
    })
    it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects invalid capacity %s', (value) => {
        expect(() => normalizeIncludedStorageBytes(value)).toThrow()
    })
})

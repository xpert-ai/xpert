import { IsNull, type DataSource } from 'typeorm'
import { PasswordResetApplyHandler } from './password-reset.apply.handler'
import { PasswordResetApplyCommand } from '../password-reset.apply.command'
import { tokenDigest } from '../../reset-token'

jest.mock('../../../user/user.entity', () => ({ User: class User {} }))
jest.mock('../../password-reset.entity', () => ({ PasswordReset: class PasswordReset {} }))

function fixture(deleted = 1, updated = 1) {
	const ticket = {
		id: 'ticket',
		userId: 'user',
		tenantId: 'tenant',
		email: 'first@example.invalid',
		token: tokenDigest('fixture')
	}
	const manager = {
		delete: jest.fn().mockResolvedValue({ affected: deleted }),
		update: jest.fn().mockResolvedValue({ affected: updated })
	}
	const database = { transaction: jest.fn((work) => work(manager)) }
	return { ticket, manager, handler: new PasswordResetApplyHandler(database as unknown as DataSource) }
}

it('checks the full binding both when consuming the ticket and when changing the account', async () => {
	const { ticket, manager, handler } = fixture()
	await expect(handler.execute(new PasswordResetApplyCommand(ticket, 'new-hash'))).resolves.toBe(true)
	expect(manager.delete).toHaveBeenCalledWith(expect.anything(), { ...ticket, createdAt: expect.anything() })
	expect(manager.update).toHaveBeenCalledWith(
		expect.anything(),
		{
			id: ticket.userId,
			tenantId: ticket.tenantId,
			email: ticket.email,
			deletedAt: IsNull()
		},
		{ hash: 'new-hash', emailVerified: true }
	)
})

it.each([
	[0, 1],
	[1, 0],
	[1, 2]
])('requires exactly one consumed row (%i) and one updated account (%i)', async (deleted, updated) => {
	const { ticket, manager, handler } = fixture(deleted, updated)
	await expect(handler.execute(new PasswordResetApplyCommand(ticket, 'hash'))).rejects.toMatchObject({ status: 400 })
	if (!deleted) expect(manager.update).not.toHaveBeenCalled()
})

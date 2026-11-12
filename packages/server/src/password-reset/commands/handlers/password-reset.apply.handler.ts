import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { DataSource, IsNull, MoreThan } from 'typeorm'
import { User } from '../../../user/user.entity'
import { PasswordReset } from '../../password-reset.entity'
import { invalidResetLink, resetTokenLifetimeMs } from '../../reset-token'
import { PasswordResetApplyCommand } from '../password-reset.apply.command'

@CommandHandler(PasswordResetApplyCommand)
export class PasswordResetApplyHandler implements ICommandHandler<PasswordResetApplyCommand, boolean> {
	constructor(private readonly dataSource: DataSource) {}

	async execute({ ticket, hash }: PasswordResetApplyCommand): Promise<boolean> {
		if (!ticket.id || !ticket.userId || !ticket.email || !ticket.token) throw invalidResetLink()
		const account = { id: ticket.userId, tenantId: ticket.tenantId ?? IsNull(), email: ticket.email }

		return this.dataSource.transaction(async (manager) => {
			// Recheck expiry after hashing. Concurrent requests contend on the same DELETE.
			const consumed = await manager.delete(PasswordReset, {
				id: ticket.id,
				token: ticket.token,
				userId: ticket.userId,
				tenantId: account.tenantId,
				email: ticket.email,
				createdAt: MoreThan(new Date(Date.now() - resetTokenLifetimeMs))
			})
			if (consumed.affected !== 1) throw invalidResetLink()
			const updated = await manager.update(
				User,
				{ ...account, deletedAt: IsNull() },
				{ hash, emailVerified: true }
			)
			if (updated.affected !== 1) throw invalidResetLink()
			return true
		})
	}
}

import type { ICommand } from '@nestjs/cqrs'
import type { PasswordReset } from '../password-reset.entity'

/** Consume the previously looked-up ticket and change only its bound account, in one transaction. */
export class PasswordResetApplyCommand implements ICommand {
	constructor(
		public readonly ticket: Pick<PasswordReset, 'id' | 'userId' | 'tenantId' | 'email' | 'token'>,
		public readonly hash: string
	) {}
}

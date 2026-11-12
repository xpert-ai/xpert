import type { ICommand } from '@nestjs/cqrs'
import type { IPasswordResetFindInput } from '@xpert-ai/contracts'
import { invalidResetLink, isResetToken, tokenDigest } from '../reset-token'

export class PasswordResetGetCommand implements ICommand {
	static readonly type = '[Password Reset] Get'
	readonly digest: string

	constructor({ token }: IPasswordResetFindInput) {
		if (!isResetToken(token)) throw invalidResetLink()
		this.digest = tokenDigest(token)
	}
}

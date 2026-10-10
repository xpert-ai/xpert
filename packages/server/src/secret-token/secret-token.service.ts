import { createHash } from 'node:crypto'
import type { ISecretToken } from '@xpert-ai/contracts'
import { Injectable, UnauthorizedException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { CrudService } from './../core/crud'
import { SecretToken } from './secret-token.entity'

@Injectable()
export class SecretTokenService extends CrudService<SecretToken> {
	constructor(
		@InjectRepository(SecretToken)
		private readonly stRepository: Repository<SecretToken>
	) {
		super(stRepository)
	}
	/** Persist a one-way representation; only the issuing endpoint returns the raw secret. */
	createHashed(input: Partial<ISecretToken> & { token: string }) {
		return this.create({ ...input, token: this.digest(input.token) })
	}

	/** Read both new hashed grants and already-issued plaintext grants during their existing lifetime. */
	findBySecret(secret: string) {
		// A database digest must never itself become a usable bearer credential.
		if (!secret || secret.startsWith('sha256:')) throw new UnauthorizedException()
		return this.findOneByOptions({
			where: [{ token: this.digest(secret) }, { token: secret }],
			order: { createdAt: 'DESC' }
		})
	}

	private digest(secret: string) {
		return `sha256:${createHash('sha256').update(secret).digest('hex')}`
	}
}

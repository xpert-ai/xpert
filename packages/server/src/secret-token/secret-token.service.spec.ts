import { UnauthorizedException } from '@nestjs/common'
import { SecretTokenBindingType } from '@xpert-ai/contracts'
import { createHash } from 'node:crypto'
import { SecretTokenService } from './secret-token.service'

describe('shared ChatKit credential storage', () => {
	it('stores only a digest and resolves either hashed or already-issued plaintext secrets', async () => {
		const service = new SecretTokenService({} as never)
		const create = jest.spyOn(service, 'create').mockResolvedValue({} as never)
		const find = jest.spyOn(service, 'findOneByOptions').mockResolvedValue({} as never)
		const secret = 'cs-x-test-only-secret'
		const digest = `sha256:${createHash('sha256').update(secret).digest('hex')}`
		await service.createHashed({ token: secret, entityId: 'D', type: SecretTokenBindingType.USER_CONVERSATION })
		expect(create).toHaveBeenCalledWith({
			token: digest,
			entityId: 'D',
			type: SecretTokenBindingType.USER_CONVERSATION
		})
		await service.findBySecret(secret)
		expect(find).toHaveBeenCalledWith({
			where: [{ token: digest }, { token: secret }],
			order: { createdAt: 'DESC' }
		})
		expect(() => service.findBySecret(digest)).toThrow(UnauthorizedException)
		expect(find).toHaveBeenCalledTimes(1)
	})
})

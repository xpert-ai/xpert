import { ApiKeyBindingType } from '@xpert-ai/contracts'
import { hashPersonalApiKey } from '../../personal-api-key/personal-api-key-token'
import { IsNull, Not, Or } from 'typeorm'
import { UnauthorizedException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { ApiKey } from '../../api-key.entity'
import { ApiKeyService } from '../../api-key.service'
import { UseApiKeyQuery } from '../api-key.use.query'
import { UseApiKeyHandler } from './api-key.use.handler'

describe('UseApiKeyHandler', () => {
	const repository = {
		findOne: jest.fn()
	}
	const apiKeyService = {
		recordUse: jest.fn(),
		resolvePersonalUser: jest.fn()
	}

	async function createHandler() {
		const moduleRef = await Test.createTestingModule({
			providers: [
				UseApiKeyHandler,
				{ provide: getRepositoryToken(ApiKey), useValue: repository },
				{ provide: ApiKeyService, useValue: apiKeyService }
			]
		}).compile()

		return moduleRef.get(UseApiKeyHandler)
	}

	beforeEach(() => {
		jest.clearAllMocks()
	})

	it('rejects an unknown token without dereferencing a missing API key', async () => {
		repository.findOne.mockResolvedValue(null)
		const handler = await createHandler()

		await expect(handler.execute(new UseApiKeyQuery('unknown-token'))).rejects.toBeInstanceOf(UnauthorizedException)
		expect(apiKeyService.recordUse).not.toHaveBeenCalled()
	})

	it('records usage for a valid API key', async () => {
		const apiKey = new ApiKey()
		apiKey.id = 'api-key-1'
		apiKey.token = 'valid-token'
		repository.findOne.mockResolvedValue(apiKey)
		apiKeyService.recordUse.mockResolvedValue(apiKey)
		const handler = await createHandler()

		await expect(handler.execute(new UseApiKeyQuery(apiKey.token))).resolves.toBe(apiKey)
		expect(apiKeyService.recordUse).toHaveBeenCalledWith(apiKey)
	})
	it('looks up personal keys only by digest and the persisted USER binding', async () => {
		const token = `sk-user-${'a'.repeat(43)}`
		const key = Object.assign(new ApiKey(), { type: ApiKeyBindingType.USER })
		repository.findOne.mockResolvedValue(key)
		const handler = await createHandler()
		await handler.execute(new UseApiKeyQuery(token))
		expect(repository.findOne).toHaveBeenCalledWith(
			expect.objectContaining({
				where: { token: hashPersonalApiKey(token), type: ApiKeyBindingType.USER, revokedAt: IsNull() }
			})
		)
		expect(apiKeyService.resolvePersonalUser).toHaveBeenCalledWith(key)
	})

	it('excludes personal rows from plaintext lookup, preventing pass-the-hash authentication', async () => {
		const token = hashPersonalApiKey(`sk-user-${'a'.repeat(43)}`)
		repository.findOne.mockResolvedValue(null)
		await expect((await createHandler()).execute(new UseApiKeyQuery(token))).rejects.toBeInstanceOf(
			UnauthorizedException
		)
		expect(repository.findOne).toHaveBeenCalledWith(
			expect.objectContaining({
				where: {
					token,
					type: Or(IsNull(), Not(ApiKeyBindingType.USER)),
					revokedAt: IsNull()
				}
			})
		)
	})

	it('rejects malformed personal tokens before looking in any key family', async () => {
		await expect((await createHandler()).execute(new UseApiKeyQuery('sk-user-invalid'))).rejects.toBeInstanceOf(
			UnauthorizedException
		)
		expect(repository.findOne).not.toHaveBeenCalled()
	})
})

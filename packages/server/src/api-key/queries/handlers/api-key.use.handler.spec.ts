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
		update: jest.fn()
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
		expect(apiKeyService.update).not.toHaveBeenCalled()
	})

	it('records usage for a valid API key', async () => {
		const apiKey = new ApiKey()
		apiKey.id = 'api-key-1'
		apiKey.token = 'valid-token'
		repository.findOne.mockResolvedValue(apiKey)
		apiKeyService.update.mockResolvedValue(apiKey)
		const handler = await createHandler()

		await expect(handler.execute(new UseApiKeyQuery(apiKey.token))).resolves.toBe(apiKey)
		expect(apiKeyService.update).toHaveBeenCalledWith(apiKey.id, {
			lastUsedAt: expect.any(Date)
		})
	})
})

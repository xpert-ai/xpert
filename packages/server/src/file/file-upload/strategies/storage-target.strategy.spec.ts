import { HttpException } from '@nestjs/common'
import type { WithStorageBudgetCommand } from '../../../shared/storage-budget.command'
const commands = { execute: jest.fn((command: WithStorageBudgetCommand<unknown>) => command.commit(null)) }
const mockPutFile = jest.fn()
const mockProviderUrl = jest.fn((key: string) => `https://storage.example/${key}`)

jest.mock('../../file-storage', () => ({
	FileStorage: class FileStorage {
		getProvider() {
			return {
				name: 'LOCAL',
				putFile: mockPutFile,
				url: mockProviderUrl
			}
		}
	}
}))

import { StorageTargetStrategy } from './storage-target.strategy'

describe('StorageTargetStrategy', () => {
	const source = {
		name: 'report.txt',
		originalName: 'report.txt',
		mimeType: 'text/plain',
		size: 7,
		buffer: Buffer.from('content'),
		source: {
			kind: 'multipart' as const,
			name: 'report.txt',
			originalName: 'report.txt'
		}
	}
	const context = {
		request: {
			tenantId: 'tenant-A',
			userId: 'user-A'
		}
	}
	const storageFileService = {
		createStorageFile: jest.fn()
	}
	let strategy: StorageTargetStrategy

	beforeEach(() => {
		jest.clearAllMocks()
		commands.execute.mockReset().mockImplementation((command) => command.commit(null))
		mockPutFile.mockImplementation(async (_buffer: Buffer, key: string) => ({ key }))
		storageFileService.createStorageFile.mockResolvedValue({ id: 'storage-1' })
		strategy = new StorageTargetStrategy(storageFileService as never, commands as never)
	})

	it.each(['../tenant-B/key.txt', '/tenant-B/key.txt', String.raw`..\tenant-B\key.txt`])(
		'rejects a path-bearing file name before writing: %s',
		async (fileName) => {
			await expect(strategy.upload(source, { kind: 'storage', fileName }, context)).rejects.toThrow(
				'Invalid file name'
			)

			expect(mockPutFile).not.toHaveBeenCalled()
			expect(storageFileService.createStorageFile).not.toHaveBeenCalled()
		}
	)

	it('writes a plain file name inside the authenticated tenant directory', async () => {
		await strategy.upload(source, { kind: 'storage', directory: 'files', fileName: 'report.txt' }, context)

		expect(mockPutFile).toHaveBeenCalledWith(source.buffer, 'files/tenant-A/report.txt')
		expect(storageFileService.createStorageFile).toHaveBeenCalledWith(
			expect.objectContaining({ key: 'files/tenant-A/report.txt' }),
			'LOCAL'
		)
	})
	it('charges actual buffer bytes with the authenticated owner and final storage key', async () => {
		await strategy.upload(
			{ ...source, size: 999 },
			{ kind: 'storage', directory: 'files', fileName: 'report.txt' },
			context
		)
		expect(commands.execute.mock.calls[0][0].write).toEqual({
			kind: 'object',
			owner: context.request,
			provider: 'LOCAL',
			key: 'files/tenant-A/report.txt',
			bytes: source.buffer.byteLength
		})
		expect(commands.execute.mock.invocationCallOrder[0]).toBeLessThan(mockPutFile.mock.invocationCallOrder[0])
		expect(mockPutFile.mock.invocationCallOrder[0]).toBeLessThan(
			storageFileService.createStorageFile.mock.invocationCallOrder[0]
		)
	})

	it('preserves a quota rejection without writing the object or metadata', async () => {
		const failure = new HttpException({ code: 'application_storage_limit' }, 413)
		commands.execute.mockRejectedValueOnce(failure)
		await expect(strategy.upload(source, { kind: 'storage' }, context)).rejects.toBe(failure)
		expect(mockPutFile).not.toHaveBeenCalled()
		expect(storageFileService.createStorageFile).not.toHaveBeenCalled()
	})

	it('propagates uncertain provider and metadata outcomes to the budget handler', async () => {
		const failure = new Error('provider timeout')
		mockPutFile.mockRejectedValueOnce(failure)
		await expect(strategy.upload(source, { kind: 'storage' }, context)).rejects.toBe(failure)
		expect(storageFileService.createStorageFile).not.toHaveBeenCalled()
		const metadataFailure = new Error('metadata failed')
		storageFileService.createStorageFile.mockRejectedValueOnce(metadataFailure)
		await expect(strategy.upload(source, { kind: 'storage' }, context)).rejects.toBe(metadataFailure)
	})
})

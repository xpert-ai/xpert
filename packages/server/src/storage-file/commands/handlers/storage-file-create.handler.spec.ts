import { HttpException } from '@nestjs/common'
import type { WithStorageBudgetCommand } from '../../../shared/storage-budget.command'
import { StorageFileCreateCommand } from '../storage-file-create.command'
import { StorageFileCreateHandler } from './storage-file-create.handler'

const mockPutFile = jest.fn()
const mockMkdir = jest.fn()
jest.mock('fs/promises', () => ({ mkdir: (...args: unknown[]) => mockMkdir(...args) }))
jest.mock('../../../file', () => ({
	FileStorage: class {
		getProvider() {
			return { name: 'LOCAL', config: { rootPath: '/test-storage' }, putFile: mockPutFile }
		}
	}
}))
jest.mock('../../storage-file.service', () => ({ StorageFileService: class {} }))
jest.mock('@xpert-ai/plugin-sdk', () => ({
	RequestContext: {
		currentTenantId: () => 'tenant',
		getOrganizationId: () => 'org',
		currentUserId: () => 'user'
	}
}))

describe('generated StorageFile budget admission', () => {
	const commands = { execute: jest.fn((command: WithStorageBudgetCommand<unknown>) => command.commit(null)) }
	const files = { create: jest.fn() }
	const handler = new StorageFileCreateHandler(files as never, commands as never)
	const command = new StorageFileCreateCommand({ filePath: 'report.txt', contents: '中文' })
	beforeEach(() => {
		jest.clearAllMocks()
		commands.execute.mockReset().mockImplementation((command) => command.commit(null))
		mockPutFile
			.mockReset()
			.mockImplementation(async (_content, key: string) => ({ key, size: 6, mimetype: 'text/plain' }))
		files.create.mockReset().mockResolvedValue({ id: 'file' })
	})

	it('checks UTF-8 bytes and trusted scope before creating a directory or object', async () => {
		await expect(handler.execute(command)).resolves.toEqual({ id: 'file' })
		const write = commands.execute.mock.calls[0][0].write
		expect(write).toMatchObject({
			kind: 'object',
			owner: { tenantId: 'tenant', organizationId: 'org', userId: 'user' },
			provider: 'LOCAL',
			bytes: 6
		})
		if (write.kind !== 'object') throw new Error('Expected object admission')
		expect(write.key).toMatch(/^files\/tenant\/file-.*\.txt$/)
		expect(mockPutFile).toHaveBeenCalledWith('中文', write.key)
		expect(files.create).toHaveBeenCalledWith(
			expect.objectContaining({ file: write.key, size: 6, storageProvider: 'LOCAL' })
		)
		expect(commands.execute.mock.invocationCallOrder[0]).toBeLessThan(mockMkdir.mock.invocationCallOrder[0])
	})

	it('returns the original 413 without filesystem or metadata side effects', async () => {
		const failure = new HttpException({ code: 'application_storage_limit' }, 413)
		commands.execute.mockRejectedValueOnce(failure)
		await expect(handler.execute(command)).rejects.toBe(failure)
		expect(mockMkdir).not.toHaveBeenCalled()
		expect(mockPutFile).not.toHaveBeenCalled()
		expect(files.create).not.toHaveBeenCalled()
	})

	it('does not persist metadata when the provider fails', async () => {
		mockPutFile.mockRejectedValueOnce(new Error('provider failed'))
		await expect(handler.execute(command)).rejects.toMatchObject({ status: 400 })
		expect(files.create).not.toHaveBeenCalled()
	})
})

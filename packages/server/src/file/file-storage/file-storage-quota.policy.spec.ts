import { Test } from '@nestjs/testing'
import { CommandBus } from '@nestjs/cqrs'
import { FileStorageProviderRegistry, RequestContext } from '@xpert-ai/plugin-sdk'
import type { IFileStorageProvider } from '@xpert-ai/plugin-sdk'
import { FileStorageQuotaPolicy } from './file-storage-quota.policy'
import { FileStorageRegistryBridge } from './file-storage-registry.bridge'
import { CheckStorageQuotaCommand, RequestStorageUsageRefreshCommand } from '../../shared/storage-budget.command'

const owner = { tenantId: 'tenant', organizationId: 'organization', userId: 'user' }
function fixture() {
	const provider = {
		name: 'LOCAL',
		config: { rootPath: '/storage' },
		url: jest.fn(),
		path: jest.fn(),
		getFile: jest.fn(),
		putFile: jest.fn().mockResolvedValue({ key: 'file' }),
		deleteFile: jest.fn().mockResolvedValue(undefined),
		handler: jest.fn(),
		mapUploadedFile: jest.fn()
	} satisfies IFileStorageProvider
	const commands = { execute: jest.fn().mockResolvedValue(null) }
	const policy = new FileStorageQuotaPolicy(commands as never)
	return { provider, commands, policy, wrapped: policy.wrap(provider, owner) }
}
describe('central file storage quota', () => {
	afterEach(() => jest.restoreAllMocks())
	it('admits a provider write before sending its contents', async () => {
		const f = fixture()
		await f.wrapped.putFile(Buffer.from('content'), 'file')
		expect(f.commands.execute.mock.calls[0][0]).toEqual(
			new CheckStorageQuotaCommand({ kind: 'write', scope: owner })
		)
		expect(f.commands.execute.mock.invocationCallOrder[0]).toBeLessThan(
			f.provider.putFile.mock.invocationCallOrder[0]
		)
	})
	it('does not mutate the provider when the account is full', async () => {
		const f = fixture()
		f.commands.execute.mockRejectedValueOnce(new Error('full'))
		await expect(f.wrapped.putFile('content', 'file')).rejects.toThrow('full')
		expect(f.provider.putFile).not.toHaveBeenCalled()
	})
	it('keeps reads independent of admission', async () => {
		const f = fixture()
		await f.wrapped.getFile('file')
		f.wrapped.path('file')
		f.wrapped.url('file')
		expect(f.commands.execute).not.toHaveBeenCalled()
	})
	it('allows deletion and requests background measurement after physical removal', async () => {
		const f = fixture()
		await f.wrapped.deleteFile('file')
		expect(f.commands.execute.mock.calls[0][0]).toEqual(new RequestStorageUsageRefreshCommand(owner))
		expect(f.provider.deleteFile.mock.invocationCallOrder[0]).toBeLessThan(
			f.commands.execute.mock.invocationCallOrder[0]
		)
		f.commands.execute.mockRejectedValueOnce(new Error('statistics unavailable'))
		await expect(f.wrapped.deleteFile('file')).resolves.toBeUndefined()
	})
	it('does not report freed capacity when deletion fails', async () => {
		const f = fixture()
		f.provider.deleteFile.mockRejectedValueOnce(new Error('provider failure'))
		await expect(f.wrapped.deleteFile('file')).rejects.toThrow('provider failure')
		expect(f.commands.execute).not.toHaveBeenCalled()
	})
	it('resolves identity at operation time instead of capturing a previous request', async () => {
		const f = fixture()
		jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant')
		jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('organization')
		const user = jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('first')
		const wrapped = f.policy.wrap(f.provider)
		await wrapped.putFile('first')
		user.mockReturnValue('second')
		await wrapped.putFile('second')
		expect(f.commands.execute.mock.calls.map(([command]) => command.request.scope.userId)).toEqual([
			'first',
			'second'
		])
	})
	it('protects multipart storage before its engine writes and returns admission errors to Multer', async () => {
		const f = fixture(),
			engine = { _handleFile: jest.fn(), _removeFile: jest.fn() }
		f.provider.handler.mockReturnValue(engine)
		const wrapped = f.wrapped.handler({ dest: '' }),
			callback = jest.fn()
		f.commands.execute.mockRejectedValueOnce(new Error('full'))
		wrapped._handleFile({} as never, {} as never, callback)
		await new Promise((resolve) => setImmediate(resolve))
		expect(callback).toHaveBeenCalledWith(expect.objectContaining({ message: 'full' }))
		expect(engine._handleFile).not.toHaveBeenCalled()
	})
	it('wires the existing bridge with explicit dependencies and releases its policy on shutdown', async () => {
		const f = fixture(),
			registry = { get: jest.fn().mockReturnValue(f.provider) }
		const module = await Test.createTestingModule({
			providers: [
				FileStorageQuotaPolicy,
				FileStorageRegistryBridge,
				{ provide: CommandBus, useValue: f.commands },
				{ provide: FileStorageProviderRegistry, useValue: registry }
			]
		}).compile()
		await module.init()
		await FileStorageRegistryBridge.wrap(f.provider, owner).putFile('file')
		expect(f.commands.execute).toHaveBeenCalledTimes(1)
		await module.close()
		expect(FileStorageRegistryBridge.getRegistry()).toBeUndefined()
		expect(FileStorageRegistryBridge.wrap(f.provider, owner)).toBe(f.provider)
	})
})

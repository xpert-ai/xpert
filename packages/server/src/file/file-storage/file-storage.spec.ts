import type { Request } from 'express'
import type { StorageEngine } from 'multer'
import { FileStorage } from './file-storage'
import { FileStorageRegistryBridge } from './file-storage-registry.bridge'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import type { IFileStorageProvider } from '@xpert-ai/plugin-sdk'
import { environment } from '@xpert-ai/server-config'
import { Readable } from 'node:stream'

jest.mock('@xpert-ai/server-config', () => ({ environment: { fileSystem: { name: 'MINIO' } } }))
jest.mock('@xpert-ai/server-common', () => ({
	isEmpty: (v: unknown) => v == null || v === '',
	isNotEmpty: (v: unknown) => v != null && v !== ''
}))
jest.mock('@xpert-ai/contracts', () => ({ FileStorageProviderEnum: { LOCAL: 'LOCAL' } }))
jest.mock('@xpert-ai/plugin-sdk', () => ({ RequestContext: { currentRequest: jest.fn() } }))
jest.mock('./file-storage-registry.bridge', () => ({
	FileStorageRegistryBridge: { getRegistry: jest.fn(), wrap: (v: unknown) => v }
}))
jest.mock('./providers', () => ({
	LocalProvider: class {
		name = 'LOCAL'
	}
}))

const request = () => Object.create(null) as Request
const file = (): Express.Multer.File => ({
	fieldname: 'file',
	originalname: 'test.csv',
	encoding: '7bit',
	mimetype: 'text/csv',
	size: 1,
	stream: Readable.from('a'),
	destination: '',
	filename: '',
	path: '',
	buffer: Buffer.from('a')
})
function provider(name: string) {
	const engine = {
		_handleFile: jest.fn<ReturnType<StorageEngine['_handleFile']>, Parameters<StorageEngine['_handleFile']>>(
			(_r, _f, cb) => cb(null, { path: 'saved.csv' })
		),
		_removeFile: jest.fn<ReturnType<StorageEngine['_removeFile']>, Parameters<StorageEngine['_removeFile']>>(
			(_r, _f, cb) => cb(null)
		)
	}
	const value = {
		name,
		handler: jest.fn(() => engine),
		url: jest.fn(),
		path: jest.fn(),
		getFile: jest.fn(),
		putFile: jest.fn(),
		deleteFile: jest.fn()
	} satisfies IFileStorageProvider
	return { value, engine }
}
describe('deferred Multer storage', () => {
	beforeEach(() => {
		jest.clearAllMocks()
		jest.mocked(FileStorageRegistryBridge.getRegistry).mockReturnValue(undefined)
		jest.mocked(RequestContext.currentRequest).mockReturnValue(undefined)
		environment.fileSystem.name = 'MINIO'
	})
	it('constructs decorators before registration and resolves the provider on upload', () => {
		const storage = new FileStorage().storage({ dest: 'imports' }),
			p = provider('MINIO')
		expect(FileStorageRegistryBridge.getRegistry).not.toHaveBeenCalled()
		const get = jest.fn(() => p.value)
		jest.mocked(FileStorageRegistryBridge.getRegistry).mockReturnValue({ get } as never)
		const req = request(),
			f = file(),
			done = jest.fn()
		storage._handleFile(req, f, done)
		expect(get).toHaveBeenCalledWith('MINIO')
		expect(done).toHaveBeenCalledWith(null, { path: 'saved.csv' })
		expect(p.value.handler).toHaveBeenCalledWith({ dest: 'imports', provider: 'MINIO' })
		// Multer clones upload metadata before cleanup. Cleanup must retain the request's original engine.
		environment.fileSystem.name = 'OTHER'
		storage._removeFile(req, { ...f, path: 'saved.csv' }, done)
		expect(p.engine._removeFile).toHaveBeenCalledTimes(1)
		expect(get).toHaveBeenCalledTimes(1)
	})
	it('resolves each request independently and keeps an explicit provider', () => {
		const storage = new FileStorage().storage(),
			first = provider('ONE'),
			second = provider('TWO')
		const get = jest.fn((name: string) => (name === 'ONE' ? first.value : second.value))
		jest.mocked(FileStorageRegistryBridge.getRegistry).mockReturnValue({ get } as never)
		environment.fileSystem.name = 'ONE'
		storage._handleFile(request(), file(), jest.fn())
		environment.fileSystem.name = 'TWO'
		storage._handleFile(request(), file(), jest.fn())
		new FileStorage({ provider: 'ONE', dest: '' }).storage()._handleFile(request(), file(), jest.fn())
		expect(get.mock.calls.map((c) => c[0])).toEqual(['ONE', 'TWO', 'ONE'])
	})
	it('reports missing runtime providers through the Multer callback without falling back to local', () => {
		const storage = new FileStorage().storage(),
			done = jest.fn()
		expect(() => storage._handleFile(request(), file(), done)).not.toThrow()
		expect(done).toHaveBeenCalledWith(expect.objectContaining({ message: 'Provider "MINIO" is not registered' }))
	})
})

jest.mock('../../core', () => ({
	RequestContext: {
		currentTenantId: () => 'tenant-1',
		getOrganizationId: () => 'organization-1',
		currentUserId: () => 'user-1'
	}
}))
jest.mock('../../storage-file/storage-file.service', () => ({ StorageFileService: class {} }))
const mockPutFile = jest.fn()
const mockGetFile = jest.fn()
jest.mock('../file-storage', () => ({
	FileStorage: class {
		getProvider() {
			return { name: 'LOCAL', putFile: mockPutFile, getFile: mockGetFile, url: (key: string) => key }
		}
	}
}))

import { HttpException } from '@nestjs/common'
import { UploadFileService } from './upload-file.service'
import { StorageTargetStrategy } from './strategies/storage-target.strategy'
import { TUploadFileSource } from './types'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

describe('UploadFileService content classification', () => {
	let directory: string
	beforeEach(async () => {
		jest.clearAllMocks()
		directory = await fs.mkdtemp(path.join(os.tmpdir(), 'xpert-upload-mime-'))
	})
	afterEach(async () => {
		await fs.rm(directory, { recursive: true, force: true })
	})

	it.each(['multipart', 'buffer', 'local_file', 'storage_file'] as const)(
		'corrects persisted MIME for %s without changing bytes or name',
		async (kind) => {
			const bytes = Buffer.from('export const sql = "SELECT 1"')
			const storage = {
				createStorageFile: jest.fn(async (file) => ({ id: 'file-1', ...file })),
				findOne: jest.fn().mockResolvedValue({
					id: 'old-file',
					file: 'old.ts',
					originalName: 'streamLoad(1).ts',
					mimetype: 'video/vnd.dlna.mpeg-tts'
				})
			}
			mockGetFile.mockResolvedValue(bytes)
			mockPutFile.mockResolvedValue({ key: 'stored.ts', mimetype: 'video/vnd.dlna.mpeg-tts' })
			const strategy = new StorageTargetStrategy(storage as never)
			const registry = { get: jest.fn().mockReturnValue(strategy) }
			const service = new UploadFileService(storage as never, registry as never)
			const filePath = path.join(directory, 'streamLoad(1).ts')
			await fs.writeFile(filePath, bytes)
			const sources: { [K in TUploadFileSource['kind']]: Extract<TUploadFileSource, { kind: K }> } = {
				multipart: {
					kind: 'multipart',
					file: {
						originalname: 'streamLoad(1).ts',
						mimetype: 'video/vnd.dlna.mpeg-tts',
						buffer: bytes,
						size: bytes.length
					} as Express.Multer.File
				},
				buffer: { kind: 'buffer', buffer: bytes, originalName: 'streamLoad(1).ts' },
				local_file: { kind: 'local_file', filePath },
				storage_file: { kind: 'storage_file', storageFileId: 'old-file' }
			}
			const result = await service.upload({
				source: sources[kind],
				targets: [{ kind: 'storage' }]
			})
			expect(result.status).toBe('success')
			expect(result.mimeType).toBe('text/plain')
			expect(result.source.mimeType).toBe('text/plain')
			expect(result.destinations[0]).toMatchObject({
				status: 'success',
				metadata: { storageFile: { mimetype: 'text/plain' } }
			})
			expect(mockPutFile.mock.calls[0][0]).toEqual(bytes)
			expect(storage.createStorageFile).toHaveBeenCalledWith(
				expect.objectContaining({ originalname: 'streamLoad(1).ts', mimetype: 'text/plain' }),
				'LOCAL'
			)
		}
	)
})

describe('UploadFileService failure results', () => {
	it('preserves quota status, code and localized message without a caller flag', async () => {
		const failure = new HttpException({ code: 'application_storage_limit', message: '存储空间已满。' }, 413)
		failure.message = 'APP_PLATFORM_FAILURE:application_storage_limit'
		const strategy = { upload: jest.fn().mockRejectedValue(failure) }
		const service = new UploadFileService({} as never, { get: () => strategy } as never)
		const result = await service.upload({
			source: { kind: 'buffer', buffer: Buffer.from('x'), originalName: 'file.txt' },
			targets: [{ kind: 'storage' }]
		})
		expect(result.status).toBe('failed')
		expect(result.destinations).toEqual([
			{
				kind: 'storage',
				status: 'failed',
				error: 'APP_PLATFORM_FAILURE:application_storage_limit',
				failure: { statusCode: 413, code: 'application_storage_limit', message: '存储空间已满。' }
			}
		])
	})

	it('keeps multi-target partial results for existing command callers', async () => {
		const strategy = {
			upload: jest
				.fn()
				.mockRejectedValueOnce(new HttpException('capacity exceeded', 413))
				.mockResolvedValueOnce({ kind: 'volume', status: 'success', path: 'report.txt' })
		}
		const service = new UploadFileService({} as never, { get: () => strategy } as never)
		const result = await service.upload({
			source: { kind: 'buffer', buffer: Buffer.from('x'), originalName: 'file.txt' },
			targets: [{ kind: 'storage' }, { kind: 'volume', catalog: 'projects' }]
		})
		expect(result.status).toBe('partial_success')
		expect(result.destinations.map((item) => item.status)).toEqual(['failed', 'success'])
		expect(result.destinations[0].failure).toEqual({ statusCode: 413, message: 'capacity exceeded' })
	})

	it('waits for all targets and retains every typed failure', async () => {
		let release: () => void = () => {
			throw Error('upload has not started')
		}
		const pending = new Promise<void>((resolve) => {
			release = resolve
		})
		const strategy = {
			upload: jest
				.fn()
				.mockRejectedValueOnce(new HttpException('capacity exceeded', 413))
				.mockImplementationOnce(async () => {
					await pending
					throw new HttpException('access denied', 403)
				})
		}
		const service = new UploadFileService({} as never, { get: () => strategy } as never)
		let completed = false
		const upload = service
			.upload({
				source: { kind: 'buffer', buffer: Buffer.from('x'), originalName: 'file.txt' },
				targets: [{ kind: 'storage' }, { kind: 'volume', catalog: 'projects' }]
			})
			.then((result) => {
				completed = true
				return result
			})
		await new Promise((resolve) => setImmediate(resolve))
		expect(completed).toBe(false)
		release()
		const result = await upload
		expect(result.status).toBe('failed')
		expect(result.destinations.map((item) => item.failure?.statusCode)).toEqual([413, 403])
	})
})

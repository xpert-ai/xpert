import AWS from 'aws-sdk'
import { randomUUID } from 'node:crypto'
import { MinioProvider } from '../../../../../plugins/draft/src/lib/minio.provider'
import { StorageTargetStrategy } from './storage-target.strategy'
import { StorageFileService } from '../../../storage-file/storage-file.service'
import { FileStorage } from '../../file-storage'
import { Test } from '@nestjs/testing'

const endpoint = process.env.XPERT_TEST_MINIO_ENDPOINT
const integration = endpoint ? describe : describe.skip
integration('unified storage upload with real MinIO', () => {
	const bucket = `xpert-upload-test-${randomUUID()}`
	const config = {
		bucket,
		endpoint,
		accessKeyId: process.env.XPERT_TEST_MINIO_ACCESS_KEY,
		secretAccessKey: process.env.XPERT_TEST_MINIO_SECRET_KEY,
		region: 'us-east-1',
		forcePathStyle: true
	}
	const s3 = new AWS.S3({ ...config, s3ForcePathStyle: true, signatureVersion: 'v4' })
	const provider = new MinioProvider({ minio: config })
	const persist = jest.fn(async () => ({ id: randomUUID() }))
	beforeAll(async () => {
		await s3.createBucket({ Bucket: bucket }).promise()
	})
	afterAll(async () => {
		jest.restoreAllMocks()
		for (const item of (await s3.listObjectsV2({ Bucket: bucket }).promise()).Contents ?? [])
			await s3.deleteObject({ Bucket: bucket, Key: item.Key! }).promise()
		await s3.deleteBucket({ Bucket: bucket }).promise()
	})
	it('transports MIME and separate tenant keys through the production upload strategy', async () => {
		jest.spyOn(FileStorage.prototype, 'getProvider').mockReturnValue(provider)
		const module = await Test.createTestingModule({
			providers: [
				StorageTargetStrategy,
				{ provide: StorageFileService, useValue: { createStorageFile: persist } }
			]
		}).compile()
		try {
			const strategy = module.get(StorageTargetStrategy)
			for (const tenant of ['tenant-a', 'tenant-b']) {
				const bytes = Buffer.from(`tenant,amount\n${tenant},7\n`)
				const result = await strategy.upload(
					{
						name: 'sales.csv',
						buffer: bytes,
						originalName: 'sales.csv',
						mimeType: 'text/csv',
						size: bytes.length,
						source: { kind: 'buffer', originalName: 'sales.csv' }
					},
					{ kind: 'storage', provider: 'MINIO', fileName: 'sales.csv' },
					{ request: { tenantId: tenant, organizationId: 'organization', userId: 'user' } }
				)
				expect(result.path).toBe(`files/${tenant}/sales.csv`)
				expect(await provider.getFile(result.path!)).toEqual(bytes)
				expect((await s3.headObject({ Bucket: bucket, Key: result.path! }).promise()).ContentType).toBe(
					'text/csv'
				)
			}
			expect(persist).toHaveBeenCalledTimes(2)
			await expect(
				strategy.upload(
					{
						name: 'sales.csv',
						buffer: Buffer.from('data'),
						originalName: 'sales.csv',
						mimeType: 'text/csv',
						size: 4,
						source: { kind: 'buffer', originalName: 'sales.csv' }
					},
					{ kind: 'storage', fileName: '../tenant-b/sales.csv' },
					{ request: { tenantId: 'tenant-a' } }
				)
			).rejects.toThrow('Invalid file name')
			expect(persist).toHaveBeenCalledTimes(2)
		} finally {
			await module.close()
		}
	})
})

// Opt-in test boundary: private, dedicated bucket only; no credentials or signed URLs in output.
import AWS from 'aws-sdk'
import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { MinioProvider } from './minio.provider'
import type { S3CompatibleProviderConfig } from './file-storage.types'

const endpoint = process.env.XPERT_TEST_MINIO_ENDPOINT
const integration = endpoint ? describe : describe.skip
integration('real private MinIO provider', () => {
  const bucket = `xpert-storage-test-${randomUUID()}`
  const config: S3CompatibleProviderConfig = {
    endpoint,
    bucket,
    accessKeyId: process.env.XPERT_TEST_MINIO_ACCESS_KEY,
    secretAccessKey: process.env.XPERT_TEST_MINIO_SECRET_KEY,
    signedUrlEndpoint: process.env.XPERT_TEST_MINIO_SIGNED_ENDPOINT || endpoint,
    region: 'us-east-1',
    forcePathStyle: true,
    signedUrlExpires: 60
  }
  const client = new AWS.S3({ ...config, s3ForcePathStyle: true, signatureVersion: 'v4' })
  const provider = () => new MinioProvider({ minio: config })
  const key = 'tenant-a/report #1.csv'
  const bytes = Buffer.from('city,amount\nShanghai,12\n')
  beforeAll(async () => {
    await client.createBucket({ Bucket: bucket }).promise()
  })
  afterAll(async () => {
    const result = await client.listObjectsV2({ Bucket: bucket }).promise()
    for (const item of result.Contents ?? []) await client.deleteObject({ Bucket: bucket, Key: item.Key! }).promise()
    await client.deleteBucket({ Bucket: bucket }).promise()
  })
  it('writes object metadata, reads bytes, retries deterministically and denies anonymous reads', async () => {
    const first = await provider().putFile(bytes, key, { contentType: 'text/csv; charset=utf-8' })
    expect(first.size).toBe(bytes.length)
    await provider().putFile(bytes, key, { contentType: 'text/csv; charset=utf-8' })
    expect(await provider().getFile(key)).toEqual(bytes)
    const response = await fetch(provider().url(key))
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/csv; charset=utf-8')
    expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes)
    const anonymous = new URL(provider().url(key))
    anonymous.search = ''
    expect((await fetch(anonymous)).status).toBe(403)
  })
  it('preserves UTF-8 byte lengths and safe non-ASCII download names', async () => {
    const name = 'tenant-a/报告.csv'
    const result = await provider().putFile('城市,金额\n上海,12\n', name)
    expect(result.size).toBe(Buffer.byteLength('城市,金额\n上海,12\n'))
    const response = await fetch(provider().url(name))
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/octet-stream')
    expect(response.headers.get('content-disposition')).toContain(encodeURIComponent('报告.csv'))
  })
  it('rejects a modified key and expired signature', async () => {
    const changed = new URL(provider().url(key))
    changed.pathname += '-other'
    expect((await fetch(changed)).status).toBe(403)
    const expires = new MinioProvider({ minio: { ...config, signedUrlExpires: 1 } }).url(key)
    await new Promise((resolve) => setTimeout(resolve, 2100))
    expect((await fetch(expires)).status).toBe(403)
  })
  it('persists through an explicitly selected isolated container restart', async () => {
    const container = process.env.XPERT_TEST_MINIO_RESTART_CONTAINER
    if (!container || !/^xpert-minio-storage-minio-\d+$/.test(container))
      throw new Error('Set XPERT_TEST_MINIO_RESTART_CONTAINER to the isolated storage-test container')
    execFileSync('docker', ['restart', container], { stdio: 'pipe' })
    for (let attempt = 0; attempt < 30; attempt++) {
      if (
        await fetch(`${endpoint}/minio/health/live`)
          .then((r) => r.ok)
          .catch(() => false)
      )
        break
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
    expect(await provider().getFile(key)).toEqual(bytes)
  }, 30000)
  it('deletes idempotently and invalidates existing object URLs', async () => {
    const url = provider().url(key)
    await provider().deleteFile(key)
    await provider().deleteFile(key)
    expect((await fetch(url)).status).toBe(404)
    await expect(provider().getFile(key)).rejects.toMatchObject({ code: 'NoSuchKey' })
  })
})

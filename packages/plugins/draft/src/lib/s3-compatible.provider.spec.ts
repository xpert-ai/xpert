import { MinioProvider } from './minio.provider'
import { S3Provider } from './s3.provider'
import { S3CompatibleProviderConfigSchema } from './file-storage.types'

const base = { bucket: 'private-files', accessKeyId: 'test', secretAccessKey: 'test-secret' }

describe('S3 compatible configuration and URLs', () => {
  it('signs the browser endpoint independently from the internal endpoint', () => {
    const provider = new MinioProvider({
      minio: {
        ...base,
        endpoint: 'http://minio:9000',
        signedUrlEndpoint: 'https://files.example.test',
        signedUrlExpires: 90,
        region: 'test-region'
      }
    })
    const url = new URL(provider.url('tenant/report #1.csv'))
    expect(url.origin).toBe('https://files.example.test')
    expect(decodeURIComponent(url.pathname)).toBe('/private-files/tenant/report #1.csv')
    expect(url.searchParams.get('X-Amz-Expires')).toBe('90')
    expect(url.searchParams.get('X-Amz-Credential')).toContain('/test-region/s3/aws4_request')
    expect(provider.config.endpoint).toBe('http://minio:9000')
  })
  it('keeps public URLs explicit and escapes key delimiters', () => {
    const provider = new MinioProvider({ minio: { ...base, publicUrl: 'https://cdn.example.test' } })
    const url = new URL(provider.url('folder/a #?%.csv'))
    expect(decodeURIComponent(url.pathname)).toBe('/private-files/folder/a #?%.csv')
    expect(url.search).toBe('')
    expect(url.hash).toBe('')
  })
  it('supports virtual-host signing without changing MinIO path-style defaults', () => {
    const provider = new S3Provider({ s3: { ...base, endpoint: 'https://s3.example.test' } })
    expect(new URL(provider.url('key')).hostname).toBe('private-files.s3.example.test')
  })
  it.each([0, -1, 1.5, 604801, Number.NaN])('rejects invalid expiry %s, including env defaults', (signedUrlExpires) => {
    const provider = new MinioProvider({ minio: { ...base, signedUrlExpires } })
    expect(() => provider.url('key')).toThrow('expiry')
    expect(S3CompatibleProviderConfigSchema.safeParse({ signedUrlExpires }).success).toBe(false)
  })
  it.each(['ftp://files.test', 'https://user:password@files.test', 'https://files.test?secret=x'])(
    'rejects unsafe endpoint configuration',
    (signedUrlEndpoint) => {
      expect(() => new MinioProvider({ minio: { ...base, signedUrlEndpoint } }).url('key')).toThrow()
    }
  )
})

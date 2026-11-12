import { readDraftFileStoragePluginEnvDefaults } from './file-storage.config'

describe('object storage environment boundary', () => {
  const original = process.env
  afterEach(() => {
    process.env = original
  })
  it('maps browser signing endpoints independently for each S3-compatible provider', () => {
    process.env = {
      ...original,
      MINIO_SIGNED_URL_ENDPOINT: 'https://minio.test',
      S3_SIGNED_URL_ENDPOINT: 'https://s3.test',
      RUSTFS_SIGNED_URL_ENDPOINT: 'https://rustfs.test',
      WASABI_SIGNED_URL_ENDPOINT: 'https://wasabi.test',
      MINIO_FORCE_PATH_STYLE: 'true',
      MINIO_SIGNED_URL_EXPIRES: '90'
    }
    delete process.env.AWS_SIGNED_URL_ENDPOINT
    expect(readDraftFileStoragePluginEnvDefaults()).toMatchObject({
      minio: { signedUrlEndpoint: 'https://minio.test', forcePathStyle: true, signedUrlExpires: 90 },
      s3: { signedUrlEndpoint: 'https://s3.test' },
      rustfs: { signedUrlEndpoint: 'https://rustfs.test' },
      wasabi: { signedUrlEndpoint: 'https://wasabi.test' }
    })
  })
})

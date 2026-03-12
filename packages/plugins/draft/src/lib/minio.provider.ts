import { FileStorageProviderEnum } from '@metad/contracts'
import { FileStorageProvider } from '@xpert-ai/plugin-sdk'
import { Injectable } from '@nestjs/common'
import { S3CompatibleProvider } from './s3-compatible.provider'

@Injectable()
@FileStorageProvider(FileStorageProviderEnum.MINIO)
export class MinioProvider extends S3CompatibleProvider {
  readonly name = FileStorageProviderEnum.MINIO
  protected readonly configKey = 'minio' as const
  protected override defaultForcePathStyle = true
}

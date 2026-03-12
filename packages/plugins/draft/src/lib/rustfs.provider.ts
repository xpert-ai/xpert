import { FileStorageProvider } from '@xpert-ai/plugin-sdk'
import { Injectable } from '@nestjs/common'
import { S3CompatibleProvider } from './s3-compatible.provider'

@Injectable()
@FileStorageProvider('RUSTFS')
export class RustFSProvider extends S3CompatibleProvider {
  readonly name = 'RUSTFS'
  protected readonly configKey = 'rustfs' as const
  protected override defaultForcePathStyle = true
}

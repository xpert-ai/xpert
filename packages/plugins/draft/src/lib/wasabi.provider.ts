import { FileStorageProvider } from '@xpert-ai/plugin-sdk'
import { Injectable } from '@nestjs/common'
import { S3CompatibleProvider } from './s3-compatible.provider'

@Injectable()
@FileStorageProvider('WASABI')
export class WasabiProvider extends S3CompatibleProvider {
  readonly name = 'WASABI'
  protected readonly configKey = 'wasabi' as const
}

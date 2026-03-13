import { Injectable } from '@nestjs/common'
import { DiscoveryService, Reflector } from '@nestjs/core'
import { BaseStrategyRegistry } from '../../strategy'
import { FILE_STORAGE_PROVIDER } from './provider.decorator'
import { IFileStorageProvider } from './provider.interface'

@Injectable()
export class FileStorageProviderRegistry extends BaseStrategyRegistry<IFileStorageProvider> {
  constructor(discoveryService: DiscoveryService, reflector: Reflector) {
    super(FILE_STORAGE_PROVIDER, discoveryService, reflector)
  }
}

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { ModuleRef } from '@nestjs/core'
import { FILE_MEMORY_PROVIDER_NAME, MEMORY_REGISTRY_TOKEN, type MemoryRegistryLike } from './file-memory.registration'
import { XpertMemoryService } from './file-memory.service'

@Injectable()
export class FileMemoryProviderRegistrar implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FileMemoryProviderRegistrar.name)

  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly provider: XpertMemoryService
  ) {}

  onModuleInit() {
    const registry = this.moduleRef.get<MemoryRegistryLike>(MEMORY_REGISTRY_TOKEN, {
      strict: false
    })
    if (!registry) {
      this.logger.warn('Memory registry is unavailable. Skipping file-memory provider registration.')
      return
    }

    registry.register(FILE_MEMORY_PROVIDER_NAME, this.provider)
    this.logger.log('Registered file-memory provider.')
  }

  onModuleDestroy() {
    const registry = this.moduleRef.get<MemoryRegistryLike>(MEMORY_REGISTRY_TOKEN, {
      strict: false
    })
    registry?.unregister(FILE_MEMORY_PROVIDER_NAME)
  }
}

import { Injectable } from '@nestjs/common'
import { DiscoveryService, Reflector } from '@nestjs/core'
import { BaseStrategyRegistry } from '../../strategy'
import { IFileUploadTargetStrategy } from './strategy.interface'
import { FILE_UPLOAD_TARGET_STRATEGY } from './strategy.decorator'

@Injectable()
export class FileUploadTargetRegistry extends BaseStrategyRegistry<IFileUploadTargetStrategy> {
  constructor(discoveryService: DiscoveryService, reflector: Reflector) {
    super(FILE_UPLOAD_TARGET_STRATEGY, discoveryService, reflector)
  }
}

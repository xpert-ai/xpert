import { Module } from '@nestjs/common'
import { ManualRetentionController } from './manual-retention.controller'
import { ManualRetentionService } from './manual-retention.service'

@Module({ controllers: [ManualRetentionController], providers: [ManualRetentionService] })
export class ManualRetentionModule {}

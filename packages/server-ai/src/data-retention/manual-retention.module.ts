import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { ManualRetentionController } from './manual-retention.controller'
import { ManualRetentionService } from './manual-retention.service'

@Module({ imports: [CqrsModule], controllers: [ManualRetentionController], providers: [ManualRetentionService] })
export class ManualRetentionModule {}

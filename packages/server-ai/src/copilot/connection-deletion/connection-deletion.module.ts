import { Module } from '@nestjs/common'
import { ConnectionDeletionService } from './connection-deletion.service'

@Module({ providers: [ConnectionDeletionService], exports: [ConnectionDeletionService] })
export class ConnectionDeletionModule {}

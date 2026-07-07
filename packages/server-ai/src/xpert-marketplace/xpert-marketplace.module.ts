import { User, UserGroup } from '@xpert-ai/server-core'
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Xpert } from '../xpert/xpert.entity'
import { XpertAccessRequest } from './xpert-access-request.entity'
import { XpertMarketplaceController } from './xpert-marketplace.controller'
import { XpertMarketplaceService } from './xpert-marketplace.service'

@Module({
    imports: [TypeOrmModule.forFeature([Xpert, XpertAccessRequest, UserGroup, User])],
    controllers: [XpertMarketplaceController],
    providers: [XpertMarketplaceService],
    exports: [XpertMarketplaceService]
})
export class XpertMarketplaceModule {}

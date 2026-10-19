import { AssistantSharingModule } from '../xpert/sharing/sharing.module'
import { CqrsModule } from '@nestjs/cqrs'
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Xpert } from '../xpert/xpert.entity'
import { XpertWorkspaceModule } from '../xpert-workspace'
import { XpertTemplateModule } from '../xpert-template/xpert-template.module'
import { XpertAccessRequest } from './xpert-access-request.entity'
import { XpertMarketplaceController } from './xpert-marketplace.controller'
import { XpertMarketplaceService } from './xpert-marketplace.service'

@Module({
    imports: [
        CqrsModule,
        AssistantSharingModule,
        TypeOrmModule.forFeature([Xpert, XpertAccessRequest]),
        XpertWorkspaceModule,
        XpertTemplateModule
    ],
    controllers: [XpertMarketplaceController],
    providers: [XpertMarketplaceService],
    exports: [XpertMarketplaceService]
})
export class XpertMarketplaceModule {}

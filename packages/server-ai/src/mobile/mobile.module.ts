import { UserModule } from '@xpert-ai/server-core'
import { Module, forwardRef } from '@nestjs/common'
import { RouterModule } from '@nestjs/core'
import { AssistantBindingModule } from '../assistant-binding'
import { XpertModule } from '../xpert'
import { MobileController } from './mobile.controller'
import { MobileService } from './mobile.service'

@Module({
    imports: [
        RouterModule.register([{ path: '/mobile', module: MobileModule }]),
        forwardRef(() => UserModule),
        forwardRef(() => AssistantBindingModule),
        forwardRef(() => XpertModule)
    ],
    controllers: [MobileController],
    providers: [MobileService],
    exports: [MobileService]
})
export class MobileModule {}

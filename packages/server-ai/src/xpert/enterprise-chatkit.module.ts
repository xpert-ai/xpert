import { AccountBindingModule, IntegrationModule, SecretTokenModule } from '@xpert-ai/server-core'
import { Module } from '@nestjs/common'
import { EnterpriseChatkitController } from './enterprise-chatkit.controller'
import { EnterpriseChatkitSessionService } from './enterprise-chatkit-session.service'

@Module({
    imports: [AccountBindingModule, IntegrationModule, SecretTokenModule],
    controllers: [EnterpriseChatkitController],
    providers: [EnterpriseChatkitSessionService]
})
export class EnterpriseChatkitModule {}

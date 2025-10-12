import { IIntegration } from '@metad/contracts'
import { Body, Controller, ForbiddenException, Post } from '@nestjs/common'
import { translate } from './i18n'
import { LarkIntegrationStrategy } from './integration.strategy'

@Controller('lark')
export class LarkController {
  constructor(private readonly integrationStrategy: LarkIntegrationStrategy) {}

  @Post('test')
  async connect(@Body() integration: IIntegration) {
    try {
      const botInfo = await this.integrationStrategy.validateConfig(integration.options)
      if (!integration.avatar) {
        integration.avatar = {
          url: botInfo.avatar_url
        }
      }
      return integration
    } catch (err: any) {
      const errorMessage = translate('Error.CredentialsFailed')
      throw new ForbiddenException(`${errorMessage}: ${err.message}`)
    }
  }
}

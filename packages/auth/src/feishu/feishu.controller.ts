import { ConfigService, IEnvironment } from '@xpert-ai/server-config'
import { Controller, Get, Req, Res, UseGuards } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { Public } from '../public.decorator'
import { IIncomingRequest, RequestCtx } from '../request-context.decorator'
import { SocialAuthService } from '../social-auth.service'

@Controller('feishu')
export class FeishuController {
  constructor(
    private readonly configService: ConfigService,
    public readonly service: SocialAuthService
  ) {}

  @Get('')
  @Public()
  @UseGuards(AuthGuard('feishu'))
  feishuLogin(@Req() req: any) {}

  @Get('callback')
  @Public()
  @UseGuards(AuthGuard('feishu'))
  async feishuLoginCallback(@RequestCtx() requestCtx: IIncomingRequest, @Res() res) {
	const larkConfig = this.configService.get('larkConfig') as IEnvironment['larkConfig']
    const { user } = requestCtx
    const { success, authData } = await this.service.validateOAuthLoginMobile({
      ...user,
      tenantId: larkConfig.tenantId,
      organizationId: larkConfig.organizationId,
      roleName: larkConfig.roleName
    })
    return this.service.routeRedirect(success, authData, res)
  }
}

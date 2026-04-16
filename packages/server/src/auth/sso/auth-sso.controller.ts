import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common'
import { I18nLang } from 'nestjs-i18n'
import { LanguagesEnum } from '@xpert-ai/contracts'
import { Request } from 'express'
import { Public } from '../../shared/decorators'
import { AuthSsoBindingService } from './auth-sso-binding.service'
import { AuthSsoDiscoveryService } from './auth-sso-discovery.service'

@Controller('sso')
export class AuthSsoController {
  constructor(
    private readonly authSsoDiscoveryService: AuthSsoDiscoveryService,
    private readonly authSsoBindingService: AuthSsoBindingService
  ) {}

  @Public()
  @Get('providers')
  async getProviders(@Req() request: Request) {
    return this.authSsoDiscoveryService.discover(request)
  }

  @Public()
  @Get('bind/challenge')
  async getBindChallenge(@Query('ticket') ticket?: string) {
    return this.authSsoBindingService.getChallenge(ticket)
  }

  @Get('bind/current-user/challenge')
  async getCurrentUserBindChallenge(@Query('ticket') ticket?: string) {
    return this.authSsoBindingService.getCurrentUserChallenge(ticket)
  }

  @Public()
  @Post('bind/complete')
  async completeBinding(
    @Body() body: { ticket?: string; userName?: string; password?: string }
  ) {
    return this.authSsoBindingService.completeBinding(body)
  }

  @Post('bind/current-user/complete')
  async completeCurrentUserBinding(@Body() body: { ticket?: string }) {
    return this.authSsoBindingService.completeCurrentUserBinding(body)
  }

  @Public()
  @Post('bind/register')
  async registerAndCompleteBinding(
    @Body() body: { ticket?: string; email?: string; password?: string; confirmPassword?: string },
    @I18nLang() languageCode: LanguagesEnum
  ) {
    return this.authSsoBindingService.registerAndBind(body, languageCode)
  }
}

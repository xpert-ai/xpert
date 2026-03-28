import {
  AssistantCode,
  AssistantConfigScope,
  IAssistantConfigUpsertInput,
  RolesEnum
} from '@metad/contracts'
import {
  RoleGuard,
  Roles,
  TransformInterceptor
} from '@metad/server-core'
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
  UseInterceptors
} from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { AssistantConfigService } from './assistant-config.service'

@ApiTags('AssistantConfig')
@ApiBearerAuth()
@UseInterceptors(TransformInterceptor)
@UseGuards(RoleGuard)
@Roles(RolesEnum.SUPER_ADMIN, RolesEnum.ADMIN)
@Controller()
export class AssistantConfigController {
  constructor(private readonly service: AssistantConfigService) {}

  @Get()
  async getScopedConfigs(
    @Query('scope') scope: AssistantConfigScope = AssistantConfigScope.ORGANIZATION
  ) {
    return this.service.getScopedConfigs(scope)
  }

  @Get('effective/:code')
  async getEffectiveConfig(@Param('code') code: AssistantCode) {
    return this.service.getEffectiveConfig(code)
  }

  @Post()
  async upsertConfig(@Body() input: IAssistantConfigUpsertInput) {
    return this.service.upsertConfig(input)
  }

  @Delete(':code')
  async deleteConfig(
    @Param('code') code: AssistantCode,
    @Query('scope') scope: AssistantConfigScope = AssistantConfigScope.ORGANIZATION
  ) {
    return this.service.deleteConfig(code, scope)
  }
}

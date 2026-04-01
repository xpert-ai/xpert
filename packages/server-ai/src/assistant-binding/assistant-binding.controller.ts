import {
  AssistantBindingScope,
  AssistantCode,
  IAssistantBindingUpsertInput
} from '@metad/contracts'
import { TransformInterceptor } from '@metad/server-core'
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseInterceptors
} from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { AssistantBindingService } from './assistant-binding.service'

@ApiTags('AssistantBinding')
@ApiBearerAuth()
@UseInterceptors(TransformInterceptor)
@Controller()
export class AssistantBindingController {
  constructor(private readonly service: AssistantBindingService) {}

  @Get()
  async getScopedBindings(
    @Query('scope') scope: AssistantBindingScope = AssistantBindingScope.ORGANIZATION
  ) {
    return this.service.getScopedBindings(scope)
  }

  @Get('effective/:code')
  async getEffectiveBinding(@Param('code') code: AssistantCode) {
    return this.service.getEffectiveBinding(code)
  }

  @Get('xperts')
  async getAvailableXperts(
    @Query('scope') scope: AssistantBindingScope = AssistantBindingScope.ORGANIZATION,
    @Query('code') code: AssistantCode
  ) {
    return this.service.getAvailableXperts(scope, code)
  }

  @Get(':code')
  async getBinding(
    @Param('code') code: AssistantCode,
    @Query('scope') scope: AssistantBindingScope = AssistantBindingScope.ORGANIZATION
  ) {
    return this.service.getBinding(code, scope)
  }

  @Post()
  async upsertBinding(@Body() input: IAssistantBindingUpsertInput) {
    return this.service.upsertBinding(input)
  }

  @Delete(':code')
  async deleteBinding(
    @Param('code') code: AssistantCode,
    @Query('scope') scope: AssistantBindingScope = AssistantBindingScope.ORGANIZATION
  ) {
    return this.service.deleteBinding(code, scope)
  }
}

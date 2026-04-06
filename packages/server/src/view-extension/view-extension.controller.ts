import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { Body, Controller, Get, Param, Post, Query, UseInterceptors } from '@nestjs/common'
import { IsOptional, IsString } from 'class-validator'
import { TransformInterceptor } from '../core/interceptors'
import { UseValidationPipe } from '../shared/pipes'
import { ViewExtensionService } from './view-extension.service'
import { parseViewQuery } from './view-extension.utils'

class ExecuteViewActionDto {
  @IsOptional()
  @IsString()
  targetId?: string
}

@ApiTags('ViewExtension')
@ApiBearerAuth()
@UseInterceptors(TransformInterceptor)
@Controller()
export class ViewExtensionController {
  constructor(private readonly service: ViewExtensionService) {}

  @Get(':hostType/:hostId/slots/:slot/views')
  async getSlotViews(@Param('hostType') hostType: string, @Param('hostId') hostId: string, @Param('slot') slot: string) {
    return this.service.listSlotViews(hostType, hostId, slot)
  }

  @Get(':hostType/:hostId/views/:viewKey/data')
  async getViewData(
    @Param('hostType') hostType: string,
    @Param('hostId') hostId: string,
    @Param('viewKey') viewKey: string,
    @Query() query: Record<string, string | string[] | undefined>
  ) {
    return this.service.getViewData(hostType, hostId, viewKey, parseViewQuery(query))
  }

  @Post(':hostType/:hostId/views/:viewKey/actions/:actionKey')
  @UseValidationPipe({ whitelist: true, transform: true })
  async executeAction(
    @Param('hostType') hostType: string,
    @Param('hostId') hostId: string,
    @Param('viewKey') viewKey: string,
    @Param('actionKey') actionKey: string,
    @Body() body: ExecuteViewActionDto
  ) {
    return this.service.executeAction(hostType, hostId, viewKey, actionKey, body)
  }
}

import { TransformInterceptor } from '@xpert-ai/server-core'
import { Body, Controller, Get, Param, Post, UseInterceptors } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { AcpArtifactDto } from './dto/acp-artifact.dto'
import { AcpSessionEventDto } from './dto/acp-session-event.dto'
import { AcpSessionDto } from './dto/acp-session.dto'
import { CancelAcpSessionCommand } from './commands'
import { GetAcpSessionQuery, ListAcpArtifactsQuery, ListAcpSessionEventsQuery } from './queries'

@ApiTags('AcpRuntime')
@ApiBearerAuth()
@UseInterceptors(TransformInterceptor)
@Controller()
export class AcpRuntimeController {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly commandBus: CommandBus
  ) {}

  @Get('sessions/:id')
  async getSession(@Param('id') id: string) {
    const session = await this.queryBus.execute(new GetAcpSessionQuery(id))
    return new AcpSessionDto(session)
  }

  @Get('sessions/:id/events')
  async getEvents(@Param('id') id: string) {
    const events = await this.queryBus.execute(new ListAcpSessionEventsQuery(id))
    return events.map((event) => new AcpSessionEventDto(event))
  }

  @Get('sessions/:id/artifacts')
  async getArtifacts(@Param('id') id: string) {
    const artifacts = await this.queryBus.execute(new ListAcpArtifactsQuery(id))
    return artifacts.map((artifact) => new AcpArtifactDto(artifact))
  }

  @Post('sessions/:id/cancel')
  async cancelSession(@Param('id') id: string, @Body() body?: { reason?: string }) {
    const session = await this.commandBus.execute(new CancelAcpSessionCommand(id, body?.reason))
    return new AcpSessionDto(session)
  }
}

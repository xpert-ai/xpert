import { TransformInterceptor } from '@xpert-ai/server-core'
import { BadRequestException, Body, Controller, Get, Param, Post, Query, UseInterceptors } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { AcpSessionBridgeService } from './acp-session-bridge.service'
import { AcpRuntimeService } from './acp-runtime.service'
import { AcpArtifactDto } from './dto/acp-artifact.dto'
import { AcpSessionEventDto } from './dto/acp-session-event.dto'
import { AcpSessionDto } from './dto/acp-session.dto'
import { AcpTargetDto } from './dto/acp-target.dto'

@ApiTags('AcpRuntime')
@ApiBearerAuth()
@UseInterceptors(TransformInterceptor)
@Controller()
export class AcpRuntimeController {
  constructor(
    private readonly runtimeService: AcpRuntimeService,
    private readonly bridgeService: AcpSessionBridgeService
  ) {}

  @Get('targets')
  async listTargets() {
    const targets = await this.runtimeService.listTargets()
    return targets.map((target) => new AcpTargetDto(target))
  }

  @Post('sessions/ensure')
  async ensureSession(@Body() body: Record<string, unknown>) {
    const session = await this.runtimeService.ensureSession(body as never)
    return new AcpSessionDto(session)
  }

  @Get('sessions')
  async listSessions(
    @Query('conversationId') conversationId?: string,
    @Query('xpertId') xpertId?: string,
    @Query('targetKind') targetKind?: string
  ) {
    const sessions = await this.runtimeService.listSessions({
      conversationId,
      xpertId,
      targetKind: targetKind as never
    })
    return sessions.map((session) => new AcpSessionDto(session))
  }

  @Get('sessions/:id')
  async getSession(@Param('id') id: string) {
    const session = await this.runtimeService.getSession(id)
    return new AcpSessionDto(session)
  }

  @Get('sessions/:id/status')
  async getSessionStatus(@Param('id') id: string) {
    if (this.bridgeService.hasActiveBridge(id)) {
      return await this.bridgeService.getStatus(id)
    }
    return await this.runtimeService.getSessionStatus(id)
  }

  @Get('sessions/:id/events')
  async getEvents(@Param('id') id: string) {
    const events = await this.runtimeService.listSessionEvents(id)
    return events.map((event) => new AcpSessionEventDto(event))
  }

  @Get('sessions/:id/artifacts')
  async getArtifacts(@Param('id') id: string) {
    const artifacts = await this.runtimeService.listArtifacts(id)
    return artifacts.map((artifact) => new AcpArtifactDto(artifact))
  }

  @Post('sessions/:id/prompts')
  async runPrompt(@Param('id') id: string, @Body() body: { prompt: string; title?: string; timeoutMs?: number }) {
    return await this.runtimeService.runTurnBuffered({
      sessionId: id,
      prompt: body.prompt,
      title: body.title,
      timeoutMs: body.timeoutMs
    })
  }

  @Post('sessions/:id/cancel')
  async cancelSession(@Param('id') id: string, @Body() body?: { reason?: string }) {
    if (this.bridgeService.hasActiveBridge(id)) {
      await this.bridgeService.cancel(id, body?.reason)
      return new AcpSessionDto(await this.runtimeService.getSession(id))
    }
    const session = await this.runtimeService.cancelSession(id, body?.reason)
    return new AcpSessionDto(session)
  }

  @Post('sessions/:id/interventions')
  async interveneSession(
    @Param('id') id: string,
    @Body()
    body: {
      type: 'queue' | 'interrupt'
      prompt?: string
      title?: string
      reason?: string
      timeoutMs?: number
    }
  ) {
    if (this.bridgeService.hasActiveBridge(id)) {
      if (body.type === 'interrupt' && !body.prompt?.trim()) {
        throw new BadRequestException('Interrupt intervention requires a prompt')
      }

      const session =
        body.type === 'interrupt'
          ? await this.bridgeService.interruptAndSteer(id, {
              prompt: body.prompt.trim(),
              title: body.title,
              reason: body.reason,
              timeoutMs: body.timeoutMs
            })
          : body.prompt
            ? await this.bridgeService.queuePrompt(id, {
                prompt: body.prompt,
                title: body.title,
                timeoutMs: body.timeoutMs
              })
            : await this.bridgeService.getStatus(id)

      return {
        accepted: true,
        mode: body.type,
        session
      }
    }
    return await this.runtimeService.interveneSession(id, body)
  }

  @Post('sessions/:id/close')
  async closeSession(@Param('id') id: string, @Body() body?: { reason?: string }) {
    if (this.bridgeService.hasActiveBridge(id)) {
      await this.bridgeService.close(id, body?.reason)
      return new AcpSessionDto(await this.runtimeService.getSession(id))
    }
    const session = await this.runtimeService.closeSession(id, body?.reason)
    return new AcpSessionDto(session)
  }
}

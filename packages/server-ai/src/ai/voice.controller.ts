import { BadRequestException, Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
import { ApiKeyOrClientSecretAuthGuard, Public, UUIDValidationPipe, ZodValidationPipe } from '@xpert-ai/server-core'
import { t } from 'i18next'
import { z } from 'zod'
import { AssistantThreadScopeGuard } from './assistant-thread-scope.guard'
import { VoiceSessionService } from '../realtime-voice/voice-session.service'
import { VoiceTaskService } from '../realtime-voice/voice-task.service'
import { voiceStartSchema } from '../realtime-voice/voice.schema'

@Public()
@UseGuards(ApiKeyOrClientSecretAuthGuard, AssistantThreadScopeGuard)
@Controller('threads/:threadId/voice')
export class VoiceController {
    constructor(
        private readonly sessions: VoiceSessionService,
        private readonly tasks: VoiceTaskService
    ) {}

    @Post('sessions')
    create(
        @Param('threadId', UUIDValidationPipe) threadId: string,
        @Body(
            new ZodValidationPipe(
                voiceStartSchema,
                () => new BadRequestException(t('server-ai:Error.RealtimeConfigurationInvalid'))
            )
        )
        input: z.output<typeof voiceStartSchema>
    ) {
        return this.sessions.create(threadId, input.originMode, input.assistantId)
    }

    @Get('transcript')
    async transcript(@Param('threadId', UUIDValidationPipe) threadId: string) {
        const { scope } = await this.sessions.authorize(threadId)
        return this.sessions.history(scope)
    }

    @Get('tasks')
    async list(@Param('threadId', UUIDValidationPipe) threadId: string) {
        const { scope } = await this.sessions.authorize(threadId)
        return this.tasks.list(scope)
    }

    @Post('sessions/:id/end')
    async end(@Param('threadId', UUIDValidationPipe) threadId: string, @Param('id', UUIDValidationPipe) id: string) {
        const call = await this.sessions.end(await this.sessions.get(threadId, id))
        return { ended: true, call }
    }
}

@Public()
@UseGuards(ApiKeyOrClientSecretAuthGuard)
@Controller('assistants/:assistantId/voice')
export class VoiceCapabilityController {
    constructor(private readonly sessions: VoiceSessionService) {}
    @Get()
    available(@Param('assistantId', UUIDValidationPipe) assistantId: string) {
        return this.sessions.available(assistantId)
    }
}

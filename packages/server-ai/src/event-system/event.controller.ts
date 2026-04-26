import { Controller, Get, Header, Headers, Query, Res, Sse } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { keepAlive, takeUntilClose } from '@xpert-ai/server-common'
import { RequestContext } from '@xpert-ai/server-core'
import { XpertEventFilter } from '@xpert-ai/contracts'
import { Response } from 'express'
import { XpertEventStreamService } from './event-stream.service'

interface EventQuery {
	type?: string
	projectId?: string
	sprintId?: string
	taskId?: string
	taskExecutionId?: string
	conversationId?: string
	agentExecutionId?: string
	xpertId?: string
	afterId?: string
	limit?: string
}

@ApiTags('XpertEvent')
@ApiBearerAuth()
@Controller('events')
export class XpertEventController {
	constructor(private readonly streamService: XpertEventStreamService) {}

	@Get()
	async replay(@Query() query: EventQuery, @Headers('last-event-id') lastEventId?: string) {
		return this.streamService.replay({
			tenantId: RequestContext.currentTenantId(),
			filter: this.toFilter(query, lastEventId),
			lastEventId: query.afterId ?? lastEventId,
			limit: this.toLimit(query.limit)
		})
	}

	@Header('content-type', 'text/event-stream')
	@Header('Connection', 'keep-alive')
	@Get('stream')
	@Sse()
	stream(@Res() res: Response, @Query() query: EventQuery, @Headers('last-event-id') lastEventId?: string) {
		return this.streamService
			.createEventStream({
				tenantId: RequestContext.currentTenantId(),
				filter: this.toFilter(query, lastEventId),
				lastEventId: query.afterId ?? lastEventId
			})
			.pipe(keepAlive(30000), takeUntilClose(res))
	}

	private toFilter(query: EventQuery, lastEventId?: string): XpertEventFilter {
		return {
			type: this.normalizeString(query.type),
			projectId: this.normalizeString(query.projectId),
			sprintId: this.normalizeString(query.sprintId),
			taskId: this.normalizeString(query.taskId),
			taskExecutionId: this.normalizeString(query.taskExecutionId),
			conversationId: this.normalizeString(query.conversationId),
			agentExecutionId: this.normalizeString(query.agentExecutionId),
			xpertId: this.normalizeString(query.xpertId),
			afterId: this.normalizeString(query.afterId) ?? this.normalizeString(lastEventId),
			limit: this.toLimit(query.limit)
		}
	}

	private toLimit(value?: string) {
		if (!value) {
			return undefined
		}
		const parsed = Number(value)
		return Number.isFinite(parsed) ? parsed : undefined
	}

	private normalizeString(value?: string) {
		const normalized = value?.trim()
		return normalized || undefined
	}
}

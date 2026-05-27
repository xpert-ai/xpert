import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { Body, Controller, Get, Param, Post, Query, Res, UseInterceptors } from '@nestjs/common'
import { IsObject, IsOptional, IsString } from 'class-validator'
import type { Response } from 'express'
import type { XpertViewScalar } from '@xpert-ai/contracts'
import { TransformInterceptor } from '../core/interceptors'
import { UseValidationPipe } from '../shared/pipes'
import { ViewExtensionService } from './view-extension.service'
import { parseParameterOptionsQuery, parseViewQuery } from './view-extension.utils'

class ExecuteViewActionDto {
	@IsOptional()
	@IsString()
	targetId?: string

	@IsOptional()
	@IsObject()
	input?: Record<string, unknown>

	@IsOptional()
	@IsObject()
	parameters?: Record<string, XpertViewScalar | XpertViewScalar[]>
}

@ApiTags('ViewExtension')
@ApiBearerAuth()
@UseInterceptors(TransformInterceptor)
@Controller()
export class ViewExtensionController {
	constructor(private readonly service: ViewExtensionService) {}

	@Get(':hostType/:hostId/slots/:slot/views')
	async getSlotViews(
		@Param('hostType') hostType: string,
		@Param('hostId') hostId: string,
		@Param('slot') slot: string
	) {
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

	@Get(':hostType/:hostId/views/:viewKey/manifest')
	async getViewManifest(
		@Param('hostType') hostType: string,
		@Param('hostId') hostId: string,
		@Param('viewKey') viewKey: string
	) {
		return this.service.getViewManifest(hostType, hostId, viewKey)
	}

	@Get(':hostType/:hostId/views/:viewKey/remote-component/entry')
	async getRemoteComponentEntry(
		@Param('hostType') hostType: string,
		@Param('hostId') hostId: string,
		@Param('viewKey') viewKey: string,
		@Res({ passthrough: true }) response: Response
	) {
		const entry = await this.service.getRemoteComponentEntry(hostType, hostId, viewKey)
		response.setHeader('Content-Type', entry.contentType ?? 'text/html; charset=utf-8')
		response.setHeader('Cache-Control', 'no-store')
		return entry.html
	}

	@Get(':hostType/:hostId/views/:viewKey/parameters/:parameterKey/options')
	async getViewParameterOptions(
		@Param('hostType') hostType: string,
		@Param('hostId') hostId: string,
		@Param('viewKey') viewKey: string,
		@Param('parameterKey') parameterKey: string,
		@Query() query: Record<string, string | string[] | undefined>
	) {
		return this.service.getViewParameterOptions(
			hostType,
			hostId,
			viewKey,
			parameterKey,
			parseParameterOptionsQuery(query)
		)
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

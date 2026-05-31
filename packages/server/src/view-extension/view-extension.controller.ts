import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import {
	BadRequestException,
	Body,
	Controller,
	Get,
	Param,
	Post,
	Query,
	Res,
	UploadedFile,
	UseInterceptors
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
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

type UploadedViewActionFile = {
	buffer: Buffer
	originalname?: string
	mimetype?: string
	size?: number
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

	@Post(':hostType/:hostId/views/:viewKey/actions/:actionKey/file')
	@UseInterceptors(FileInterceptor('file'))
	async executeFileAction(
		@Param('hostType') hostType: string,
		@Param('hostId') hostId: string,
		@Param('viewKey') viewKey: string,
		@Param('actionKey') actionKey: string,
		@UploadedFile() file: UploadedViewActionFile | undefined,
		@Body() body: Record<string, unknown>
	) {
		if (!file?.buffer?.length) {
			throw new BadRequestException('file is required')
		}
		return this.service.executeFileAction(
			hostType,
			hostId,
			viewKey,
			actionKey,
			parseMultipartActionBody(body),
			file
		)
	}
}

function parseMultipartActionBody(body: Record<string, unknown> | undefined): ExecuteViewActionDto {
	const targetId = normalizeOptionalString(body?.targetId)
	return {
		targetId,
		input: parseOptionalObject(body?.input, 'input') ?? undefined,
		parameters: parseOptionalObject(body?.parameters, 'parameters') as
			| Record<string, XpertViewScalar | XpertViewScalar[]>
			| undefined
	}
}

function parseOptionalObject(value: unknown, fieldName: string): Record<string, unknown> | undefined {
	if (value === undefined || value === null || value === '') {
		return undefined
	}
	const parsed = typeof value === 'string' ? parseJson(value, fieldName) : value
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
		throw new BadRequestException(`${fieldName} must be a JSON object`)
	}
	return parsed as Record<string, unknown>
}

function parseJson(value: string, fieldName: string): unknown {
	try {
		return JSON.parse(value)
	} catch {
		throw new BadRequestException(`${fieldName} must be valid JSON`)
	}
}

function normalizeOptionalString(value: unknown): string | undefined {
	return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

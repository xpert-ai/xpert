import { IShareSkillPackageInput } from '@xpert-ai/contracts'
import { PaginationParams, ParseJsonPipe, TransformInterceptor } from '@xpert-ai/server-core'
import {
	BadRequestException,
	Body,
	Controller,
	Delete,
	Get,
	Param,
	Post,
	Put,
	Query,
	UploadedFile,
	UseGuards,
	UseInterceptors
} from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { getErrorMessage } from '@xpert-ai/server-common'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { FileInterceptor } from '@nestjs/platform-express'
import { SkillPackage } from './skill-package.entity'
import { SkillPackageService } from './skill-package.service'
import { WorkspaceGuard } from '../xpert-workspace'
import { SimpleSkillPackageDTO } from './dto'

@ApiTags('Skill Package')
@UseInterceptors(TransformInterceptor)
@Controller('skill-package')
export class SkillPackageController {
	constructor(private readonly service: SkillPackageService) {}

	@UseGuards(WorkspaceGuard)
	@Get('by-workspace/:workspaceId')
	async getAllByWorkspace(
		@Param('workspaceId') workspaceId: string,
		@Query('data', ParseJsonPipe) data: PaginationParams<SkillPackage>,
		@Query('published') published?: boolean
	) {
		const result = await this.service.getAllByWorkspace(workspaceId, data, published, RequestContext.currentUser())
		return {
			...result,
			items: result.items.map((item) => new SimpleSkillPackageDTO(item))
		}
	}

	@Post('install')
	async installSkillPackage(@Body() body: { workspaceId: string; indexId: string }) {
		try {
			return await this.service.installSkillPackage(body.workspaceId, body.indexId)
		} catch (error) {
			throw new BadRequestException(`Failed to install skill package: ${getErrorMessage(error)}`)
		}
	}

	@UseGuards(WorkspaceGuard)
	@Post('workspace/:workspaceId/install')
	async installSkillPackageInWorkspace(@Param('workspaceId') workspaceId: string, @Body() body: { indexId: string }) {
		try {
			return await this.service.installSkillPackage(workspaceId, body.indexId)
		} catch (error) {
			throw new BadRequestException(`Failed to install skill package: ${getErrorMessage(error)}`)
		}
	}

	@Delete('uninstall')
	async uninstallSkillPackage(@Body() body: string[]) {
		await Promise.all(body.map((id) => this.service.uninstallSkillPackage(id)))
	}

	@UseGuards(WorkspaceGuard)
	@Delete('workspace/:workspaceId/:id')
	async uninstallSkillPackageInWorkspace(@Param('workspaceId') workspaceId: string, @Param('id') id: string) {
		await this.service.uninstallSkillPackageInWorkspace(workspaceId, id)
	}

	@UseGuards(WorkspaceGuard)
	@Post('workspace/:workspaceId/upload')
	@UseInterceptors(FileInterceptor('file'))
	async uploadSkillPackage(@Param('workspaceId') workspaceId: string, @UploadedFile() file: Express.Multer.File) {
		try {
			return await this.service.uploadSkillPackagesFromFile(workspaceId, file)
		} catch (error) {
			throw new BadRequestException(`Failed to upload skill package: ${getErrorMessage(error)}`)
		}
	}

	@UseGuards(WorkspaceGuard)
	@Post('workspace/:workspaceId/:id/share')
	async shareSkillPackage(
		@Param('workspaceId') workspaceId: string,
		@Param('id') id: string,
		@Body() body: IShareSkillPackageInput
	) {
		try {
			return await this.service.shareSkillPackage(workspaceId, id, body)
		} catch (error) {
			throw new BadRequestException(`Failed to share skill package: ${getErrorMessage(error)}`)
		}
	}

	@UseGuards(WorkspaceGuard)
	@Get('workspace/:workspaceId/:id/files')
	async getSkillPackageFiles(
		@Param('workspaceId') workspaceId: string,
		@Param('id') id: string,
		@Query('path') path?: string,
		@Query('deepth') deepth?: string
	) {
		return this.service.getSkillPackageFiles(workspaceId, id, path, deepth ? Number(deepth) : undefined)
	}

	@UseGuards(WorkspaceGuard)
	@Get('workspace/:workspaceId/:id/file')
	async getSkillPackageFile(
		@Param('workspaceId') workspaceId: string,
		@Param('id') id: string,
		@Query('path') path: string
	) {
		return this.service.readSkillPackageFile(workspaceId, id, path)
	}

	@UseGuards(WorkspaceGuard)
	@Put('workspace/:workspaceId/:id/file')
	async saveSkillPackageFile(
		@Param('workspaceId') workspaceId: string,
		@Param('id') id: string,
		@Body() body: { path: string; content: string }
	) {
		return this.service.saveSkillPackageFile(workspaceId, id, body?.path, body?.content)
	}
}

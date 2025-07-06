import { IProject } from '@metad/contracts'
import { CrudController, ParseJsonPipe, UUIDValidationPipe } from '@metad/server-core'
import {
	Body,
	ClassSerializerInterceptor,
	Controller,
	Delete,
	Get,
	HttpCode,
	HttpStatus,
	Param,
	Put,
	Query,
	UseInterceptors,
	UsePipes,
	ValidationPipe
} from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { FindManyOptions, UpdateResult } from 'typeorm'
import { ProjectDTO } from './dto/project.dto'
import { Project } from './project.entity'
import { ProjectService } from './project.service'
import { ProjectGetQuery, ProjectMyQuery } from './queries'

@ApiTags('Project')
@ApiBearerAuth()
@Controller()
export class ProjectController extends CrudController<Project> {
	constructor(
		private readonly projectService: ProjectService,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {
		super(projectService)
	}

	@UseInterceptors(ClassSerializerInterceptor)
	@Get('my')
	async findMy(@Query('$query', ParseJsonPipe) options: FindManyOptions) {
		const { relations } = options ?? {}
		const { items, total } = await this.queryBus.execute(
			new ProjectMyQuery({
				relations
			})
		)
		return {
			total,
			items: items.map((item) => new ProjectDTO(item))
		}
	}

	@Get('select-options')
	async getSelectOptions() {
		const { items, total } = await this.queryBus.execute<ProjectMyQuery, { items: IProject[]; total: number }>(
			new ProjectMyQuery({
				relations: []
			})
		)
		return items.map((item) => ({
			value: item.id,
			label: item.name
		}))
	}

	@ApiOperation({ summary: 'Find by id' })
	@ApiResponse({
		status: HttpStatus.OK,
		description: 'Found one record' /*, type: T*/
	})
	@ApiResponse({
		status: HttpStatus.NOT_FOUND,
		description: 'Record not found'
	})
	@UseInterceptors(ClassSerializerInterceptor)
	@Get(':id')
	async findOne(@Param('id') id: string, @Query('$query', ParseJsonPipe) options: FindManyOptions): Promise<Project> {
		const { relations } = options ?? {}
		return this.queryBus.execute(
			new ProjectGetQuery({
				id,
				options: {
					relations
				}
			})
		)
	}

	@UseInterceptors(ClassSerializerInterceptor)
	@Put(':id/models')
	async updateModels(@Param('id') id: string, @Body() models: string[]) {
		const project = await this.projectService.updateModels(id, models)
		return new ProjectDTO(project)
	}

	@Delete(':id/models/:modelId')
	async deleteModel(@Param('id') id: string, @Param('modelId') modelId: string) {
		await this.projectService.deleteModel(id, modelId)
	}

	@UseInterceptors(ClassSerializerInterceptor)
	@Put(':id/members')
	async updateMembers(@Param('id') id: string, @Body() members: string[]) {
		const project = await this.projectService.updateMembers(id, members)
		return new ProjectDTO(project)
	}

	@Delete(':id/members/:memberId')
	async deleteMember(@Param('id') id: string, @Param('memberId') memberId: string) {
		await this.projectService.deleteMember(id, memberId)
	}

	@UseInterceptors(ClassSerializerInterceptor)
	@Put(':id/certifications')
	async updateCertifications(@Param('id') id: string, @Body() certifications: string[]) {
		const project = await this.projectService.updateCertifications(id, certifications)
		return new ProjectDTO(project)
	}

	@Delete(':id/certifications/:certificationId')
	async deleteCertification(@Param('id') id: string, @Param('certificationId') certificationId: string) {
		await this.projectService.deleteCertification(id, certificationId)
	}

	@UseInterceptors(ClassSerializerInterceptor)
	@Put(':id/files')
	async updateFiles(@Param('id') id: string, @Body() files: string[]) {
		const project = await this.projectService.updateFiles(id, files)
		return new ProjectDTO(project)
	}

	@Delete(':id/files/:fileId')
	async deleteFile(@Param('id') id: string, @Param('fileId') fileId: string) {
		await this.projectService.removeFile(id, fileId)
	}

	/**
	 * Restore soft deleted project
	 *
	 * @param projectId
	 * @returns
	 */
	@ApiOperation({ summary: 'Resort soft delete record' })
	@ApiResponse({
		status: HttpStatus.OK,
		description: 'The record has been successfully restore'
	})
	@ApiResponse({
		status: HttpStatus.NOT_FOUND,
		description: 'Record not found'
	})
	@HttpCode(HttpStatus.ACCEPTED)
	@Put(':id/restore')
	@UsePipes(new ValidationPipe({ whitelist: true }))
	async restoreSoftDelete(@Param('id', UUIDValidationPipe) projectId: IProject['id']): Promise<UpdateResult> {
		return await this.projectService.restoreSoftDelete(projectId)
	}

	/**
	 * Soft delete bi project
	 *
	 * @param projectId
	 * @returns
	 */
	@ApiOperation({ summary: 'Soft delete record' })
	@ApiResponse({
		status: HttpStatus.OK,
		description: 'The record has been successfully deleted'
	})
	@ApiResponse({
		status: HttpStatus.NOT_FOUND,
		description: 'Record not found'
	})
	@HttpCode(HttpStatus.ACCEPTED)
	@Delete(':id')
	@UsePipes(new ValidationPipe({ whitelist: true }))
	async delete(@Param('id', UUIDValidationPipe) projectId: string): Promise<Project | UpdateResult> {
		return await this.projectService.softDelete(projectId)
	}
}

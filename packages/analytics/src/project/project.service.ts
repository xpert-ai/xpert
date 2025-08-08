import { IStorageFile, IUser } from '@metad/contracts'
import { TenantOrganizationAwareCrudService } from '@metad/server-core'
import { Injectable } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { Project } from './project.entity'

@Injectable()
export class ProjectService extends TenantOrganizationAwareCrudService<Project> {
	constructor(
		@InjectRepository(Project) repository: Repository<Project>,
		readonly commandBus: CommandBus
	) {
		super(repository)
	}

	async updateModels(id: string, models: string[]) {
		const project = await this.findOne(id)
		project.models = models.map((id) => ({ id }))
		await this.repository.save(project)

		return await this.findOne(id, { relations: ['models'] })
	}

	async deleteModel(id: string, modelId: string) {
		const project = await this.findOne(id, { relations: ['models'] })
		project.models = project.models.filter(({ id }) => id !== modelId)
		await this.repository.save(project)
	}

	async updateMembers(id: string, members: string[]) {
		const project = await this.findOne(id)
		project.members = members.map((id) => ({ id }) as IUser)
		await this.repository.save(project)

		return await this.findOne(id, { relations: ['members'] })
	}

	async deleteMember(id: string, memberId: string) {
		const project = await this.findOne(id, { relations: ['members'] })
		project.members = project.members.filter(({ id }) => id !== memberId)
		await this.repository.save(project)
	}

	async updateCertifications(id: string, certifications: string[]) {
		const project = await this.findOne(id)
		project.certifications = certifications.map((id) => ({ id }) as IUser)
		await this.repository.save(project)

		return await this.findOne(id, { relations: ['certifications'] })
	}

	async deleteCertification(id: string, certificationId: string) {
		const project = await this.findOne(id, { relations: ['certifications'] })
		project.certifications = project.certifications.filter(({ id }) => id !== certificationId)
		await this.repository.save(project)
	}

	async updateFiles(id: string, files: string[]) {
		const project = await this.findOne(id)
		project.files = files.map((id) => ({ id }) as IStorageFile)
		await this.repository.save(project)

		return await this.findOne(id, { relations: ['files'] })
	}

	async removeFile(id: string, fileId: string) {
		const project = await this.findOne(id, { relations: ['files'] })
		project.files = project.files.filter(({ id }) => id !== fileId)
		await this.repository.save(project)
	}
}

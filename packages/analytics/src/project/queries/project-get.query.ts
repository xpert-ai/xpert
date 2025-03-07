import { IQuery } from '@nestjs/cqrs'
import { FindManyOptions } from 'typeorm'
import { Project } from '../project.entity'

/**
 * Get a single project, will check my permissions
 */
export class ProjectGetQuery implements IQuery {
	static readonly type = '[Project] Get'

	constructor(public readonly input: {
		id: string
		options?: Pick<FindManyOptions<Project>, 'relations'> & Pick<FindManyOptions<Project>, 'where'>
	}) {}
}

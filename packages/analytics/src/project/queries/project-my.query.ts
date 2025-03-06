import { IQuery } from '@nestjs/cqrs'
import { FindManyOptions } from 'typeorm'
import { Project } from '../project.entity'

/**
 * Query the list of projects I have permission to
 */
export class ProjectMyQuery implements IQuery {
	static readonly type = '[Project] My'

	constructor(public readonly input: Pick<FindManyOptions<Project>, 'relations'> & Pick<FindManyOptions<Project>, 'where'>) {}
}

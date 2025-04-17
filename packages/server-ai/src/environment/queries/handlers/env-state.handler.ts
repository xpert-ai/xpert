import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { EnvironmentService } from '../../environment.service'
import { EnvStateQuery } from '../env-state.query'
import { toEnvState } from '../../utils'

@QueryHandler(EnvStateQuery)
export class EnvStateHandler implements IQueryHandler<EnvStateQuery> {
	constructor(private readonly service: EnvironmentService) {}

	public async execute(command: EnvStateQuery) {
		const env = await this.service.getDefaultByWorkspace(command.workspaceId)
		return toEnvState(env)
	}
}

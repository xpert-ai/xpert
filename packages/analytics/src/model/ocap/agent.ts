import { ISemanticModel } from '@metad/contracts'
import { Agent, AgentStatus, AgentStatusEnum, AgentType, DataSourceOptions, uuid } from '@metad/ocap-core'
import { RequestContext } from '@metad/server-core'
import { Injectable } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { EMPTY, Observable, from } from 'rxjs'
import { ModelOlapQuery } from '../queries'

@Injectable()
export class ProxyAgent implements Agent {
	type: AgentType = AgentType.Server

	constructor(private readonly queryBus: QueryBus) {}

	selectStatus(): Observable<AgentStatus | AgentStatusEnum> {
		return EMPTY
	}
	selectError(): Observable<any> {
		return EMPTY
	}
	error(err: any): void {}
	async request(model: ISemanticModel & {isDraft?: boolean}, options: any): Promise<any> {
		const user = RequestContext.currentUser()

		const result = await this.queryBus.execute(
			new ModelOlapQuery(
				{
					id: uuid(),
					organizationId: RequestContext.getOrganizationId(),
					sessionId: model.id,
					dataSourceId: model.dataSource.id,
					modelId: model.id,
					body: options.body,
					acceptLanguage: options.headers.acceptLanguage,
					forceRefresh: options.forceRefresh,
					isDraft: model.isDraft
				},
				user
			)
		)
		return result.data
	}
	_request(dataSource: DataSourceOptions, options: any): Observable<any> {
		return from(this.request(dataSource, options))
	}
}

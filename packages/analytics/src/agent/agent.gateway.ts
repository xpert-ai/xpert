import { ICopilot, IUser } from '@metad/contracts'
import { getErrorMessage } from '@metad/server-common'
import { runWithRequestContext, WsJWTGuard, WsUser } from '@metad/server-core'
import { CopilotTokenRecordCommand } from '@metad/server-ai'
import { UseGuards } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import {
	ConnectedSocket,
	MessageBody,
	OnGatewayDisconnect,
	SubscribeMessage,
	WebSocketGateway,
	WebSocketServer,
	WsResponse
} from '@nestjs/websockets'
import { Observable, from } from 'rxjs'
import { map } from 'rxjs/operators'
import { Server, Socket } from 'socket.io'
import { DataSourceOlapQuery } from '../data-source'
import { ModelOlapQuery, ModelCubeQuery } from '../model'

@WebSocketGateway({
	cors: {
		origin: '*'
	}
})
export class EventsGateway implements OnGatewayDisconnect {
	@WebSocketServer()
	server: Server

	constructor(private readonly queryBus: QueryBus, private readonly commandBus: CommandBus) {}

	@UseGuards(WsJWTGuard)
	@SubscribeMessage('olap')
	async olap(
		@MessageBody() data: any,
		@ConnectedSocket() client: Socket,
		@WsUser() user: IUser
	): Promise<WsResponse<any>> {
		const { id, organizationId, dataSourceId, modelId, body, acceptLanguage, forceRefresh } = data
		return new Promise((resolve, reject) => {
			runWithRequestContext({ user: user, headers: { ['organization-id']: organizationId } }, async () => {
				try {
					let result = null
					if (modelId) {
						if (typeof body === 'string') {
							result = await this.queryBus.execute(
								new ModelOlapQuery(
									{
										id,
										sessionId: client.id,
										dataSourceId,
										modelId,
										body,
										acceptLanguage,
										forceRefresh
									},
									user
								)
							)
						} else {
							result = await this.queryBus.execute(
								new ModelCubeQuery(
									{
										id,
										sessionId: client.id,
										dataSourceId,
										modelId,
										body,
										acceptLanguage,
										forceRefresh
									},
									user
								)
							)
						}
					} else {
						result = await this.queryBus.execute(
							new DataSourceOlapQuery(
								{ id, sessionId: client.id, dataSourceId, body, forceRefresh, acceptLanguage },
								user
							)
						)
					}
					return resolve({
						event: 'olap',
						data: {
							id,
							status: 200,
							data: result.data,
							cache: result.cache
						}
					})
				} catch (error) {
					return resolve({
						event: 'olap',
						data: {
							id,
							status: 500,
							statusText: error.message ?? 'Internal Server Error',
							data: getErrorMessage(error)
						}
					})
				}
			})
		})
	}

	@UseGuards(WsJWTGuard)
	@SubscribeMessage('copilot')
	async copilot(@MessageBody() data: Partial<{organizationId: string; copilot: ICopilot; tokenUsed: number}>, @WsUser() user: IUser): Promise<void> {
		try {
			await this.commandBus.execute(new CopilotTokenRecordCommand({
				...data, 
				tenantId: user.tenantId,
				userId: user.id,
				copilotId: data.copilot?.id
			}))
		} catch (error) {
			console.log(error);
		}
	}

	@UseGuards(WsJWTGuard)
	@SubscribeMessage('events')
	findAll(@MessageBody() data: any): Observable<WsResponse<number>> {
		return from([1, 2, 3]).pipe(map((item) => ({ event: 'events', data: item })))
	}

	@UseGuards(WsJWTGuard)
	@SubscribeMessage('identity')
	async identity(@MessageBody() data: number): Promise<number> {
		return data
	}

	handleDisconnect(client: Socket) {
		// console.log(`disconnect `, client.id)
	}
}

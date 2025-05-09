import { ICopilot, IUser, TGatewayQueryEvent } from '@metad/contracts'
import { CopilotTokenRecordCommand } from '@metad/server-ai'
import { WsJWTGuard, WsUser } from '@metad/server-core'
import { CACHE_MANAGER, Inject, UseGuards } from '@nestjs/common'
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
import { Cache } from 'cache-manager'
import { from, Observable } from 'rxjs'
import { map } from 'rxjs/operators'
import { Server, Socket } from 'socket.io'
import { SemanticModelQueryCommand } from '../model/commands'
import { GetOnePublicSemanticModelQuery } from '../model/queries'

@WebSocketGateway({
	cors: {
		origin: '*'
	}
})
export class EventsGateway implements OnGatewayDisconnect {
	@WebSocketServer()
	server: Server

	constructor(
		private readonly queryBus: QueryBus,
		private readonly commandBus: CommandBus,
		@Inject(CACHE_MANAGER)
		private readonly cacheManager: Cache
	) {}

	@UseGuards(WsJWTGuard)
	@SubscribeMessage('olap')
	async olap(
		@MessageBody() data: TGatewayQueryEvent,
		@ConnectedSocket() client: Socket,
		@WsUser() user: IUser
	): Promise<WsResponse<any>> {
		await this.commandBus.execute(new SemanticModelQueryCommand({ sessionId: client.id, userId: user.id, data }))
		return
	}

	@SubscribeMessage('public_olap')
	async publicOlap(
		@MessageBody() data: TGatewayQueryEvent,
		@ConnectedSocket() client: Socket,
		@WsUser() user: IUser
	): Promise<WsResponse<any>> {
		const modelId = data.modelId
		let model = await this.cacheManager.get(`olap:model:` + modelId)
		if (!model) {
			// Check visibility (must be public) of semantic model
			model = await this.queryBus.execute(new GetOnePublicSemanticModelQuery(modelId))
			await this.cacheManager.set(`olap:model:` + modelId, model, { ttl: 1000 * 60 })
		}

		await this.commandBus.execute(new SemanticModelQueryCommand({ sessionId: client.id, userId: user?.id, data }))
		return
	}

	@UseGuards(WsJWTGuard)
	@SubscribeMessage('copilot')
	async copilot(
		@MessageBody() data: Partial<{ organizationId: string; copilot: ICopilot; tokenUsed: number }>,
		@WsUser() user: IUser
	): Promise<void> {
		try {
			await this.commandBus.execute(
				new CopilotTokenRecordCommand({
					...data,
					tenantId: user.tenantId,
					userId: user.id,
					copilotId: data.copilot?.id
				})
			)
		} catch (error) {
			console.log(error)
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

	sendQueryResult(sessionId: string, data: any) {
		this.server.to(sessionId).emit('olap', data)
	}
}

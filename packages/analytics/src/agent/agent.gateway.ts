import { ICopilot, IUser, TGatewayQueryEvent } from '@metad/contracts'
import { CopilotTokenRecordCommand } from '@metad/server-ai'
import { WsJWTGuard, WsUser } from '@metad/server-core'
import { InjectQueue } from '@nestjs/bull'
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
import { Queue } from 'bull'
import { from, Observable } from 'rxjs'
import { map } from 'rxjs/operators'
import { Server, Socket } from 'socket.io'
import { SemanticModelQueryCommand } from '../model/commands'
import { QUERY_QUEUE_NAME } from '../model/types'

@WebSocketGateway({
	cors: {
		origin: '*'
	}
})
export class EventsGateway implements OnGatewayDisconnect {
	@WebSocketServer()
	server: Server

	constructor(
		@InjectQueue(QUERY_QUEUE_NAME) private readonly queryQueue: Queue,
		private readonly queryBus: QueryBus,
		private readonly commandBus: CommandBus
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

import { ChatGatewayEvent, ChatGatewayMessage, ChatMessage, IUser } from '@metad/contracts'
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
import { WsJWTGuard, WsUser } from '@metad/server-core'
import { from, map, Observable, switchMap } from 'rxjs'
import { Server, Socket } from 'socket.io'
import { CancelChatCommand, ChatWSCommand } from './commands'

@WebSocketGateway({
	namespace: 'chat',
	cors: {
		origin: '*'
	}
})
export class ChatEventsGateway implements OnGatewayDisconnect {
	@WebSocketServer()
	server: Server

	constructor(
		private readonly queryBus: QueryBus,
		private readonly commandBus: CommandBus
	) {}

	@UseGuards(WsJWTGuard)
	@SubscribeMessage('message')
	message(
		@MessageBody() data: ChatGatewayMessage,
		@ConnectedSocket() client: Socket,
		@WsUser() user: IUser
	): Observable<WsResponse<ChatMessage>> {
		// Confirm receipt of the message immediately.
		client.emit('message', {
			event: ChatGatewayEvent.ACK,
			data
		})

		// Cancel the chat conversation
		if (data.event === ChatGatewayEvent.CancelChain) {
			return from(this.commandBus.execute(
				new CancelChatCommand({
					...data,
					tenantId: user.tenantId,
					user,
				})
			))
		}

		// Chat
		return from(
			this.commandBus.execute(
				new ChatWSCommand({
					...data,
					tenantId: user.tenantId,
					user,
				})
			)
		).pipe(
			switchMap((res) => res),
			map((result: ChatMessage) => ({
				event: 'message',
				data: result
			}))
		)
	}

	handleDisconnect(client: Socket) {
		// console.log(`disconnect `, client.id)
	}
}

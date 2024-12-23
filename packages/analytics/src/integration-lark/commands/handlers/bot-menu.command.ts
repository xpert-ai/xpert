import { IChatBIModel } from '@metad/contracts'
import { LarkBotMenuCommand, LarkMessage } from '@metad/server-ai'
import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { map, Observable, of } from 'rxjs'
import { UserSessionCommand } from '../../../chatbi'
import { ChatBIBotMenuPrefix } from '../../types'

@CommandHandler(LarkBotMenuCommand)
export class LarkBotMenuHandler implements ICommandHandler<LarkBotMenuCommand> {
	constructor(private readonly commandBus: CommandBus) {}

	public async execute(command: LarkBotMenuCommand): Promise<Observable<LarkMessage>> {
		const { input } = command

		const { event_key, operator } = input.message

		if (event_key.startsWith(ChatBIBotMenuPrefix)) {
			const parts = event_key.split(':')
			const chatModelId = parts[1].trim()
			const chatModel = await this.commandBus.execute<UserSessionCommand, IChatBIModel>(
				new UserSessionCommand({
					tenantId: input.tenant.id,
					organizationId: input.organizationId,
					chatModelId,
					userId: operator.operator_id.open_id
				})
			)

			return of(`你选择了数据集： ${chatModel.entityCaption}`).pipe(
				map(
					(content: string) =>
						({
							params: {
								receive_id_type: 'open_id'
							},
							data: {
								receive_id: input.message.operator.operator_id.open_id,
								content: JSON.stringify({ text: content }),
								msg_type: 'text'
							}
						}) as LarkMessage
				)
			)
		}

		return of(null)
	}
}

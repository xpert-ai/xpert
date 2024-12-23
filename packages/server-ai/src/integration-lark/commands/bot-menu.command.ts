import { ITenant } from '@metad/contracts'
import { ICommand } from '@nestjs/cqrs'

export class LarkBotMenuCommand implements ICommand {
	static readonly type = '[Lark] BotMenu'

	constructor(
		public readonly input: {
			tenant: ITenant
			organizationId: string
			message: {
				schema: '2.0' | '1.0'
				event_id: string
				token: string
				create_time: string
				event_type: 'application.bot.menu_v6'
				tenant_key: string
				app_id: string
				event_key: string
				operator: {
					operator_id: {
						open_id: string
						union_id: string
						user_id: string
					}
				}
				timestamp: number
			}
		}
	) {}
}

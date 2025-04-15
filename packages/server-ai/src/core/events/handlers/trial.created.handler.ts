// import { AiProvider } from '@metad/contracts'
// import { TrialUserCreatedEvent, UserService } from '@metad/server-core'
// import { CommandBus, IEventHandler } from '@nestjs/cqrs'
// import { EventsHandler } from '@nestjs/cqrs/dist/decorators/events-handler.decorator'
// import { CopilotOrganizationService } from '../../../copilot-organization'

// const COPILOT_OPENAI_TOKEN_LIMIT = 1000000

// @EventsHandler(TrialUserCreatedEvent)
// export class TrialUserCreatedHandler implements IEventHandler<TrialUserCreatedEvent> {
// 	constructor(
// 		private readonly userService: UserService,
// 		private readonly copilotOrganizationService: CopilotOrganizationService,
// 		private readonly commandBus: CommandBus
// 	) {}

// 	async handle(event: TrialUserCreatedEvent) {
// 		const { userId, organizationId } = event
// 		const user = await this.userService.findOne(userId)

// 		// Init copilot organization token limit
// 		await this.copilotOrganizationService.upsert({
// 			tenantId: user.tenantId,
// 			organizationId,
// 			provider: AiProvider.OpenAI,
// 			tokenLimit: COPILOT_OPENAI_TOKEN_LIMIT
// 		})
// 	}
// }

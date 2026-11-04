import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { AssertBusinessAreaAccessCommand } from './assert-business-area-access.command'
import { BusinessAreaAccessService } from './business-area-access.service'

@CommandHandler(AssertBusinessAreaAccessCommand)
export class AssertBusinessAreaAccessHandler implements ICommandHandler<AssertBusinessAreaAccessCommand> {
	constructor(private readonly access: BusinessAreaAccessService) {}
	execute(command: AssertBusinessAreaAccessCommand) {
		return this.access.assertAccess(command.businessAreaId, command.action)
	}
}

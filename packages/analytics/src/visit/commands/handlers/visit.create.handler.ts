import { VisitEntityEnum } from '@metad/contracts'
import { RequestContext } from '@metad/server-core'
import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { Indicator, SemanticModel, Story } from '../../../core/entities/internal'
import { Visit } from '../../visit.entity'
import { VisitService } from '../../visit.service'
import { VisitCreateCommand } from '../visit.create.command'


@CommandHandler(VisitCreateCommand)
export class VisitCreateHandler implements ICommandHandler<VisitCreateCommand> {
	constructor(
		private readonly commandBus: CommandBus,
		@InjectRepository(Visit)
		private readonly repo: Repository<Visit>,
		private readonly visitService: VisitService,
		@InjectRepository(Story)
		private readonly storyRepo: Repository<Story>,
		@InjectRepository(SemanticModel)
		private readonly modelRepo: Repository<SemanticModel>,
		@InjectRepository(Indicator)
		private readonly indicatorRepo: Repository<Indicator>
	) {}

	public async execute(command: VisitCreateCommand): Promise<void> {
		const visit = command.input

		visit.createdById = RequestContext.currentUserId()
		visit.visitAt = Number(new Date().toISOString().slice(0, 10).replace(/-/g, ''))

		const exist = await this.visitService.findOneOrFail({
			where: visit
		})

		if (exist.success) {
			exist.record.visits += 1
			this.repo.save(exist.record)
		} else {
			visit.visits = 1

			if (visit.entity === VisitEntityEnum.Story) {
				visit.story = await this.storyRepo.findOneBy({id: visit.entityId})
			} else if (visit.entity === VisitEntityEnum.SemanticModel) {
				visit.model = await this.modelRepo.findOneBy({id: visit.entityId})
			} else if (visit.entity === VisitEntityEnum.Indicator) {
				visit.indicator = await this.indicatorRepo.findOneBy({id: visit.entityId})
			}

			this.visitService.create(visit)
		}
	}
}

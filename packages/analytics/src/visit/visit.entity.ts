import { IVisit, VisitEntityEnum, VisitTypeEnum } from '@metad/contracts'
import { TenantOrganizationBaseEntity } from '@metad/server-core'
import { Column, Entity, ManyToOne } from 'typeorm'
import { Indicator, SemanticModel, Story } from '../core/entities/internal'

@Entity('visit')
export class Visit extends TenantOrganizationBaseEntity implements IVisit {

	@Column({ type: 'varchar', nullable: true })
	type: VisitTypeEnum

	@Column({ type: 'varchar', nullable: true })
	entity: VisitEntityEnum

	@Column({ nullable: true })
	entityId: string

	@Column({ nullable: true })
	entityName?: string

	@Column({ nullable: true })
	businessAreaId?: string

	@Column({type: 'int8', nullable: true })
	visitAt: number

	@Column({})
	visits: number

	@ManyToOne(() => Story, (story) => story.visits, {
		onDelete: 'CASCADE',
	})
  	story: Story

	@ManyToOne(() => SemanticModel, (model) => model.visits, {
		onDelete: 'CASCADE',
	})
	model: SemanticModel

	@ManyToOne(() => Indicator, (indicator) => indicator.visits, {
		onDelete: 'CASCADE',
	})
  	indicator: Indicator
}

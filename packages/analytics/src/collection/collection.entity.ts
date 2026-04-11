import { ICollection } from '@xpert-ai/contracts'
import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsString } from 'class-validator'
import { Column, Entity, TreeChildren, TreeParent } from 'typeorm'
import { ProjectBaseEntity } from '../core/entities/project-base.entity'

@Entity('collection')
export class Collection extends ProjectBaseEntity implements ICollection {
	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	name?: string

	@TreeChildren()
	children?: ICollection[]

	@ApiPropertyOptional({ type: () => Collection })
	@TreeParent({
		onDelete: 'CASCADE'
	})
	parent?: ICollection

	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	parentId?: string
}

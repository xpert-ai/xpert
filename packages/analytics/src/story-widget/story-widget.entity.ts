import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IStory, IStoryPoint, IStoryWidget, Visibility } from '@metad/contracts'
import { TenantOrganizationBaseEntity } from '@metad/server-core'
import { IsJSON, IsOptional, IsString } from 'class-validator'
import { Column, Entity, JoinColumn, ManyToOne, RelationId } from 'typeorm'
import { Story } from '../story/story.entity'
import { StoryPoint } from '../story-point/story-point.entity'


@Entity('story_widget')
export class StoryWidget extends TenantOrganizationBaseEntity implements IStoryWidget
{
	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	key?: string

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	name?: string

	/**
	 * Story
	 */
	@ApiProperty({ type: () => Story })
	@ManyToOne(() => Story, (d) => d.widgets, {nullable: true, onDelete: 'CASCADE'})
	@JoinColumn()
	story?: IStory

	@ApiProperty({ type: () => String })
	@RelationId((it: StoryWidget) => it.story)
	@IsString()
	@Column({ nullable: true })
	storyId: string

	@ApiProperty({ type: () => String })
	@IsString()
	@RelationId((it: StoryWidget) => it.point)
	@Column({ nullable: true })
	pointId: string

	/**
	 * Story Point
	 */
	@ApiProperty({ type: () => StoryPoint })
	@ManyToOne(() => StoryPoint, (d) => d.widgets, {
		nullable: true,
		onDelete: 'CASCADE',
	})
	@JoinColumn()
	point?: IStoryPoint

	@ApiPropertyOptional({ type: () => Object })
	@IsJSON()
	@IsOptional()
	@Column({ type: 'json', nullable: true })
	options?: any

	@IsOptional()
	@Column({ type: 'varchar', nullable: true })
	visibility?: Visibility
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IStory, IStoryPoint, IStoryWidget } from '@xpert-ai/contracts';
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core';
import { IsJSON, IsOptional, IsString } from 'class-validator';
import {
	Column, Entity,
	JoinColumn, ManyToOne, OneToMany, RelationId
} from 'typeorm';
import { Story, StoryWidget } from '../core/entities/internal';

@Entity('story_point')
export class StoryPoint extends TenantOrganizationBaseEntity implements IStoryPoint {

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	key?: string
    
    @ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	name?: string;

    /**
	 * Story
	 */
	@ApiProperty({ type: () => Story })
	@ManyToOne(() => Story, (d) => d.points, {
		onDelete: 'CASCADE'
	})
	@JoinColumn()
	story?: IStory
  
	@ApiProperty({ type: () => String })
	@RelationId((it: StoryPoint) => it.story)
	@IsString()
	@Column()
	storyId: string

    @ApiPropertyOptional({ type: () => Object })
	@IsJSON()
	@IsOptional()
    @Column({ type: 'json', nullable: true})
    options?: any;

	/**
	 * Story Widgets
	 */
	@ApiProperty({ type: () => StoryWidget, isArray: true })
	@OneToMany(() => StoryWidget, (m) => m.point, {
		cascade: true
	})
	widgets?: IStoryWidget[]
}

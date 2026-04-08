import { IScreenshot, IStory, IStoryTemplate, ITag, StoryTemplateType } from '@metad/contracts'
import { Tag, TenantOrganizationBaseEntity } from '@metad/server-core'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsBoolean, IsJSON, IsOptional, IsString } from 'class-validator'
import { Column, Entity, JoinColumn, JoinTable, ManyToMany, OneToMany, OneToOne, RelationId } from 'typeorm'
import { Screenshot, Story } from '../core/entities/internal'

@Entity('story_template')
export class StoryTemplate extends TenantOrganizationBaseEntity implements IStoryTemplate {
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

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	description?: string

	@ApiPropertyOptional({ type: () => String, enum: StoryTemplateType })
	@IsString()
	@IsOptional()
	@Column({ type: 'varchar', nullable: true })
	type?: StoryTemplateType

	@ApiPropertyOptional({ type: () => Boolean })
	@IsBoolean()
	@IsOptional()
	@Column({ default: false, nullable: true })
	isPublic?: boolean

	// Tags
	@ManyToMany(() => Tag, { cascade: true })
	@JoinTable({
		name: 'tag_story_template',
		joinColumn: {
			name: 'template_id', // Name of the column referencing the StoryTemplate entity
			referencedColumnName: 'id'
		},
		inverseJoinColumn: {
			name: 'tag_id', // Name of the column referencing the Tag entity
			referencedColumnName: 'id'
		}
	})
	tags?: ITag[]

	@ApiPropertyOptional({ type: () => Object })
	@IsJSON()
	@IsOptional()
	@Column({ type: 'json', nullable: true })
	options?: any

	@ApiProperty({ type: () => String })
	@RelationId((it: StoryTemplate) => it.story)
	@IsString()
	@Column({ nullable: true })
	storyId?: string

	@OneToOne(() => Story, (story) => story.asTemplate)
	@JoinColumn()
	story: IStory

	@ApiProperty({ type: () => String })
	@RelationId((it: StoryTemplate) => it.preview)
	@IsString()
	@Column({ nullable: true })
	previewId?: string

	@OneToOne(() => Screenshot, {
		cascade: ['remove']
	})
	@JoinColumn()
	preview: IScreenshot

	@ApiProperty({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	thumbnail?: string

	/*
    |--------------------------------------------------------------------------
    | @OneToMany
    |--------------------------------------------------------------------------
    */
	@OneToMany(() => Story, (m) => m.template, {
		nullable: true,
		cascade: false
	})
	stories?: IStory[]

	storyCount?: number
}

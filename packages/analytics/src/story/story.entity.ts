import {
	IBusinessArea,
	ICollection,
	IScreenshot,
	ISemanticModel,
	IStory,
	IStoryPoint,
	IStoryTemplate,
	IStoryWidget,
	ISubscription,
	ITag,
	IVisit,
	StoryStatusEnum,
	Visibility
} from '@metad/contracts'
import { Tag } from '@metad/server-core'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsJSON, IsOptional, IsString } from 'class-validator'
import { Column, Entity, JoinColumn, JoinTable, ManyToMany, ManyToOne, OneToMany, OneToOne, RelationId } from 'typeorm'
import {
	BusinessArea,
	Collection,
	Screenshot,
	StoryPoint,
	StoryTemplate,
	StoryWidget,
	Subscription,
	Visit,
	SemanticModel
} from '../core/entities/internal'
import { ProjectBaseEntity } from '../core/entities/project-base.entity'


@Entity('story')
export class Story extends ProjectBaseEntity implements IStory {
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

	@ApiProperty({ type: () => String, enum: StoryStatusEnum })
	@Column({ type: 'varchar', nullable: true, default: StoryStatusEnum.DRAFT })
	status?: StoryStatusEnum

	/**
	 * Collection
	 */
	@ApiProperty({ type: () => Collection })
	@ManyToOne(() => Collection, {
		nullable: true
	})
	@JoinColumn()
	collection?: ICollection

	@ApiProperty({ type: () => String })
	@RelationId((it: Story) => it.collection)
	@IsString()
	@Column({ nullable: true })
	collectionId?: string

	/**
	 * BusinessArea
	 */
	@ApiProperty({ type: () => BusinessArea })
	@ManyToOne(() => BusinessArea, (businessArea) => businessArea.stories, {
		nullable: true,
		onDelete: 'CASCADE'
	})
	@JoinColumn()
	businessArea?: IBusinessArea

	@ApiProperty({ type: () => String })
	@RelationId((it: Story) => it.businessArea)
	@IsString()
	@Column({ nullable: true })
	businessAreaId?: string

	/**
	 * Model
	 */
	@ApiProperty({ type: () => SemanticModel })
	@ManyToOne(() => SemanticModel, (d) => d.stories, {
		nullable: true,
		onDelete: 'CASCADE'
	})
	@JoinColumn()
	model?: ISemanticModel

	@ApiProperty({ type: () => String })
	@RelationId((it: Story) => it.model)
	@IsString()
	@Column({ nullable: true })
	modelId?: string

	// Semantic Models
	@ManyToMany(() => SemanticModel, (model) => model.stories, {
        onUpdate: 'CASCADE',
		onDelete: 'CASCADE'
    })
	@JoinTable({
		name: 'story_model'
	})
	models?: ISemanticModel[]

	@ApiPropertyOptional({ type: () => Object })
	@IsJSON()
	@IsOptional()
	@Column({ type: 'json', nullable: true })
	options?: any

	// Tags
	@ManyToMany(() => Tag)
	@JoinTable({
		name: 'tag_story'
	})
	tags?: ITag[]

	@IsOptional()
	@Column({ type: 'varchar', nullable: true })
	visibility?: Visibility

	@IsOptional()
	@Column({ nullable: true })
	thumbnail?: string

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

	/**
	 * Story Points
	 */
	@ApiProperty({ type: () => StoryPoint, isArray: true })
	@OneToMany(() => StoryPoint, (m) => m.story, {
		cascade: true
	})
	points?: IStoryPoint[]

	@ApiProperty({ type: () => StoryWidget, isArray: true })
	@OneToMany(() => StoryWidget, (m) => m.story, {
		nullable: true,
		cascade: true
	})
	widgets?: IStoryWidget[]

	@ApiProperty({ type: () => Subscription, isArray: true })
	@OneToMany(() => Subscription, (m) => m.story, {
		cascade: true
	})
	subscriptions?: ISubscription[]

	@OneToMany(() => Visit, (m) => m.story, {
		nullable: true,
		cascade: true
	})
	visits?: IVisit[]

	@ApiProperty({ type: () => String })
	@RelationId((it: Story) => it.template)
	@IsString()
	@Column({ nullable: true })
	templateId?: string
	
	@ManyToOne(() => StoryTemplate, (d) => d.stories, {
		nullable: true,
		createForeignKeyConstraints: false
	})
	@JoinColumn()
	template?: IStoryTemplate

	@OneToOne(() => StoryTemplate, (template) => template.story)
	asTemplate?: IStoryTemplate

	// Inner states
	@ApiProperty({ type: () => Number })
	pv?: number
}

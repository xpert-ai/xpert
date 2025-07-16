import {
	IBusinessArea,
	IDataSource,
	IFavorite,
	IIndicator,
	IModelQuery,
	IModelRole,
	ISemanticModel,
	ISemanticModelEntity,
	ISemanticModelMember,
	ISemanticModelPreferences,
	IStory,
	ITag,
	IUser,
	IVisit,
	ModelTypeEnum,
	SemanticModelStatusEnum,
	TSemanticModelDraft,
	TSemanticModelOptions,
	Visibility
} from '@metad/contracts'
import { Schema } from '@metad/ocap-core'
import { Tag, TenantOrganizationBaseEntity, User } from '@metad/server-core'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsEnum, IsJSON, IsNotEmpty, IsOptional, IsString } from 'class-validator'
import { Column, Entity, JoinColumn, JoinTable, ManyToMany, ManyToOne, OneToMany, RelationId } from 'typeorm'
import {
	BusinessArea,
	DataSource,
	Favorite,
	Indicator,
	ModelQuery,
	SemanticModelCache,
	SemanticModelEntity,
	SemanticModelMember,
	SemanticModelRole,
	Story,
	Visit
} from '../core/entities/internal'

/**
 * Semantic Model Entity
 */
@Entity('semantic_model')
export class SemanticModel extends TenantOrganizationBaseEntity implements ISemanticModel {

	@ApiPropertyOptional({ type: () => Object })
	@IsJSON()
	@IsOptional()
	@Column({ type: 'json', nullable: true })
	draft?: TSemanticModelDraft

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

	@ApiProperty({ type: () => String, enum: ModelTypeEnum })
	@IsEnum(ModelTypeEnum)
	@IsOptional()
	@Column({ nullable: true })
	type?: string

	@ApiProperty({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	catalog?: string

	@ApiProperty({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	cube?: string

	@ApiPropertyOptional({ type: () => Object })
	@IsJSON()
	@IsOptional()
	@Column({ type: 'json', nullable: true })
	options?: TSemanticModelOptions<Schema>

	@ApiProperty({ type: () => String, enum: SemanticModelStatusEnum })
	@Column({ nullable: true, default: SemanticModelStatusEnum.Progressing })
	status?: SemanticModelStatusEnum

	@ApiProperty({ type: () => User })
	@ManyToOne(() => User)
	@JoinColumn()
	owner: IUser

	@ApiProperty({ type: () => String })
	@RelationId((it: SemanticModel) => it.owner)
	@IsString()
	@Column({ nullable: true })
	ownerId: string

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	releaseNotes?: string

	@ApiProperty({
		type: 'string',
		format: 'date-time',
		example: '2023-11-21T06:20:32.232Z'
	})
	@IsOptional()
	@Column({ nullable: true, type: 'timestamptz' })
	publishAt?: Date

	// Members
	@ManyToMany(() => User)
	@JoinTable({
		name: 'semantic_model_members'
	})
	members?: IUser[]

	// Tags
	@ManyToMany(() => Tag)
	@JoinTable({
		name: 'tag_semantic_model'
	})
	tags?: ITag[]

	/**
	 * DataSource
	 */
	@ApiProperty({ type: () => SemanticModel })
	@ManyToOne(() => DataSource, (d) => d.models, {
		nullable: true,
		onDelete: 'CASCADE'
	})
	@JoinColumn()
	dataSource?: IDataSource

	@ApiProperty({ type: () => String })
	@RelationId((it: SemanticModel) => it.dataSource)
	@IsString()
	@IsNotEmpty()
	@Column({ nullable: true })
	dataSourceId?: string

	/**
	 * BusinessArea
	 */
	@ApiProperty({ type: () => BusinessArea })
	@ManyToOne(() => BusinessArea, (businessArea) => businessArea.models, {
		nullable: true,
		onDelete: 'CASCADE'
	})
	@JoinColumn()
	businessArea?: IBusinessArea

	@ApiProperty({ type: () => String })
	@RelationId((it: SemanticModel) => it.businessArea)
	@IsString()
	@Column({ nullable: true })
	businessAreaId?: string

	@IsJSON()
	@IsOptional()
	@Column({ type: 'json', nullable: true })
	preferences?: ISemanticModelPreferences

	@IsOptional()
	@Column({ nullable: true })
	visibility?: Visibility

	/**
	 * Stories
	 */
	@ApiProperty({ type: () => Story, isArray: true })
	@ManyToMany(() => Story, (story) => story.models, {
		onDelete: "CASCADE"
	})
	stories?: IStory[]

	/**
	 * Indicators
	 */
	@ApiProperty({ type: () => Indicator, isArray: true })
	@OneToMany(() => Indicator, (m) => m.model, {
		cascade: true
	})
	@JoinColumn()
	indicators?: IIndicator[]

	/**
	 * Cache
	 */
	@ApiProperty({ type: () => SemanticModelCache, isArray: true })
	@OneToMany(() => SemanticModelCache, (m) => m.model, {
		cascade: true
	})
	cache?: SemanticModelCache[]

	@ApiProperty({ type: () => Favorite, isArray: true })
	@OneToMany(() => Favorite, (m) => m.model)
	favorites?: IFavorite[]

	/**
	 * Queries
	 */
	@ApiProperty({ type: () => ModelQuery, isArray: true })
	@OneToMany(() => ModelQuery, (m) => m.model, {
		cascade: true
	})
	@JoinColumn()
	queries?: IModelQuery[]

	/**
	 * Roles
	 */
	@ApiProperty({ type: () => SemanticModelRole, isArray: true })
	@OneToMany(() => SemanticModelRole, (m) => m.model, {
		cascade: ['insert', 'update', 'remove']
	})
	roles?: IModelRole[]

	@OneToMany(() => Visit, (m) => m.model, {
		nullable: true,
		cascade: true,
	})
	visits?: IVisit[]

	/**
	 * Dimension Members
	 */
	@OneToMany(() => SemanticModelMember, (m) => m.model, {
		nullable: true,
		cascade: true,
	})
	dimensionMembers?: ISemanticModelMember[]

	/**
	 * Entities ( cubes and dimensions )
	 */
	@OneToMany(() => SemanticModelEntity, (m) => m.model, {
		nullable: true,
		cascade: true,
	})
	entities?: ISemanticModelEntity[]
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import {
  IBusinessArea,
  IIndicator,
  ISemanticModel,
  IndicatorType,
  ITag,
  Visibility,
  IVisit,
  IComment,
  ICertification,
  IndicatorStatusEnum,
  EmbeddingStatusEnum,
} from '@metad/contracts'
import { Tag } from '@metad/server-core'
import { IsEnum, IsJSON, IsOptional, IsString } from 'class-validator'
import {
  Column,
  Entity,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  OneToMany,
  RelationId,
} from 'typeorm'
import { BusinessArea, SemanticModel, Visit, Comment, Certification } from '../core/entities/internal'
import { ProjectBaseEntity } from '../core/entities/project-base.entity'


@Entity('indicator')
export class Indicator extends ProjectBaseEntity implements IIndicator {
  @ApiPropertyOptional({ type: () => String })
  @IsString()
  @IsOptional()
  @Column({ nullable: true })
  code?: string

  @ApiPropertyOptional({ type: () => String })
  @IsString()
  @IsOptional()
  @Column({ nullable: true })
  name?: string
  
  @ApiPropertyOptional({ type: () => Boolean })
  @IsOptional()
  @Column({ nullable: true })
  isActive?: boolean

  @ApiPropertyOptional({ type: () => Boolean })
  @IsOptional()
  @Column({ nullable: true })
  visible?: boolean

  @ApiPropertyOptional({ type: () => Boolean })
  @IsOptional()
  @Column({ nullable: true })
  isApplication ?: boolean

  @IsOptional()
	@Column({ nullable: true })
	visibility?: Visibility

  /**
   * BusinessArea
   */
  @ApiPropertyOptional({ type: () => BusinessArea })
  @ManyToOne(() => BusinessArea, (g) => g.indicators, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn()
  businessArea?: IBusinessArea

  @ApiProperty({ type: () => String })
  @RelationId((it: Indicator) => it.businessArea)
  @IsString()
  @Column({ nullable: true })
  businessAreaId?: string

  // Indicator Tags
  @ManyToMany(() => Tag, {cascade: true, eager: true})
  @JoinTable({
    name: 'tag_indicator',
  })
  tags?: ITag[]

  @ApiProperty({ type: () => String, enum: IndicatorType })
  @IsEnum(IndicatorType)
  @IsOptional()
  @Column({ nullable: true })
  type?: IndicatorType

  /**
   * Model
   */
  @ApiProperty({ type: () => SemanticModel })
  @ManyToOne(() => SemanticModel, (d) => d.indicators, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn()
  model?: ISemanticModel

  @ApiProperty({ type: () => String })
  @RelationId((it: Indicator) => it.model)
  @IsString()
  @Column({ nullable: true })
  modelId?: string

  @ApiProperty({ type: () => String })
  @IsString()
  @IsOptional()
  @Column({ nullable: true })
  entity?: string

  @ApiProperty({ type: () => String })
  @IsString()
  @IsOptional()
  @Column({ nullable: true })
  unit?: string

  @ApiProperty({ type: () => String })
  @IsString()
  @IsOptional()
  @Column({ nullable: true })
  principal?: string

  @ApiProperty({ type: () => String })
  @IsString()
  @IsOptional()
  @Column({ nullable: true })
  authentication?: string

  @ApiProperty({ type: () => String })
  @IsString()
  @IsOptional()
  @Column({ nullable: true })
  validity?: string

  @ApiProperty({ type: () => String })
  @IsString()
  @IsOptional()
  @Column({ nullable: true })
  business?: string

  @ApiProperty({ type: () => String })
  @IsString()
  @IsOptional()
  @Column({ nullable: true })
  status?: IndicatorStatusEnum

  @ApiProperty({ type: () => String, enum: EmbeddingStatusEnum })
  @IsEnum(EmbeddingStatusEnum)
  @IsOptional()
  @Column({ nullable: true })
  embeddingStatus?: EmbeddingStatusEnum

  @ApiProperty({ type: () => String })
  @IsString()
  @IsOptional()
  @Column({ nullable: true })
  error?: string

  @ApiPropertyOptional({ type: () => Object })
  @IsJSON()
  @IsOptional()
  @Column({ type: 'json', nullable: true })
  options?: IIndicator['options']

  /**
   * Many to One relations
   */
  @ApiProperty({ type: () => String })
  @IsString()
  @IsOptional()
  @RelationId((it: Indicator) => it.certification)
  @Column({ nullable: true })
  certificationId?: string

  @ApiProperty({ type: () => Certification })
	@ManyToOne(() => Certification)
	@JoinColumn()
  certification?: ICertification
  
  /**
   * One to Many relations
   */
  @OneToMany(() => Visit, (m) => m.indicator, {
		nullable: true,
		cascade: true,
	})
	visits?: IVisit[]

  @OneToMany(() => Comment, (m) => m.indicator, {
		nullable: true,
		cascade: true,
	})
	comments?: IComment[]
  
}

import { ApiProperty } from '@nestjs/swagger'
import {
    BusinessType,
    IFavorite,
    ISemanticModel,
    IStory,
    IIndicator
} from '@metad/contracts'
import { IsString, IsEnum, IsOptional } from 'class-validator'
import {
    Column,
    Entity,
    JoinColumn,
    ManyToOne,
    RelationId,
} from 'typeorm'
import { Story } from '../story/story.entity'
import { Indicator } from '../indicator/indicator.entity'
import { SemanticModel } from '../model/model.entity'
import { ProjectBaseEntity } from '../core/entities/project-base.entity'

@Entity('favorite')
export class Favorite extends ProjectBaseEntity implements IFavorite {

    @ApiProperty({ type: () => String, enum: BusinessType })
	@IsEnum(BusinessType)
	@IsOptional()
	@Column({ type: 'varchar', nullable: true })
	type?: BusinessType

    /**
     * Model
     */
    @ApiProperty({ type: () => String })
    @RelationId((it: Favorite) => it.model)
    @IsString()
    @Column({ nullable: true })
    modelId?: string

    @ApiProperty({ type: () => SemanticModel })
    @ManyToOne(() => SemanticModel, {
        onDelete: 'CASCADE'
    })
    @JoinColumn()
    model?: ISemanticModel

    /**
     * Story
     */
    @ApiProperty({ type: () => String })
    @RelationId((it: Favorite) => it.story)
    @IsString()
    @Column({ nullable: true })
    storyId?: string
    
    @ApiProperty({ type: () => Story })
    @ManyToOne(() => Story, {
        onDelete: 'CASCADE'
    })
    @JoinColumn()
    story?: IStory
  
    /**
     * Indicator
     */
    @ApiProperty({ type: () => String })
    @RelationId((it: Favorite) => it.indicator)
    @IsString()
    @Column({ nullable: true })
    indicatorId?: string

    @ApiProperty({ type: () => Indicator })
    @ManyToOne(() => Indicator, {
        onDelete: 'CASCADE'
    })
    @JoinColumn()
    indicator?: IIndicator
}

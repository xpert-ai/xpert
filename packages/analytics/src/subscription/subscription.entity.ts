import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { INotificationDestination, IStory, ISubscription, SubscriptionType } from '@metad/contracts';
import { TenantOrganizationBaseEntity } from '@metad/server-core';
import { IsJSON, IsBoolean, IsOptional, IsString, IsEnum } from 'class-validator';
import {
    Column,
    Entity,
    ManyToOne,
    JoinColumn,
    RelationId
} from 'typeorm';
import { NotificationDestination, Story } from '../core/entities/internal';

@Entity('subscription')
export class Subscription extends TenantOrganizationBaseEntity implements ISubscription {

    @ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	name: string

	/**
	 * DataSourceType
	 */
	// @ApiProperty({ type: () => SubscriptionType })
    // @IsEnum(SubscriptionType)
    @Column({ type: 'varchar', nullable: true })
	type: SubscriptionType

    @ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	description?: string
    
    @ApiPropertyOptional({ type: () => Boolean })
	@IsBoolean()
	@IsOptional()
	@Column({ nullable: true })
    enable?: boolean

    /**
	 * Story
	 */
	@ApiProperty({ type: () => Story })
	@ManyToOne(() => Story, (d) => d.subscriptions, {
		nullable: true,
		onDelete: 'CASCADE'
	})
	@JoinColumn()
	story?: IStory
  
	@ApiProperty({ type: () => String })
	@RelationId((it: Subscription) => it.story)
	@IsString()
	@Column()
	storyId?: string

    @ApiProperty({ type: () => String })
	@IsString()
	@Column({ nullable: true })
	pointId?: string

    @ApiProperty({ type: () => String })
	@IsString()
	@Column({ nullable: true })
	widgetId?: string

    /**
	 * Story
	 */
	@ApiProperty({ type: () => NotificationDestination })
	@ManyToOne(() => NotificationDestination, (d) => d.subscriptions, {
		nullable: true,
		onDelete: 'CASCADE'
	})
	@JoinColumn()
    destination?: INotificationDestination

    @ApiProperty({ type: () => String })
    @RelationId((it: Subscription) => it.destination)
	@IsString()
	@Column({ nullable: true })
    destinationId?: string

    @ApiPropertyOptional({ type: () => Object })
	@IsJSON()
	@IsOptional()
    @Column({ type: 'json', nullable: true})
    options?: any

}

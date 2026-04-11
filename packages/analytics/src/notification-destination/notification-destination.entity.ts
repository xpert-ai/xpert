import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { INotificationDestination, ISubscription } from '@xpert-ai/contracts';
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core';
import { IsJSON, IsOptional, IsString } from 'class-validator';
import { Subscription } from '../subscription/subscription.entity';
import {
    Column,
    Entity,
	OneToMany,
	JoinColumn
} from 'typeorm';

@Entity('notification_destination')
export class NotificationDestination extends TenantOrganizationBaseEntity implements INotificationDestination {

    @ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	name: string;

	/**
	 * DataSourceType
	 */
	@ApiProperty({ type: () => NotificationDestination })
    @Column({ nullable: true })
	type: string;

    
    @ApiPropertyOptional({ type: () => Object })
	@IsJSON()
	@IsOptional()
    @Column({ type: 'json', nullable: true})
    options?: any;

	/**
	 * Subscriptions
	 */
	@ApiProperty({ type: () => Subscription, isArray: true })
	@OneToMany(() => Subscription, (m) => m.destination, {
		cascade: true
	})
	@JoinColumn()
	subscriptions?: ISubscription[]
}

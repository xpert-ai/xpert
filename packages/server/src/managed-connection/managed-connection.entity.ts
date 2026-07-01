import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import type {
	ManagedConnectionDirection,
	ManagedConnectionStatus,
	ManagedConnectionTransportType
} from '@xpert-ai/plugin-sdk'
import { Column, Entity, Index } from 'typeorm'
import { TenantOrganizationBaseEntity } from '../core/entities/tenant-organization-base.entity'

@Entity('managed_connection')
@Index('managed_connection_global_key_uq', ['pluginName', 'connectionType', 'connectionKey'], {
	unique: true,
	where: '"tenantId" IS NULL AND "organizationId" IS NULL'
})
@Index('managed_connection_tenant_key_no_org_uq', ['pluginName', 'connectionType', 'connectionKey', 'tenantId'], {
	unique: true,
	where: '"tenantId" IS NOT NULL AND "organizationId" IS NULL'
})
@Index(
	'managed_connection_tenant_org_key_uq',
	['pluginName', 'connectionType', 'connectionKey', 'tenantId', 'organizationId'],
	{
		unique: true,
		where: '"tenantId" IS NOT NULL AND "organizationId" IS NOT NULL'
	}
)
@Index(['pluginName', 'connectionType', 'direction'])
@Index(['ownerInstanceId'])
@Index(['tenantId', 'organizationId'])
@Index(['leaseExpiresAt'])
export class ManagedConnectionEntity extends TenantOrganizationBaseEntity {
	@ApiProperty({ type: () => String })
	@Column()
	pluginName: string

	@ApiProperty({ type: () => String })
	@Column()
	connectionType: string

	@ApiProperty({ type: () => String })
	@Column()
	connectionKey: string

	@ApiProperty({ type: () => String })
	@Column({ type: 'varchar' })
	transportType: ManagedConnectionTransportType

	@ApiProperty({ type: () => String })
	@Column({ type: 'varchar', default: 'inbound' })
	direction: ManagedConnectionDirection

	@ApiProperty({ type: () => String })
	@Column()
	ownerInstanceId: string

	@ApiProperty({ type: () => String })
	@Column({ type: 'varchar', default: 'connected' })
	status: ManagedConnectionStatus

	@ApiPropertyOptional({ type: () => Date })
	@Column({ type: 'timestamptz', nullable: true })
	connectedAt?: Date | null

	@ApiPropertyOptional({ type: () => Date })
	@Column({ type: 'timestamptz', nullable: true })
	lastSeenAt?: Date | null

	@ApiPropertyOptional({ type: () => Date })
	@Column({ type: 'timestamptz', nullable: true })
	leaseExpiresAt?: Date | null

	@ApiPropertyOptional({ type: () => Date })
	@Column({ type: 'timestamptz', nullable: true })
	disconnectedAt?: Date | null

	@ApiPropertyOptional({ type: () => String })
	@Column({ nullable: true })
	remoteAddress?: string | null

	@ApiPropertyOptional({ type: () => Object })
	@Column({ type: 'jsonb', nullable: true })
	metadata?: Record<string, unknown> | null

	@ApiPropertyOptional({ type: () => String })
	@Column({ nullable: true })
	lastError?: string | null
}

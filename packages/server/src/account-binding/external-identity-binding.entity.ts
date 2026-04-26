import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsObject, IsOptional, IsString } from 'class-validator'
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { TenantBaseEntity, User } from '../core/entities/internal'

@Entity('external_identity_binding')
@Index('UQ_external_identity_binding_tenant_provider_subject', ['tenantId', 'provider', 'subjectId'], {
	unique: true
})
@Index('UQ_external_identity_binding_tenant_provider_user', ['tenantId', 'provider', 'userId'], {
	unique: true
})
export class ExternalIdentityBinding extends TenantBaseEntity {
	@ApiProperty({ type: () => String })
	@IsString()
	@Column()
	provider: string

	@ApiProperty({ type: () => String })
	@IsString()
	@Column()
	subjectId: string

	@ApiProperty({ type: () => String })
	@IsString()
	@Column()
	userId: string

	@ApiPropertyOptional({ type: () => User })
	@ManyToOne(() => User, {
		nullable: false,
		onDelete: 'CASCADE'
	})
	@JoinColumn({ name: 'userId' })
	user?: User

	@ApiPropertyOptional({ type: () => Object })
	@IsObject()
	@IsOptional()
	@Column({ type: 'jsonb', nullable: true })
	profile?: Record<string, any> | null
}

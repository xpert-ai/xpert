import { AiProvider, ICopilotOrganization, IOrganization } from '@xpert-ai/contracts'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsNumber, IsOptional, IsString } from 'class-validator'
import { Transform } from 'class-transformer'
import { Column, Entity, Index, JoinColumn, ManyToOne, RelationId } from 'typeorm'
import {
    Organization,
    OrganizationPublicDTO,
    TenantBaseEntity,
    TenantOrganizationBaseEntity
} from '@xpert-ai/server-core'
import { Copilot } from '../core/entities/internal'

const bigintNumberTransformer = {
    to: (value?: number | null) => value,
    from: (value: string | null) => (value !== null ? Number(value) : null)
}

@Entity('copilot_organization')
@Index('IDX_copilot_organization_scope_model', ['tenantId', 'organizationId', 'provider', 'model'])
@Index('IDX_copilot_organization_scope_copilot_model', ['tenantId', 'organizationId', 'copilotId', 'provider', 'model'])
export class CopilotOrganization extends TenantBaseEntity implements ICopilotOrganization {
    @ApiPropertyOptional({ type: () => String })
    @IsString()
    @IsOptional()
    @Column({ type: 'varchar', nullable: true, length: 100 })
    provider?: AiProvider | string

    @ApiPropertyOptional({ type: () => String })
    @IsString()
    @IsOptional()
    @Column({ nullable: true })
    model?: string

    @ApiPropertyOptional({ type: () => Number })
    @IsNumber()
    @IsOptional()
    @Column({ type: 'bigint', nullable: true, transformer: bigintNumberTransformer })
    tokenLimit?: number

    @ApiPropertyOptional({ type: () => Number })
    @IsNumber()
    @IsOptional()
    @Column({
        type: 'numeric',
        precision: 20,
        scale: 7,
        nullable: true,
        transformer: {
            to: (value?: number) => value,
            from: (value: string | null) => (value !== null ? parseFloat(value) : null)
        }
    })
    priceLimit?: number

    @ApiPropertyOptional({ type: () => Number })
    @IsNumber()
    @IsOptional()
    @Column({ type: 'bigint', nullable: true, default: 0, transformer: bigintNumberTransformer })
    tokenUsed?: number

    @ApiPropertyOptional({ type: () => Number })
    @IsNumber()
    @IsOptional()
    @Column({ type: 'bigint', nullable: true, default: 0, transformer: bigintNumberTransformer })
    tokenTotalUsed?: number

    @ApiPropertyOptional({ type: () => Number })
    @IsNumber()
    @IsOptional()
    @Column({
        type: 'numeric',
        precision: 20,
        scale: 7,
        nullable: true,
        transformer: {
            to: (value?: number) => value,
            from: (value: string | null) => (value !== null ? parseFloat(value) : null)
        }
    })
    priceUsed?: number

    @ApiPropertyOptional({ type: () => Number })
    @IsNumber()
    @IsOptional()
    @Column({
        type: 'numeric',
        precision: 20,
        scale: 7,
        nullable: true,
        transformer: {
            to: (value?: number) => value,
            from: (value: string | null) => (value !== null ? parseFloat(value) : null)
        }
    })
    priceTotalUsed?: number

    @ApiPropertyOptional({ type: () => String })
    @IsString()
    @IsOptional()
    @Column({ nullable: true })
    currency?: string

    /*
    |--------------------------------------------------------------------------
    | @ManyToOne 
    |--------------------------------------------------------------------------
    */
    @Transform(({ value }) => value && new OrganizationPublicDTO(value))
    @ApiProperty({ type: () => Organization, readOnly: true })
    @ManyToOne(() => Organization, {
        nullable: true,
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
    })
    @JoinColumn()
    @IsOptional()
    organization?: IOrganization

    @ApiProperty({ type: () => String, readOnly: true })
    @RelationId((it: TenantOrganizationBaseEntity) => it.organization)
    @IsString()
    @IsOptional()
    @Column({ nullable: true })
    organizationId?: string

    @ApiProperty({ type: () => Copilot })
    @ManyToOne(() => Copilot, {
        nullable: true,
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
    })
    @JoinColumn()
    copilot?: Copilot

    @ApiProperty({ type: () => String })
    @RelationId((it: CopilotOrganization) => it.copilot)
    @IsString()
    @Column({ nullable: true })
    copilotId?: string
}

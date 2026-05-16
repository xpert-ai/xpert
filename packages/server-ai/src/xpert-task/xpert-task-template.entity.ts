import { I18nObject, TScheduleOptions } from '@xpert-ai/contracts'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsBoolean, IsObject, IsOptional, IsString } from 'class-validator'
import { Column, Entity, Index } from 'typeorm'

@Entity('xpert_task_template')
@Index('uq_xpert_task_template_source_scope_key', ['source', 'tenantId', 'organizationId', 'createdById', 'key'], {
    unique: true
})
export class XpertTaskTemplate extends TenantOrganizationBaseEntity {
    @ApiPropertyOptional({ type: () => String })
    @IsOptional()
    @IsString()
    @Column({ nullable: true, length: 64 })
    source?: string | null

    @ApiProperty({ type: () => String })
    @IsString()
    @Column({ length: 120 })
    key: string

    @ApiProperty({ type: () => String })
    @IsString()
    @Column({ length: 160 })
    title: string

    @ApiProperty({ oneOf: [{ type: 'string' }, { type: 'object' }] })
    @Column({ type: 'json' })
    prompt: string | I18nObject

    @ApiPropertyOptional({ type: () => Object })
    @IsOptional()
    @IsObject()
    @Column({ type: 'json', nullable: true })
    defaultOptions?: TScheduleOptions | null

    @ApiPropertyOptional({ type: () => String })
    @IsOptional()
    @IsString()
    @Column({ nullable: true, length: 64 })
    icon?: string | null

    @ApiProperty({ type: () => Boolean })
    @IsBoolean()
    @Column({ default: false })
    builtin: boolean
}

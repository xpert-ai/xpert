import { XpertFrequentQuestionsSample } from '@xpert-ai/contracts'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsDate, IsJSON, IsOptional, IsString } from 'class-validator'
import { Column, Entity, Index } from 'typeorm'

@Entity('xpert_frequent_question_cache')
@Index(['tenantId', 'organizationId', 'xpertId', 'locale'], { unique: true })
export class XpertFrequentQuestionCache extends TenantOrganizationBaseEntity {
    @ApiPropertyOptional({ type: () => String })
    @IsString()
    @Column({ type: 'varchar' })
    xpertId: string

    @ApiPropertyOptional({ type: () => String })
    @IsString()
    @Column({ type: 'varchar', length: 32 })
    locale: string

    @ApiPropertyOptional({ type: () => Object })
    @IsJSON()
    @IsOptional()
    @Column({ type: 'json', nullable: true })
    questions?: string[]

    @ApiPropertyOptional({ type: () => Object })
    @IsJSON()
    @IsOptional()
    @Column({ type: 'json', nullable: true })
    sample?: XpertFrequentQuestionsSample

    @ApiPropertyOptional({ type: () => Date })
    @IsDate()
    @Column({ type: 'timestamptz' })
    generatedAt: Date

    @ApiPropertyOptional({ type: () => Date })
    @IsDate()
    @Column({ type: 'timestamptz' })
    expiresAt: Date
}

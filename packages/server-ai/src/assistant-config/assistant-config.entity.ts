import {
  AssistantCode,
  AssistantConfigOptions,
  IAssistantConfig
} from '@metad/contracts'
import { TenantOrganizationBaseEntity } from '@metad/server-core'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional
} from 'class-validator'
import { Column, Entity, Index } from 'typeorm'

@Entity('assistant_config')
@Index('IDX_assistant_config_org_unique', ['tenantId', 'organizationId', 'code'], {
  unique: true,
  where: '"organizationId" IS NOT NULL'
})
@Index('IDX_assistant_config_tenant_unique', ['tenantId', 'code'], {
  unique: true,
  where: '"organizationId" IS NULL'
})
export class AssistantConfig extends TenantOrganizationBaseEntity implements IAssistantConfig {
  @ApiProperty({ enum: AssistantCode })
  @IsEnum(AssistantCode)
  @IsNotEmpty()
  @Column({ type: 'varchar', length: 64 })
  code: AssistantCode

  @ApiProperty({ type: () => Boolean, default: true })
  @IsBoolean()
  @Column({ default: true })
  enabled: boolean

  @ApiPropertyOptional({ type: () => Object })
  @IsObject()
  @IsOptional()
  @Column({ type: 'json', nullable: true })
  options?: AssistantConfigOptions | null
}

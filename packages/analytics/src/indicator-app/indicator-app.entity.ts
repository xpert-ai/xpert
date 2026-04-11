import { ApiPropertyOptional } from '@nestjs/swagger'
import {
    IIndicatorApp,
} from '@xpert-ai/contracts'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { IsJSON, IsOptional } from 'class-validator'
import {
    Column,
    Entity
} from 'typeorm'

@Entity('indicator_app')
export class IndicatorApp extends TenantOrganizationBaseEntity implements IIndicatorApp {

  @ApiPropertyOptional({ type: () => Object })
  @IsJSON()
  @IsOptional()
  @Column({ type: 'json', nullable: true })
  options?: Record<string, unknown>
}

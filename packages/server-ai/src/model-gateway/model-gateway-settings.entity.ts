import { DEFAULT_MODEL_GATEWAY_BODY_RETENTION_DAYS, IModelGatewaySettings } from '@xpert-ai/contracts'
import { TenantBaseEntity } from '@xpert-ai/server-core'
import { ApiProperty } from '@nestjs/swagger'
import { Column, Entity, Index } from 'typeorm'

@Entity('model_gateway_settings')
@Index('IDX_model_gateway_settings_tenant', ['tenantId'], { unique: true })
export class ModelGatewaySettings extends TenantBaseEntity implements IModelGatewaySettings {
    @ApiProperty({ type: () => Boolean })
    @Column({ type: 'boolean', default: false })
    storeBodies: boolean

    @ApiProperty({ type: () => Number })
    @Column({ type: 'int', default: DEFAULT_MODEL_GATEWAY_BODY_RETENTION_DAYS })
    bodyRetentionDays: number
}

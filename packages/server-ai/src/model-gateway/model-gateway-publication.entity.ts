import { AiModelTypeEnum, IModelGatewayPublication, ModelFeature } from '@xpert-ai/contracts'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { ApiProperty } from '@nestjs/swagger'
import { Column, Entity, Index } from 'typeorm'

@Entity('model_gateway_publication')
@Index('IDX_model_gateway_publication_external_model', ['tenantId', 'externalModelId'], { unique: true })
@Index('IDX_model_gateway_publication_source', ['tenantId', 'copilotId', 'modelType', 'copilotModelId'], {
    unique: true
})
export class ModelGatewayPublication extends TenantOrganizationBaseEntity implements IModelGatewayPublication {
    @ApiProperty({ type: () => String })
    @Column({ type: 'uuid' })
    copilotId: string

    @ApiProperty({ type: () => String })
    @Column({ type: 'varchar' })
    copilotModelId: string

    @ApiProperty({ type: () => String })
    @Column({ type: 'varchar', length: 100 })
    provider: string

    @ApiProperty({ enum: AiModelTypeEnum })
    @Column({ type: 'varchar', length: 40 })
    modelType: AiModelTypeEnum

    @ApiProperty({ type: () => String })
    @Column({ type: 'varchar' })
    model: string

    @ApiProperty({ type: () => String })
    @Column({ type: 'varchar', length: 191 })
    externalModelId: string

    @ApiProperty({ enum: ModelFeature, isArray: true })
    @Column({ type: 'json', default: [] })
    capabilities: ModelFeature[]
}

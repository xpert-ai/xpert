import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsObject, IsUUID } from 'class-validator';
import { IBasePerTenantEntityModel, ID, ITenant } from '@xpert-ai/contracts';
import { IsTenantBelongsToUser } from '../../shared/validators';

export class TenantBaseDTO implements IBasePerTenantEntityModel {
	@ApiPropertyOptional({ type: () => Object })
	@IsOptional()
	@IsObject()
	@IsTenantBelongsToUser()
	readonly tenant: ITenant;

	@ApiPropertyOptional({ type: () => String })
	@IsOptional()
	@IsUUID()
	@IsTenantBelongsToUser()
	readonly tenantId: ID;
}
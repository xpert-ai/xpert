import { TenantOrganizationBaseDTO } from "@xpert-ai/server-core";
import { PickType } from "@nestjs/swagger";

/**
 * Delete query DTO
 *
 */
export class DeleteQueryDTO<T> extends PickType(TenantOrganizationBaseDTO, ['organizationId', 'tenantId']) { }
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { plainToClass, Transform, TransformFnParams, Type } from 'class-transformer';
import { IsNotEmpty, IsOptional, Max, Min, ValidateNested } from 'class-validator';
import { OrderTypeEnum } from '@metad/contracts';
import { parseToBoolean } from '@metad/server-common';
import { SimpleObjectLiteral, convertNativeParameters, parseObject } from './pagination.helper';
import { TenantOrganizationBaseDTO } from '../dto';


/**
 * Specifies what columns should be retrieved.
 */
export class OptionsSelect<T = any> {

	@ApiPropertyOptional({ type: () => Object })
	@IsOptional()
	@Transform(({ value }: TransformFnParams) => parseObject(value, parseToBoolean))
	readonly select?: (keyof T)[]
}

/**
 * Indicates what relations of entity should be loaded (simplified left join form).
*/
export class OptionsRelations<T = any> extends OptionsSelect<T> {

	@ApiPropertyOptional({ type: () => Object })
	@IsOptional()
	readonly relations?: string[];
}


export class OptionParams<T> extends OptionsRelations<T> {
	/**
	 * Order, in which entities should be ordered.
	 */
	@ApiPropertyOptional({ type: () => Object })
	@IsOptional()
	readonly order: { [P in keyof T]?: OrderTypeEnum };

	/**
	 * Simple condition that should be applied to match entities.
	 */
	@ApiProperty({ type: () => Object })
	@IsNotEmpty()
	@ValidateNested({ each: true })
	@Type(() => TenantOrganizationBaseDTO)
	@Transform(({ value }: TransformFnParams) => value ? escapeQueryWithParameters(value) : {})
	readonly where: Record<string, any>;

	/**
	* Indicates if soft-deleted rows should be included in entity result.
	*/
	@ApiPropertyOptional({ type: 'boolean' })
	@IsOptional()
	@Transform(({ value }: TransformFnParams) => value ? parseToBoolean(value) : false)
	readonly withDeleted: boolean;
}

/**
 * Describes generic pagination params
 */
export abstract class PaginationParams<T = any> extends OptionParams<T>  {
	/**
	 * Pagination limit
	 */
	@ApiPropertyOptional({ type: () => Number, minimum: 0, maximum: 50 })
	@IsOptional()
	@Min(0)
	@Max(50)
	@Transform((val: TransformFnParams) => parseInt(val as unknown as string, 10))
	readonly take: number = 10;

	/**
	 * Pagination offset
	 */
	@ApiPropertyOptional({ type: () => Number, minimum: 0 })
	@IsOptional()
	@Min(0)
	@Transform((val: TransformFnParams) => parseInt(val as unknown as string, 10))
	readonly skip: number = 0;
}

/**
 * Function to escape query parameters and convert to DTO class.
 * @param nativeParameters - The original query parameters.
 * @returns {TenantOrganizationBaseDTO} - The escaped and converted query parameters as a DTO instance.
 */
export function escapeQueryWithParameters(nativeParameters: SimpleObjectLiteral): TenantOrganizationBaseDTO {

	// Convert native parameters based on the database connection type
	const builtParameters: SimpleObjectLiteral = convertNativeParameters(nativeParameters);

	// Convert to DTO class using class-transformer's plainToClass
	return plainToClass(TenantOrganizationBaseDTO, builtParameters, { enableImplicitConversion: true });
}

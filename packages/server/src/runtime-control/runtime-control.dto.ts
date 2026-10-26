import {
	IRuntimeInstanceRetirementRequest,
	IRuntimePluginRequirement,
	RUNTIME_RESTART_CONFIRMATION
} from '@xpert-ai/contracts'
import { Type } from 'class-transformer'
import {
	ArrayMaxSize,
	IsArray,
	IsBoolean,
	IsIn,
	IsInt,
	IsNotEmpty,
	IsOptional,
	IsString,
	Max,
	MaxLength,
	Min,
	ValidateIf,
	ValidateNested
} from 'class-validator'

class RuntimePluginRequirementDto implements IRuntimePluginRequirement {
	@IsString()
	@MaxLength(300)
	scopeKey: string

	@IsString()
	@MaxLength(300)
	pluginName: string

	@IsOptional()
	@IsString()
	@MaxLength(100)
	version?: string

	@IsOptional()
	@IsString()
	@MaxLength(500)
	runtimeRevision?: string

	@IsIn(['loaded', 'absent'])
	state: 'loaded' | 'absent'
}

export class RuntimeRestartRequestDto {
	@IsIn([RUNTIME_RESTART_CONFIRMATION])
	confirmation: typeof RUNTIME_RESTART_CONFIRMATION

	@IsOptional()
	@IsString()
	@MaxLength(500)
	reason?: string

	@IsOptional()
	@IsBoolean()
	allowDowntime?: boolean

	@IsOptional()
	@IsArray()
	@ArrayMaxSize(100)
	@ValidateNested({ each: true })
	@Type(() => RuntimePluginRequirementDto)
	runtimeRequirements?: RuntimePluginRequirementDto[]

	@ValidateIf((_object, value) => value !== undefined)
	@IsInt()
	@Min(0)
	@Max(Number.MAX_SAFE_INTEGER)
	expectedGeneration?: number
}

export class RuntimeInstanceRetirementDto implements IRuntimeInstanceRetirementRequest {
	@IsString()
	@IsNotEmpty()
	@MaxLength(100)
	expectedBootId: string
}

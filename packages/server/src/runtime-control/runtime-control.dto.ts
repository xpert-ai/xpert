import { RUNTIME_RESTART_CONFIRMATION } from '@xpert-ai/contracts'
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator'

export class RuntimeRestartRequestDto {
	@IsIn([RUNTIME_RESTART_CONFIRMATION])
	confirmation: typeof RUNTIME_RESTART_CONFIRMATION

	@IsOptional()
	@IsString()
	@MaxLength(500)
	reason?: string
}

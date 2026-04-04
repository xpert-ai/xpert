import { ICustomSmtpCreateInput } from '@metad/contracts'
import { parseToBoolean } from '@metad/server-common'
import { ApiProperty, IntersectionType, PickType } from '@nestjs/swagger'
import { Transform, TransformFnParams } from 'class-transformer'
import { IsNotEmpty, IsString } from 'class-validator'
import { CustomSmtp } from './../custom-smtp.entity'
import { CustomSmtpQueryDTO } from './custom-smtp.query.dto'

/**
 * Create custom SMTP Request DTO validation
 */
export class CreateCustomSmtpDTO
	extends IntersectionType(
		PickType(CustomSmtp, ['fromAddress', 'host', 'port', 'secure', 'isValidate']),
		CustomSmtpQueryDTO
	)
	implements ICustomSmtpCreateInput
{
	@Transform(({ value }: TransformFnParams) => {
		if (value === undefined || value === null || value === '') {
			return value
		}

		return typeof value === 'number' ? value : Number(value)
	})
	readonly port: number

	@Transform(({ value }: TransformFnParams) => {
		if (value === undefined || value === null || value === '') {
			return value
		}

		return typeof value === 'boolean' ? value : parseToBoolean(value)
	})
	readonly secure: boolean

	@ApiProperty({ type: () => String })
	@IsNotEmpty()
	@IsString()
	readonly username: string

	@ApiProperty({ type: () => String })
	@IsNotEmpty()
	@IsString()
	readonly password: string
}

import { IUserPasswordInput } from '@xpert-ai/contracts'
import { ApiProperty } from '@nestjs/swagger'
import { IsNotEmpty, MinLength } from 'class-validator'

export class UserPasswordDTO implements IUserPasswordInput {
	@ApiProperty({ type: () => String, required: true })
	@IsNotEmpty({ message: 'Current password should not be empty' })
	hash?: string

	@ApiProperty({ type: () => String, required: true })
	@IsNotEmpty({ message: 'Password should not be empty' })
	@MinLength(6, {
		message: 'Password should be at least 6 characters long.'
	})
	password?: string
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Exclude, Expose } from 'class-transformer'
import { IsAscii, IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator'

@Exclude()
export class UserPublicDTO {

	@Expose()
	id: string

	@Expose()
	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	firstName?: string

	@Expose()
	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	lastName?: string

	@Expose()
	@ApiProperty({ type: () => String, minLength: 3, maxLength: 100 })
	@IsEmail()
	@IsNotEmpty()
	@IsOptional()
	email?: string

	@Expose()
	@ApiPropertyOptional({ type: () => String, minLength: 3, maxLength: 20 })
	@IsAscii()
	@MinLength(3)
	@MaxLength(20)
	@IsOptional()
	username?: string

	@Expose()
	@ApiPropertyOptional({ type: () => String, maxLength: 500 })
	@IsOptional()
	imageUrl?: string

    constructor(partial: Partial<UserPublicDTO>) {
        Object.assign(this, partial);
    }
}

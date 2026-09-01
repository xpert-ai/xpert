import { BadRequestException, ValidationPipe } from '@nestjs/common'
import { ApiProperty } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsString, MaxLength, MinLength } from 'class-validator'
import { t } from 'i18next'

export class XpertProjectAdminInterventionDTO {
    @ApiProperty({
        description: 'Audited reason for explicitly joining the Project as an Organization administrator',
        maxLength: 1000
    })
    @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
    @IsString()
    @MinLength(1)
    @MaxLength(1000)
    reason: string
}

export function createProjectAdminInterventionValidationPipe() {
    return new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        exceptionFactory: () =>
            new BadRequestException(
                t('server-ai:Error.ProjectAdminInterventionInvalid', {
                    defaultValue: 'A non-empty reason is required for Project administrator intervention.'
                })
            )
    })
}

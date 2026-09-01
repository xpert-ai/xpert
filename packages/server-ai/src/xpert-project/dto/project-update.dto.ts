import { TAvatar, TXpertProjectManagementMode, TXpertProjectSettings } from '@xpert-ai/contracts'
import { BadRequestException, ValidationPipe } from '@nestjs/common'
import { ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
    IsIn,
    IsNotEmpty,
    IsObject,
    IsString,
    MaxLength,
    ValidateIf,
    ValidateNested,
    ValidationError
} from 'class-validator'
import { t } from 'i18next'

export class ProjectSettingsUpdateDTO implements Pick<TXpertProjectSettings, 'mode' | 'managementMode'> {
    @ApiPropertyOptional({ enum: ['', 'plan'] })
    @ValidateIf(isProvided)
    @IsIn(['', 'plan'])
    mode?: '' | 'plan'

    @ApiPropertyOptional({ enum: ['simple', 'advanced'] })
    @ValidateIf(isProvided)
    @IsIn(['simple', 'advanced'])
    managementMode?: TXpertProjectManagementMode
}

/**
 * The ordinary Project update route only owns basic presentation and mode fields.
 * Ownership, lifecycle, content, capabilities, and relations use dedicated endpoints.
 */
export class ProjectUpdateInputDTO {
    @ApiPropertyOptional()
    @ValidateIf(isProvided)
    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    name?: string

    @ApiPropertyOptional({ type: () => Object })
    @ValidateIf(isProvided)
    @IsObject()
    avatar?: TAvatar

    @ApiPropertyOptional()
    @ValidateIf(isProvided)
    @IsString()
    @MaxLength(255)
    description?: string

    @ApiPropertyOptional({ type: () => ProjectSettingsUpdateDTO })
    @ValidateIf(isProvided)
    @ValidateNested()
    @Type(() => ProjectSettingsUpdateDTO)
    settings?: ProjectSettingsUpdateDTO
}

export function createProjectUpdateValidationPipe() {
    return new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        exceptionFactory: (errors: ValidationError[]) => {
            const field = findNonWhitelistedProperty(errors)
            return new BadRequestException(
                field
                    ? t('server-ai:Error.ProjectUpdateFieldNotAllowed', {
                          defaultValue:
                              'Project field "{{field}}" cannot be changed through the basic configuration endpoint.',
                          field
                      })
                    : t('server-ai:Error.ProjectUpdateInvalid', {
                          defaultValue: 'Project basic configuration is invalid.'
                      })
            )
        }
    })
}

function isProvided(_object: object, value: unknown): boolean {
    return value !== undefined
}

function findNonWhitelistedProperty(errors: ValidationError[], prefix = ''): string | undefined {
    for (const error of errors) {
        const property = prefix ? `${prefix}.${error.property}` : error.property
        if (error.constraints && Object.prototype.hasOwnProperty.call(error.constraints, 'whitelistValidation')) {
            return property
        }
        const nested = findNonWhitelistedProperty(error.children ?? [], property)
        if (nested) return nested
    }
    return undefined
}

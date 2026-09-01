import { ApiProperty } from '@nestjs/swagger'
import { BadRequestException, ValidationPipe } from '@nestjs/common'
import { IsUUID } from 'class-validator'
import { t } from 'i18next'

export class XpertTaskRunAsProposalDTO {
    @ApiProperty({ type: () => String })
    @IsUUID()
    runAsUserId: string
}

export function createXpertTaskRunAsProposalValidationPipe() {
    return new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        exceptionFactory: () =>
            new BadRequestException(
                t('server-ai:Error.ProjectTaskRunAsProposalInvalid', {
                    defaultValue: 'The run-as transfer proposal is invalid.'
                })
            )
    })
}

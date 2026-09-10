import { BadRequestException } from '@nestjs/common'
import { t } from 'i18next'
export function changeError(code: string): never {
    throw new BadRequestException(
        t('server-ai:Error.EvolutionChange', { defaultValue: 'Evolution cannot proceed: {{code}}', code })
    )
}

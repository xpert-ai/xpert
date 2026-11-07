import { BadRequestException } from '@nestjs/common'
import { GENERAL_PROJECT_TYPE, type XpertProjectTypeRef } from '@xpert-ai/contracts'
import { t } from 'i18next'

export function assertGroupProjectType(
    project: { applicationKey?: string; projectTypeKey?: string },
    required: XpertProjectTypeRef
) {
    const legacy = !project.applicationKey && !project.projectTypeKey
    const actual = legacy ? GENERAL_PROJECT_TYPE : project
    if (actual.applicationKey !== required.applicationKey || actual.projectTypeKey !== required.projectTypeKey)
        throw new BadRequestException(t('server-ai:Error.GroupProjectTypeUnsupported'))
}

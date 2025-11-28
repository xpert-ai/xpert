import { SetMetadata } from '@nestjs/common'

export const SKILL_SOURCE_PROVIDER = 'SKILL_SOURCE_PROVIDER'

export const SkillSourceProviderStrategy = (provider: string) => SetMetadata(SKILL_SOURCE_PROVIDER, provider)

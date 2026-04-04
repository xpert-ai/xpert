import { ClawHubSkillSourceProvider } from './clawhub'
import { GitHubSkillSourceProvider } from './github/index'
import { ZipSkillSourceProvider } from './zip'

export const SkillSourceProviders = [
	ClawHubSkillSourceProvider,
	GitHubSkillSourceProvider,
	ZipSkillSourceProvider
]

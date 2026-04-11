import { ClawHubSkillSourceProvider } from './clawhub'
import { GitHubSkillSourceProvider } from './github/index'
import { ZipSkillSourceProvider } from './zip'
import { WorkspacePublicSkillSourceProvider } from './workspace-public'

export const SkillSourceProviders = [
	ClawHubSkillSourceProvider,
	GitHubSkillSourceProvider,
	ZipSkillSourceProvider,
	WorkspacePublicSkillSourceProvider
]

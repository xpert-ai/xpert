import { ResolvePluginArtifactNamespaceHandler } from './resolve-plugin-artifact-namespace.handler'
import { GetPluginSkillDocumentHandler } from './get-plugin-skill-document.handler'
import { ResolveLatestPluginVersionHandler } from './resolve-latest-plugin-version.handler'

export const QueryHandlers = [
	ResolvePluginArtifactNamespaceHandler,
	GetPluginSkillDocumentHandler,
	ResolveLatestPluginVersionHandler
]

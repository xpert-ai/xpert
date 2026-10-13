import { Query } from '@nestjs/cqrs'

/** Resolve registered plugin metadata in the current actor's installation scope. */
export class ResolvePluginArtifactNamespaceQuery extends Query<string> {
	constructor(readonly pluginName: string) {
		super()
	}
}

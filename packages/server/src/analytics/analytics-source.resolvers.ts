import { Injectable } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import {
	ListAnalyticsSourcesCommand,
	ResolveAnalyticsSourceCommand,
	type AnalyticsSourceResolver,
	type DataSourceActor
} from '@xpert-ai/plugin-sdk'
import type { AnalyticsSourceRef } from '@xpert-ai/contracts'

abstract class HostAnalyticsSourceResolver implements AnalyticsSourceResolver {
	abstract readonly kind: AnalyticsSourceRef['kind']
	constructor(protected readonly commands: CommandBus) {}
	list(actor: DataSourceActor) {
		return this.commands.execute(new ListAnalyticsSourcesCommand(actor, this.kind))
	}
	resolve(actor: DataSourceActor, source: AnalyticsSourceRef) {
		return this.commands.execute(new ResolveAnalyticsSourceCommand(actor, source))
	}
}
@Injectable()
export class DefinitionAnalyticsSourceResolver extends HostAnalyticsSourceResolver {
	readonly kind = 'definition' as const
	constructor(commands: CommandBus) {
		super(commands)
	}
}
@Injectable()
export class ArtifactAnalyticsSourceResolver extends HostAnalyticsSourceResolver {
	readonly kind = 'artifact' as const
	constructor(commands: CommandBus) {
		super(commands)
	}
}

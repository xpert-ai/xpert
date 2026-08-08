import { Global, Module } from '@nestjs/common'
import { LocalOutboundActorTokenProvider, OutboundActorTokenProvider } from './outbound-actor-token.provider'

@Global()
@Module({
	providers: [
		LocalOutboundActorTokenProvider,
		{
			provide: OutboundActorTokenProvider,
			useExisting: LocalOutboundActorTokenProvider
		}
	],
	exports: [OutboundActorTokenProvider, LocalOutboundActorTokenProvider]
})
export class ActorTokenModule {}

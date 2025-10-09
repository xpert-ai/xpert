import { OnModuleInit } from "@nestjs/common"
import { DiscoveryService, Reflector } from "@nestjs/core"

export class BaseStrategyRegistry<S> implements OnModuleInit {
    protected strategies = new Map<string, S>()

    constructor(
        protected readonly strategyKey: string,
        protected discoveryService: DiscoveryService,
        protected reflector: Reflector
    ) {}

    onModuleInit() {
        const providers = this.discoveryService.getProviders()
        for (const wrapper of providers) {
            const { instance } = wrapper
            if (!instance) continue

            const type = this.reflector.get<string>(this.strategyKey, instance.constructor)
            if (type) {
                this.strategies.set(type, instance as S)
            }
        }
    }

    get(type: string): S {
        const strategy = this.strategies.get(type)
        if (!strategy) {
            throw new Error(`No strategy found for type ${type}`)
        }
        return strategy
    }

    list(): S[] {
        return Array.from(this.strategies.values())
    }
}

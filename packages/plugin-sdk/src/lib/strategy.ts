import { Inject, OnModuleInit } from "@nestjs/common"
import { DiscoveryService, Reflector } from "@nestjs/core"
import { filter } from "rxjs"
import { RequestContext } from "./core/context"
import { StrategyBus } from "./core/strategy-bus"
import { GLOBAL_ORGANIZATION_SCOPE, ORGANIZATION_METADATA_KEY, PLUGIN_METADATA_KEY } from "./types"


export class BaseStrategyRegistry<S> implements OnModuleInit {

    @Inject(StrategyBus)
    protected readonly bus: StrategyBus

    // Map<organizationId, Map<type, strategy>>
    protected strategies = new Map<string, Map<string, S>>()
    protected pluginStrategies = new Map<string, Set<string>>()

    constructor(
        protected readonly strategyKey: string,
        protected discoveryService: DiscoveryService,
        protected reflector: Reflector,
    ) {}

    onModuleInit() {
        this.bus.events$.pipe(filter((event) => !event.strategyType || event.strategyType === this.strategyKey)).subscribe((evt) => {
            if (evt.type === 'UPSERT') {
                this.upsert(evt.entry.instance)
            } else if (evt.type === 'REMOVE') {
                this.remove(evt.orgId, evt.pluginName);
            }
        })
        
        const providers = this.discoveryService.getProviders()
        for (const wrapper of providers) {
            const { instance } = wrapper
            if (!instance) continue
            this.upsert(instance)
        }
    }

    upsert(instance: any) {
        const type = this.reflector.get<string>(this.strategyKey, instance.constructor)
        if (type) {
            const target = instance.metatype ?? instance.constructor
            const organizationId =
                this.reflector.get<string>(ORGANIZATION_METADATA_KEY, target) ?? GLOBAL_ORGANIZATION_SCOPE
            const orgMap = this.strategies.get(organizationId) ?? new Map<string, S>()
            orgMap.set(type, instance as S)
            this.strategies.set(organizationId, orgMap)
            const pluginName = this.reflector.get<string>(PLUGIN_METADATA_KEY, target)
            if (pluginName) {
                const pluginStrategies = this.pluginStrategies.get(pluginName) ?? new Set<string>()
                pluginStrategies.add(type)
                this.pluginStrategies.set(pluginName, pluginStrategies)
            }
        }
    }

    /**
     * Remove all strategies registered by the given plugin for the given organization.
     */
    remove(organizationId: string, pluginName: string) {
        const strategies = this.pluginStrategies.get(pluginName)
        const orgMap = this.strategies.get(organizationId)
        for (const type of strategies ?? []) {
            orgMap?.delete(type)
        }
    }

    /**
     * Resolve organization id, falling back to request context org or global scope.
     */
    protected resolveOrganization(organizationId?: string) {
        return organizationId ?? RequestContext.getOrganizationId() ?? GLOBAL_ORGANIZATION_SCOPE
    }

    /**
     * Get strategy by type from the given organization including global strategies as fallback.
     * 
     * @param type 
     * @param organizationId 
     * @returns 
     */
    get(type: string, organizationId?: string): S {
        organizationId ??= RequestContext.getOrganizationId()
        const orgKey = this.resolveOrganization(organizationId)
        const strategy =
            this.strategies.get(orgKey)?.get(type) ??
            (orgKey === GLOBAL_ORGANIZATION_SCOPE ? undefined : this.strategies.get(GLOBAL_ORGANIZATION_SCOPE)?.get(type))
        if (!strategy) {
            throw new Error(`No strategy found for type ${type}`)
        }
        return strategy
    }

    /**
     * List all strategies for the given organization including global strategies, or only global strategies if global org is specified.
     * 
     * @param organizationId 
     * @returns 
     */
    list(organizationId?: string): S[] {
        organizationId ??= RequestContext.getOrganizationId()
        const orgKey = this.resolveOrganization(organizationId)
        const scoped = this.strategies.get(orgKey)?.values() ?? []
        const global = orgKey === GLOBAL_ORGANIZATION_SCOPE ? [] : this.strategies.get(GLOBAL_ORGANIZATION_SCOPE)?.values() ?? []
        return Array.from(new Set<S>([...scoped, ...global]))
    }
}

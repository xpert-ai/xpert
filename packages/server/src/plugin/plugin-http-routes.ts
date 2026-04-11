/**
 * Why this exists:
 * Runtime-loaded plugin routes are added after Nest has already attached its 404/error handlers.
 * Simply calling `registerRouters()` can log a mapped route while requests still fall through to 404.
 * Keep dynamic routes under the current global prefix and move newly appended route layers ahead of the existing tail handlers.
 */
import { Type } from '@nestjs/common'
import { MODULE_PATH } from '@nestjs/common/constants'
import { ApplicationConfig, GraphInspector, ModuleRef } from '@nestjs/core'
import { RoutesResolver } from '@nestjs/core/router/routes-resolver'

type NestContainerLike = {
	getModules(): Map<string, RuntimeModuleLike> & { applicationId?: string }
	getHttpAdapterRef(): unknown
}

type HttpAdapterLike = {
	getInstance?: () => {
		_router?: {
			stack?: unknown[]
		}
		router?: {
			stack?: unknown[]
		}
	}
}

type RuntimeModuleLike = {
	id: string
	token: string
	metatype: Type<any>
	controllers: Map<unknown, unknown>
}

type HttpRouteStackSnapshot = {
	stackLength: number
	tailLayerCount: number
}

function getContainer(moduleRef: ModuleRef): NestContainerLike {
	const container = (moduleRef as ModuleRef & { container?: NestContainerLike }).container
	if (!container) {
		throw new Error('Nest container is not available on the current ModuleRef')
	}
	return container
}

function getInjector(moduleRef: ModuleRef) {
	const injector = (moduleRef as ModuleRef & { injector?: unknown }).injector
	if (!injector) {
		throw new Error('Nest injector is not available on the current ModuleRef')
	}
	return injector
}

function getGlobalPrefix(applicationConfig: ApplicationConfig) {
	const prefix = applicationConfig.getGlobalPrefix()
	if (!prefix) {
		return ''
	}

	return prefix.startsWith('/') ? prefix : `/${prefix}`
}

function getModulePathMetadata(container: NestContainerLike, metatype: Type<any>) {
	const modules = container.getModules()
	return (
		Reflect.getMetadata(`${MODULE_PATH}${modules.applicationId ?? ''}`, metatype) ??
		Reflect.getMetadata(MODULE_PATH, metatype)
	)
}

function getExpressLayerStack(applicationRef: unknown): unknown[] | null {
	const app = (applicationRef as HttpAdapterLike | undefined)?.getInstance?.()
	const stack = app?._router?.stack ?? app?.router?.stack

	return Array.isArray(stack) ? stack : null
}

function moveNewExpressLayersAheadOfTailHandlers(options: {
	applicationRef: unknown
	snapshot?: HttpRouteStackSnapshot
}) {
	if (!options.snapshot?.tailLayerCount) {
		return false
	}

	const stack = getExpressLayerStack(options.applicationRef)
	if (!stack || stack.length <= options.snapshot.stackLength) {
		return false
	}

	const appendedLayers = stack.splice(options.snapshot.stackLength)
	if (!appendedLayers.length) {
		return false
	}

	const insertAt = Math.max(options.snapshot.stackLength - options.snapshot.tailLayerCount, 0)
	stack.splice(insertAt, 0, ...appendedLayers)

	return true
}

export function snapshotModuleIds(moduleRef: ModuleRef) {
	return new Set(Array.from(getContainer(moduleRef).getModules().values()).map((moduleRef) => moduleRef.id))
}

export function snapshotHttpRouteStack(moduleRef: ModuleRef): HttpRouteStackSnapshot | null {
	const stack = getExpressLayerStack(getContainer(moduleRef).getHttpAdapterRef())
	if (!stack?.length) {
		return null
	}

	let tailLayerCount = 0
	for (let index = stack.length - 1; index >= 0; index -= 1) {
		const layer = stack[index] as { route?: unknown }
		if (layer?.route) {
			break
		}
		tailLayerCount += 1
	}

	return {
		stackLength: stack.length,
		tailLayerCount
	}
}

export function registerPluginControllerRoutes(options: {
	moduleRef: ModuleRef
	applicationConfig: ApplicationConfig
	beforeModuleIds: Set<string>
	beforeHttpRouteSnapshot?: HttpRouteStackSnapshot | null
	rootModuleType: Type<any>
	registeredModuleIds?: Set<string>
}) {
	const container = getContainer(options.moduleRef)
	const afterModules = Array.from(container.getModules().values())
	const newModules = afterModules.filter((moduleRef) => !options.beforeModuleIds.has(moduleRef.id))
	const candidates = newModules.length
		? newModules
		: afterModules.filter((moduleRef) => moduleRef.metatype === options.rootModuleType)

	if (!candidates.length) {
		return {
			controllerCount: 0,
			moduleCount: 0
		}
	}

	const routesResolver = new RoutesResolver(
		container as never,
		options.applicationConfig,
		getInjector(options.moduleRef) as never,
		new GraphInspector(container as never)
	)
	const applicationRef = container.getHttpAdapterRef()
	const globalPrefix = getGlobalPrefix(options.applicationConfig)
	let controllerCount = 0
	let moduleCount = 0

	for (const moduleRef of candidates) {
		if (!moduleRef.controllers?.size) {
			continue
		}
		if (options.registeredModuleIds?.has(moduleRef.id)) {
			continue
		}

		routesResolver.registerRouters(
			moduleRef.controllers as never,
			moduleRef.token,
			globalPrefix,
			getModulePathMetadata(container, moduleRef.metatype),
			applicationRef as never
		)
		options.registeredModuleIds?.add(moduleRef.id)
		moduleCount += 1
		controllerCount += moduleRef.controllers.size
	}

	moveNewExpressLayersAheadOfTailHandlers({
		applicationRef,
		snapshot: options.beforeHttpRouteSnapshot
	})

	return {
		controllerCount,
		moduleCount
	}
}

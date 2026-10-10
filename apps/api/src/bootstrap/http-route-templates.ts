/**
 * Express 5 discards mount templates after registration. Capture them before plugin/bootstrap
 * registration so metrics never infer templates from resolved URLs or user-supplied parameter values.
 * Proxies preserve router properties and forward registration, params and next/error behavior.
 */
import { Router as createRouter } from 'express'
import type { Request, RequestHandler, Router } from 'express'

type MountedRouter = RequestHandler & { stack: unknown[] }
type RouterLayer = { handle: unknown; route?: unknown; matchers?: unknown }
type MountPath = string | RegExp
type MountContext = { router: MountedRouter; template: string; baseUrl: string }

const contexts = new WeakMap<Request, MountContext>()
const completedRoutes = new WeakMap<Request, { route: unknown; template: string }>()
let installed = false

export function captureHttpRouterMountTemplates() {
  if (installed) return
  installed = true
  const prototype: Pick<Router, 'use'> = createRouter.prototype
  prototype.use = new Proxy(prototype.use, {
    apply(target, receiver, args) {
      const before = isRouter(receiver) ? receiver.stack.length : 0
      const result = Reflect.apply(target, receiver, args)
      if (isRouter(receiver)) {
        const paths = mountPaths(args)
        for (const layer of receiver.stack.slice(before)) {
          if (isLayer(layer) && isRouter(layer.handle)) trackMount(layer, layer.handle, paths)
        }
      }
      return result
    }
  })
}

export function getHttpRequestRouteTemplate(request: Request): string {
  const route: unknown = request.route
  const path = routePath(route)
  if (!path) return 'unmatched'
  const context = contexts.get(request)
  if (context && hasRoute(context.router, route)) return joinTemplates(context.template, path)
  const completed = completedRoutes.get(request)
  return completed?.route === route ? completed.template : path
}

function trackMount(layer: RouterLayer, router: MountedRouter, paths: MountPath[]) {
  layer.handle = new Proxy(router, {
    apply(target, receiver, args) {
      // This proxy is installed only on Express routers, whose call contract is RequestHandler.
      const [request, response, next] = args as Parameters<RequestHandler>
      const previous = contexts.get(request)
      const mount = matchedMount(layer, paths, request.baseUrl.slice(previous?.baseUrl.length ?? 0) || '/')
      const context = {
        router,
        template: joinTemplates(previous?.template ?? '', mount),
        baseUrl: request.baseUrl
      }
      contexts.set(request, context)
      const restore = () => {
        const route: unknown = request.route
        const path = routePath(route)
        if (path && hasRoute(router, route)) {
          completedRoutes.set(request, { route, template: joinTemplates(context.template, path) })
        }
        if (previous) contexts.set(request, previous)
        else contexts.delete(request)
      }
      try {
        return Reflect.apply(target, receiver, [
          request,
          response,
          (error?: unknown) => {
            restore()
            next(error)
          }
        ])
      } catch (error) {
        restore()
        throw error
      }
    }
  })
}

function matchedMount(layer: RouterLayer, paths: MountPath[], resolvedMount: string): string {
  if (paths.length === 1) return String(paths[0])
  const matchers = layer.matchers
  if (Array.isArray(matchers)) {
    for (let index = 0; index < paths.length; index++) {
      const path = paths[index]
      const matcher: unknown = matchers[index]
      const matched =
        path instanceof RegExp
          ? new RegExp(path.source, path.flags).test(resolvedMount)
          : typeof matcher === 'function' && Reflect.apply(matcher, undefined, [resolvedMount])
      if (matched) return String(path)
    }
  }
  return '<unmatched-mount>'
}

function mountPaths(args: unknown[]): MountPath[] {
  let first = args[0]
  while (Array.isArray(first) && first.length) first = first[0]
  if (typeof first === 'function') return ['/']
  const paths = Array.isArray(args[0]) ? args[0] : [args[0]]
  return paths.filter((path): path is MountPath => typeof path === 'string' || path instanceof RegExp)
}

function routePath(route: unknown): string | null {
  return route && typeof route === 'object' && 'path' in route && typeof route.path === 'string' ? route.path : null
}

function hasRoute(router: MountedRouter, route: unknown): boolean {
  return router.stack.some((layer) => isLayer(layer) && layer.route === route)
}

function joinTemplates(prefix: string, path: string): string {
  return `${prefix.replace(/\/$/, '')}/${path.replace(/^\//, '')}`
}

function isRouter(value: unknown): value is MountedRouter {
  return (
    typeof value === 'function' &&
    'stack' in value &&
    Array.isArray(value.stack) &&
    'use' in value &&
    typeof value.use === 'function' &&
    'handle' in value &&
    typeof value.handle === 'function'
  )
}

function isLayer(value: unknown): value is RouterLayer {
  return !!value && typeof value === 'object' && 'handle' in value
}

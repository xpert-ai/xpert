import { Injectable, SetMetadata, applyDecorators } from '@nestjs/common'
import { STRATEGY_META_KEY } from '../types'
import type { XpertToolOptions, XpertToolProviderOptions } from './types'

export const XPERT_TOOL_PROVIDER = 'XPERT_TOOL_PROVIDER'
export const XPERT_TOOL_PROVIDER_METADATA = 'XPERT_TOOL_PROVIDER_METADATA'
export const XPERT_TOOL_METHOD_METADATA = 'XPERT_TOOL_METHOD_METADATA'

/** Marks one injectable business service as a reusable Tool provider and one native MCP service. */
export const XpertToolProvider = (options: XpertToolProviderOptions): ClassDecorator =>
  applyDecorators(
    Injectable(),
    SetMetadata(XPERT_TOOL_PROVIDER, options.provider),
    SetMetadata(XPERT_TOOL_PROVIDER_METADATA, Object.freeze({ ...options })),
    SetMetadata(STRATEGY_META_KEY, XPERT_TOOL_PROVIDER)
  )

/** Exposes one business method through an Agent Middleware, native MCP, or both. */
export const XpertTool = (options: XpertToolOptions): MethodDecorator =>
  SetMetadata(XPERT_TOOL_METHOD_METADATA, Object.freeze({ ...options }))

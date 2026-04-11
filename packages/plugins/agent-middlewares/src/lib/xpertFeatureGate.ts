import { IAgentMiddlewareContext } from '@xpert-ai/plugin-sdk'

export function assertSandboxFeatureEnabled(context: IAgentMiddlewareContext, middlewareName: string) {
  if (context.xpertFeatures?.sandbox?.enabled === true) {
    return
  }

  throw new Error(`${middlewareName} requires the xpert sandbox feature to be enabled.`)
}

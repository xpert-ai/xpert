import { XpertViewHostContext, XpertViewSlot } from '@xpert-ai/contracts'

export interface XpertViewHostResolution {
  workspaceId?: string | null
  hostSnapshot?: unknown
}

export interface XpertViewHostDefinition {
  readonly hostType: string
  readonly slots: XpertViewSlot[]

  resolve(hostId: string): Promise<XpertViewHostResolution | null> | XpertViewHostResolution | null

  canRead(
    context: XpertViewHostContext,
    resolution: XpertViewHostResolution
  ): Promise<boolean> | boolean
}

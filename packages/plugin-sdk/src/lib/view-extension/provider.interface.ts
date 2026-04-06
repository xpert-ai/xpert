import {
  XpertExtensionViewManifest,
  XpertResolvedViewHostContext,
  XpertViewActionRequest,
  XpertViewActionResult,
  XpertViewDataResult,
  XpertViewQuery
} from '@metad/contracts'

export interface IXpertViewExtensionProvider {
  supports(context: XpertResolvedViewHostContext): Promise<boolean> | boolean

  getViewManifests(
    context: XpertResolvedViewHostContext,
    slot: string
  ): Promise<XpertExtensionViewManifest[]> | XpertExtensionViewManifest[]

  getViewData(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    query: XpertViewQuery
  ): Promise<XpertViewDataResult> | XpertViewDataResult

  executeViewAction?(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    actionKey: string,
    request: XpertViewActionRequest
  ): Promise<XpertViewActionResult> | XpertViewActionResult
}

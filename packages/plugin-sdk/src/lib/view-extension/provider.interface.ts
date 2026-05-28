import {
  XpertExtensionViewManifest,
  XpertRemoteComponentEntry,
  XpertRemoteComponentViewSchema,
  XpertResolvedViewHostContext,
  XpertViewActionRequest,
  XpertViewActionResult,
  XpertViewDataResult,
  XpertViewParameterOptionsQuery,
  XpertViewParameterOptionsResult,
  XpertViewQuery
} from '@xpert-ai/contracts'

export interface XpertViewFileActionFile {
  buffer: Buffer
  originalname?: string
  mimetype?: string
  size?: number
}

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

  executeViewFileAction?(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    actionKey: string,
    request: XpertViewActionRequest,
    file: XpertViewFileActionFile
  ): Promise<XpertViewActionResult> | XpertViewActionResult

  getViewParameterOptions?(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    parameterKey: string,
    query: XpertViewParameterOptionsQuery
  ): Promise<XpertViewParameterOptionsResult> | XpertViewParameterOptionsResult

  getRemoteComponentEntry?(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    component: XpertRemoteComponentViewSchema['component']
  ): Promise<XpertRemoteComponentEntry> | XpertRemoteComponentEntry
}

import {
  XpertExtensionViewManifest,
  XpertRemoteComponentEntry,
  XpertRemoteComponentViewSchema,
  XpertResolvedViewHostContext,
  XpertViewActionRequest,
  XpertViewActionResult,
  XpertViewDataResult,
  XpertViewFileAccessRequest,
  XpertViewParameterOptionsQuery,
  XpertViewParameterOptionsResult,
  XpertViewQuery
} from '@xpert-ai/contracts'
import type { WorkspacePortableFileReference } from '../runtime/capabilities/workspace-files'

export interface XpertViewFileActionFile {
  buffer: Buffer
  originalname?: string
  mimetype?: string
  size?: number
}

export interface XpertViewFileResource {
  reference: WorkspacePortableFileReference
  fileName: string
  mimeType: string
  size?: number
}

/**
 * Server-side adapter that exposes plugin-owned views in host-defined slots.
 * Register an injectable implementation with `@ViewExtensionProvider(providerKey)`.
 *
 * The host supplies caller context and enforces host/manifest access; providers validate
 * business inputs and delegate resource authorization and business rules to domain services.
 * Method `viewKey` arguments are provider-local manifest keys; the host handles public namespacing.
 * Implement optional hooks for the capabilities the manifests expose. Prefer declared actions
 * and domain services for new business features; keep this contract focused on host/view integration.
 */
export interface IXpertViewExtensionProvider {
  /**
   * Authorize each local draft operation through the resource's existing domain access checks.
   * Use the trusted view context; throw on denial and return the canonical resource ID on success.
   * Required to support workbench.content.draft; the host owns draft isolation and storage.
   */
  authorizeLocalDraftResource?(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    resourceId: string
  ): Promise<string> | string

  /**
   * Decide whether this provider applies to the resolved host, independently of any slot.
   * Keep discovery lightweight and free of side effects; a match does not grant resource access.
   */
  supports(context: XpertResolvedViewHostContext): Promise<boolean> | boolean

  /**
   * Describe the views available in a slot, including rendering, data, actions and optional capabilities.
   * Use stable provider-local keys and return an empty list for unsupported slots.
   * Keep discovery free of business mutations; the host applies activation and visibility policies.
   */
  getViewManifests(
    context: XpertResolvedViewHostContext,
    slot: string
  ): Promise<XpertExtensionViewManifest[]> | XpertExtensionViewManifest[]

  /**
   * Read the view's data for its declared query contract, within the caller's authorized resource scope.
   * Keep this path free of business mutations; the host may cache results according to the manifest.
   */
  getViewData(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    query: XpertViewQuery
  ): Promise<XpertViewDataResult> | XpertViewDataResult

  /**
   * Handle a declared JSON action, such as saving, exporting or invoking a domain workflow.
   * Validate action-specific input and delegate authorization and execution to domain services.
   * Use the result's refresh hint when the operation invalidates the view's data.
   */
  executeViewAction?(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    actionKey: string,
    request: XpertViewActionRequest
  ): Promise<XpertViewActionResult> | XpertViewActionResult

  /**
   * Handle a declared file-transport action, such as importing an uploaded document.
   * Apply the same domain rules as JSON actions and validate the file for its intended use.
   */
  executeViewFileAction?(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    actionKey: string,
    request: XpertViewActionRequest,
    file: XpertViewFileActionFile
  ): Promise<XpertViewActionResult> | XpertViewActionResult

  /**
   * Authorize a view-owned file for a purpose declared in the manifest's fileAccess policy.
   * Return its portable workspace reference and presentation metadata for host-managed delivery.
   */
  resolveViewFile?(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    request: XpertViewFileAccessRequest
  ): Promise<XpertViewFileResource> | XpertViewFileResource

  /**
   * Supply dynamic choices for a declared view parameter, honoring search and dependent parameters.
   * Restrict choices to resources visible to the caller; keep option lookup free of business mutations.
   */
  getViewParameterOptions?(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    parameterKey: string,
    query: XpertViewParameterOptionsQuery
  ): Promise<XpertViewParameterOptionsResult> | XpertViewParameterOptionsResult

  /**
   * Supply the HTML entry for a remote-component view using the component declared in its manifest.
   * Serve plugin-controlled UI assets; use the host bridge for runtime data and actions.
   * The host owns the iframe integration, while resource access remains enforced by the data/action hooks.
   */
  getRemoteComponentEntry?(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    component: XpertRemoteComponentViewSchema['component']
  ): Promise<XpertRemoteComponentEntry> | XpertRemoteComponentEntry
}

import type { WorkspacePortableFileReference } from '../../runtime/capabilities/workspace-files'

export const VIDEO_GENERATOR_FAMILIES = ['seedance', 'veo', 'kling'] as const

export type VideoGeneratorFamily = (typeof VIDEO_GENERATOR_FAMILIES)[number]
export type VideoGenerationPermissionOperation = 'list' | 'submit' | 'query' | 'cancel'
export type VideoGenerationMode =
  | 'text_to_video'
  | 'image_to_video'
  | 'first_last_frame_to_video'
  | 'reference_to_video'

export type VideoGenerationReferenceKind = 'image' | 'video' | 'audio'
export type VideoGenerationReferencePurpose = 'reference' | 'first_frame' | 'last_frame'

export interface VideoGenerationPermission {
  type: 'video_generation'
  operations?: VideoGenerationPermissionOperation[]
  scope?: string[]
  description?: string
}

export const VIDEO_GENERATION_PERMISSION_SERVICE_TOKEN = 'XPERT_PLUGIN_VIDEO_GENERATION_PERMISSION_SERVICE'
export const VIDEO_GENERATION_SERVICE_TOKEN = 'XPERT_VIDEO_GENERATION_SERVICE'

export interface VideoGenerationReferenceLimit {
  maxItems: number
}

export interface VideoGenerationModelInputCapabilities {
  referenceImages?: VideoGenerationReferenceLimit
  referenceVideos?: VideoGenerationReferenceLimit
  referenceAudios?: VideoGenerationReferenceLimit
  initialFrame?: boolean
  lastFrame?: boolean
}

export interface VideoGenerationModelOption {
  id: string
  label: string
  /** Optional per-model restriction. Defaults to the generator-level modes. */
  modes?: readonly VideoGenerationMode[]
  inputs?: VideoGenerationModelInputCapabilities
}

interface VideoGenerationToolsetCapabilityBase {
  family: VideoGeneratorFamily
  displayName: string
  modes: readonly VideoGenerationMode[]
  models: readonly VideoGenerationModelOption[]
  defaultModel: string
  resolutions: readonly string[]
  aspectRatios: readonly string[]
  durationSeconds: { min: number; max: number; default: number }
  supportsAudio: boolean
}

/** Legacy single-image protocol. Kept so already installed provider plugins remain usable. */
export interface VideoGenerationToolsetCapabilityV1 extends VideoGenerationToolsetCapabilityBase {
  protocolVersion: 1
  tools: {
    textToVideo?: string
    imageToVideo?: string
    query: string
    cancel?: string
  }
}

/**
 * Capability-driven protocol. Submit tools consume normalized argument names:
 * `input_image_file`, `first_frame_file`, `last_frame_file`, and
 * `reference_{image,video,audio}_files`.
 */
export interface VideoGenerationToolsetCapabilityV2 extends VideoGenerationToolsetCapabilityBase {
  protocolVersion: 2
  tools: {
    textToVideo?: string
    imageToVideo?: string
    firstLastFrameToVideo?: string
    referenceToVideo?: string
    query: string
    cancel?: string
  }
}

export type VideoGenerationToolsetCapability = VideoGenerationToolsetCapabilityV1 | VideoGenerationToolsetCapabilityV2

export interface VideoGeneratorSummary {
  id: string
  family: VideoGeneratorFamily
  name: string
  displayName: string
  linkedToXpert: boolean
  modes: VideoGenerationMode[]
  models: VideoGenerationModelOption[]
  defaultModel: string
  resolutions: string[]
  aspectRatios: string[]
  durationSeconds: { min: number; max: number; default: number }
  supportsAudio: boolean
  supportsCancel: boolean
}

export interface ListVideoGeneratorsInput {
  xpertId: string
}

export interface ListVideoGeneratorsResult {
  generators: VideoGeneratorSummary[]
}

export interface VideoGenerationReferenceInput {
  kind: VideoGenerationReferenceKind
  purpose?: VideoGenerationReferencePurpose
  file: WorkspacePortableFileReference
}

export interface SubmitVideoGenerationInput {
  xpertId: string
  toolsetId: string
  projectId?: string | null
  prompt: string
  references?: readonly VideoGenerationReferenceInput[] | null
  /** @deprecated Use `references` with an image item. */
  inputImage?: WorkspacePortableFileReference | null
  model?: string | null
  resolution?: string | null
  aspectRatio?: string | null
  durationSeconds?: number | null
  generateAudio?: boolean | null
}

export interface SubmitVideoGenerationResult {
  providerTaskId: string
  status: string
  model?: string
  mode?: VideoGenerationMode
  acceptedReferenceCount?: number
}

export interface QueryVideoGenerationInput {
  xpertId: string
  toolsetId: string
  projectId?: string | null
  providerTaskId: string
}

export interface QueryVideoGenerationResult {
  providerTaskId: string
  status: string
  completed: boolean
  failed: boolean
  model?: string
  errorCode?: string
  errorMessage?: string
  outputFile?: WorkspacePortableFileReference
}

export interface CancelVideoGenerationInput {
  xpertId: string
  toolsetId: string
  providerTaskId: string
}

export interface CancelVideoGenerationResult {
  providerTaskId: string
  supported: boolean
  cancelled: boolean
  status: string
}

export interface VideoGenerationPermissionService {
  listGenerators(input: ListVideoGeneratorsInput): Promise<ListVideoGeneratorsResult>
  submit(input: SubmitVideoGenerationInput): Promise<SubmitVideoGenerationResult>
  query(input: QueryVideoGenerationInput): Promise<QueryVideoGenerationResult>
  cancel(input: CancelVideoGenerationInput): Promise<CancelVideoGenerationResult>
}

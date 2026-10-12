# Video Generation Protocol

The platform video generation service separates application requests from provider-specific tools.
Applications submit normalized workspace file references; provider plugins declare capabilities and
implement the standard tool arguments for the modes they support.

## Versions

- Protocol v1 supports text-to-video and one image-to-video input.
- Protocol v2 adds multiple reference media, initial/final frames, and per-model input limits.
- The platform continues to discover and route v1 providers. New provider integrations should use v2.

## Modes

| Mode                        | Normalized tool arguments                                                 |
| --------------------------- | ------------------------------------------------------------------------- |
| `text_to_video`             | no media arguments                                                        |
| `image_to_video`            | `input_image_file`                                                        |
| `first_last_frame_to_video` | `first_frame_file`, `last_frame_file`                                     |
| `reference_to_video`        | `reference_image_files`, `reference_video_files`, `reference_audio_files` |

Every file argument is a `WorkspacePortableFileReference`. Provider tools are responsible for
reading those references through Workspace Files and converting them to the provider's accepted
transport format. Applications must not send credentials, provider URLs, or provider tool names.

## Capability Declaration

Provider strategies declare generator-level modes and tool mappings, then narrow them for each
model with `modes` and `inputs`. Reference limits are enforced by the host before invoking a paid
provider operation.

```ts
videoGeneration: {
  protocolVersion: 2,
  family: 'seedance',
  displayName: 'Seedance',
  modes: [
    'text_to_video',
    'image_to_video',
    'first_last_frame_to_video',
    'reference_to_video'
  ],
  tools: {
    textToVideo: 'provider_text_to_video',
    imageToVideo: 'provider_image_to_video',
    firstLastFrameToVideo: 'provider_first_last_frame_to_video',
    referenceToVideo: 'provider_reference_to_video',
    query: 'provider_video_query'
  },
  models: [{
    id: 'provider-model-id',
    label: 'Provider Model',
    inputs: {
      referenceImages: { maxItems: 9 },
      referenceAudios: { maxItems: 3 },
      initialFrame: true,
      lastFrame: true
    }
  }]
}
```

Discovery returns only modes backed by enabled tools and only models that retain at least one
available mode. Submit validates model, output settings, reference kinds, frame combinations,
per-model limits, duplicate files, and tool enablement before provider invocation.

## Request Routing

The host derives the mode from reference purposes:

1. No references: text-to-video.
2. One `first_frame`: image-to-video.
3. One `first_frame` and one `last_frame`: first/final-frame-to-video.
4. Generic image, video, or audio references: reference-to-video.
5. A v1 provider or a v2 model without reference mode may accept one generic image through its
   image-to-video tool. Other unsupported combinations fail before submission.

Reference array order is preserved within each media kind. Prompts that refer to `image 1`,
`image 2`, and so on must use the same image order as the request.

## Standard Results

Submit tools return artifact data containing `task_id`, `status`, and optionally `model`. Query tools
return `task_id`, `status`, optional provider error data, and generated video files in the artifact
`files` array. The platform exposes normalized task fields and Workspace Files references; it does
not expose provider response bodies, credentials, internal tool names, or provider media URLs.

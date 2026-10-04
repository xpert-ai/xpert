# Tool images with immutable references

For the API responsibilities, image lifecycle, validation limits and server-only
text-result policy, see the [tool images feature guide](../../docs/tool-images.md).

Use `ToolImagesRuntimeCapability` inside an Agent middleware when a tool returns
an image for visual inspection. The host stores validated image bytes in
Workspace Files and an immutable Artifact version. The tool returns only a small
summary and `ToolOutputPresentation`; do not put a Base64 data URL, file path,
signed URL or image buffer in tool content, business state or checkpoints.

```ts
import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { ToolImagesRuntimeCapability, mergeModelRequirements, type AgentMiddleware } from '@xpert-ai/plugin-sdk'

// Inside createMiddleware(context), this facade resolves each actual invocation's
// host scope, including child executions whose conversation was assigned later.
const images = context.runtime.capabilities!.require(ToolImagesRuntimeCapability)
const inspectName = 'inspect_process_image'
const inspectImage = tool(
  async ({ candidateId }) => {
    // Business authorization and candidate selection remain in the owning plugin.
    const prepared = await loadAuthorizedCandidate(candidateId)
    const presentation = await images.save({
      buffer: prepared.buffer,
      mimeType: prepared.mimeType, // image/png, image/jpeg or image/webp
      title: prepared.title
    })
    return [JSON.stringify({ candidateId, sha256: prepared.sha256 }), presentation]
  },
  {
    name: inspectName,
    description: 'Inspect an authorized construction image candidate.',
    schema: z.object({ candidateId: z.string() }),
    responseFormat: 'content_and_artifact'
  }
)

const middleware: AgentMiddleware = {
  name: 'construction-image-inspection',
  tools: [inspectImage],
  wrapModelCall: async (request, handler) => {
    const projected = await images.prepareModelInput(request.messages, [inspectName])
    return handler({
      ...request,
      ...projected,
      requirements: mergeModelRequirements(request.requirements, projected.requirements)
    })
  }
}
```

`loadAuthorizedCandidate` is application-specific: validate its business scope and
resolve trusted bytes before saving them. Do not accept scope or arbitrary paths
from model input. Record a successful business “viewed” receipt only after `save`
succeeds, and require the actual visual review before accepting the asset.

`prepareModelInput` is a pure outbound projection over persisted references. It
hydrates only the current complete tool round, preserves the tool-call ID and
summary mapping, and validates Artifact ownership, conversation, immutable
version, MIME type, dimensions, byte length and SHA-256. There are at most three
images per model request. Names passed to this method identify tools whose
successful results must contain valid image presentations. Ordinary error
ToolMessages remain textual so the model can select another candidate.

The returned temporary HumanMessage **must never be written to a message channel,
database or checkpoint**. Merge the returned `requirements` into the request with
`mergeModelRequirements`. Image input adds `features: [ModelFeature.VISION]`;
the host preserves the union across middleware and checks both the main model
and every fallback for registered image-input support. Requirements apply only
to this invocation and are not Agent state or user-supplied tool arguments.
Only VISION requirements are currently supported; unsupported features and
unknown requirement fields fail explicitly. An unknown or text-only model cannot silently discard the pixels.

Historical references are not hydrated again. Legacy inline image bytes are
removed only from outbound clones; a current legacy image result without a valid
reference must be recreated through the image tool. A fresh middleware can resume
from saved references in the same conversation, without an in-memory allow-list.
The public API has no identity or storage path fields: the host binds tenant,
organization, authenticated user, conversation and Workspace scope. Missing scope,
foreign references, revoked assets and checksum changes fail explicitly.

Deploy compatible ChatKit types, SDK and host runtime before adopting this API.
This source contract does not imply that a matching SDK version has been published.

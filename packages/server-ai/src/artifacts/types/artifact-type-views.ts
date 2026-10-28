import { Injectable } from '@nestjs/common'
import { artifactTypeKey } from '@xpert-ai/plugin-sdk'
import type { ArtifactTypeReference, ArtifactLibraryContent } from '@xpert-ai/contracts'

/** Only application composition can bind an existing host UI. Plugin URLs remain platform-owned. */
@Injectable()
export class ArtifactTypeViews {
    private readonly views = new Map<string, (slug: string) => string>()
    private readonly readers = new Map<string, (data: object) => ArtifactLibraryContent>()
    register(
        type: ArtifactTypeReference,
        url: (slug: string) => string,
        read?: (data: object) => ArtifactLibraryContent
    ) {
        const key = artifactTypeKey(type)
        if (this.views.has(key)) throw new Error('Artifact view is already registered')
        this.views.set(key, url)
        if (read) this.readers.set(key, read)
    }
    read(type: ArtifactTypeReference, data: object) {
        return this.readers.get(artifactTypeKey(type))?.(data)
    }
    publicUrl(type: ArtifactTypeReference, slug: string) {
        return this.views.get(artifactTypeKey(type))?.(slug)
    }
}

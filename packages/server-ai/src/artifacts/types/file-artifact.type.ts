import { Injectable } from '@nestjs/common'
import type { IArtifactTypeProvider, ArtifactTypeDefinition } from '@xpert-ai/plugin-sdk'

@Injectable()
export class FileArtifactType implements IArtifactTypeProvider {
    readonly definition: ArtifactTypeDefinition = {
        title: { en_US: 'File', zh_Hans: '文件', zh_Hant: '檔案' },
        kinds: ['html', 'markdown', 'pdf', 'pptx', 'image', 'file', 'site', 'presentation'],
        presentation: { mode: 'file' },
        collection: { allowCopy: true }
    }
    async authorize() {}
    validateContent() {}
}

import { Injectable } from '@nestjs/common'
import sharp from 'sharp'
import { FileParseSource, ParsedFileResult } from '../domain/types'
import { FileParser, getFileExtension } from './file-parser'

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'tiff', 'svg'])

@Injectable()
export class ImageFileParser implements FileParser {
    readonly name = 'image'

    supports(source: FileParseSource): boolean {
        const extension = getFileExtension(source.originalName ?? source.filePath)
        return source.mimeType?.startsWith('image/') || IMAGE_EXTENSIONS.has(extension)
    }

    async parse(source: FileParseSource): Promise<ParsedFileResult> {
        const metadata = await sharp(source.filePath)
            .metadata()
            .catch(() => null)
        const summary = metadata
            ? `Image ${source.originalName ?? ''} ${metadata.width ?? '?'}x${metadata.height ?? '?'} ${metadata.format ?? ''}`.trim()
            : `Image ${source.originalName ?? ''}`.trim()

        return {
            capabilities: ['preview', 'read', 'vision', 'ocr'],
            summary,
            status: 'partial',
            artifacts: [
                { kind: 'summary', content: summary },
                {
                    kind: 'image_metadata',
                    content: summary,
                    mimeType: 'application/json',
                    anchor: { path: source.originalName },
                    metadata: metadata ? { ...metadata } : {}
                }
            ],
            metadata: {
                ocrPending: true,
                visionPending: true
            }
        }
    }
}

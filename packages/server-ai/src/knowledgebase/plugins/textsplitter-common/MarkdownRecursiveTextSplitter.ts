import { Document, BaseDocumentTransformer } from '@langchain/core/documents'
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'
import type { DocumentMarkdownSourceMapEntry, TDocumentAsset } from '@xpert-ai/contracts'
import type { ChunkMetadata } from '@xpert-ai/plugin-sdk'
import { v4 as uuid } from 'uuid'

export interface MarkdownHeader {
    level: number
    text: string
}

export interface MarkdownRecursiveTextSplitterOptions {
    chunkSize?: number
    chunkOverlap?: number
    headersToSplitOn?: number[]
    stripHeader?: boolean // Whether to remove the header line in the chunk
    addHeadersToChunk?: boolean // Whether to add the header to the chunk content
}

/**
 * A LangChain document transformer that splits Markdown into
 * recursive character chunks while preserving section headers.
 */
export class MarkdownRecursiveTextSplitter extends BaseDocumentTransformer {
    private chunkSize: number
    private chunkOverlap: number
    private headersToSplitOn: number[]
    private stripHeader: boolean
    private addHeadersToChunk: boolean

    constructor(options: MarkdownRecursiveTextSplitterOptions = {}) {
        super()
        this.chunkSize = options.chunkSize ?? 1000
        this.chunkOverlap = options.chunkOverlap ?? 200
        this.headersToSplitOn = options.headersToSplitOn ?? [1, 2, 3]
        this.stripHeader = options.stripHeader ?? false
        this.addHeadersToChunk = options.addHeadersToChunk ?? true
    }

    /**
     * LangChain standard method: transform Documents into chunked Documents.
     */
    async transformDocuments(documents: Document[]): Promise<Document<ChunkMetadata>[]> {
        const allDocs: Document<ChunkMetadata>[] = []

        for (const doc of documents) {
            const sections = this.splitByHeaders(doc.pageContent)
            // Source documents do not have a chunkId yet. Treat their metadata as a
            // partial ChunkMetadata contract and add the required chunk fields below.
            const { markdownSourceMap, ...sourceMetadata } = doc.metadata as Partial<ChunkMetadata>
            let sectionSearchOffset = 0

            const splitter = new RecursiveCharacterTextSplitter({
                chunkSize: this.chunkSize,
                chunkOverlap: this.chunkOverlap
            })

            for (const section of sections) {
                const sectionOffset = locateContent(doc.pageContent, section.content, sectionSearchOffset)
                if (sectionOffset !== undefined) {
                    sectionSearchOffset = sectionOffset + section.content.length
                }
                const docs = await splitter.createDocuments([section.content])
                let chunkSearchOffset = 0
                for (const d of docs) {
                    const chunkOffset = locateContent(section.content, d.pageContent, chunkSearchOffset)
                    if (chunkOffset !== undefined) {
                        chunkSearchOffset = chunkOffset + 1
                    }
                    const headersStr = (this.stripHeader ? section.headers : section.headers.slice(0, -1))
                        .map((h) => `${'#'.repeat(h.level)} ${h.text}`)
                        .join('\n')

                    const pageContent =
                        this.addHeadersToChunk && headersStr ? headersStr + '\n\n' + d.pageContent : d.pageContent
                    const sourceStart =
                        sectionOffset !== undefined && chunkOffset !== undefined
                            ? sectionOffset + chunkOffset
                            : undefined
                    const sourceEnd = sourceStart !== undefined ? sourceStart + d.pageContent.length : undefined
                    const provenance =
                        markdownSourceMap && sourceStart !== undefined && sourceEnd !== undefined
                            ? sourceProvenance(markdownSourceMap.entries, sourceStart, sourceEnd)
                            : {}

                    allDocs.push(
                        new Document<ChunkMetadata>({
                            pageContent,
                            metadata: {
                                ...sourceMetadata,
                                ...provenance,
                                chunkId: uuid(),
                                headers: section.headers,
                                headerText: headersStr.replace(/\n/g, ' / ')
                            }
                        })
                    )
                }
            }
        }

        return allDocs
    }

    /**
     * Internal: split markdown into header-based sections.
     */
    private splitByHeaders(markdown: string): {
        headers: MarkdownHeader[]
        content: string
    }[] {
        const lines = markdown.split('\n')
        const sections: { headers: MarkdownHeader[]; contentLines: string[] }[] = []

        let currentHeaders: MarkdownHeader[] = []
        let currentContent: string[] = []
        let insideCodeBlock = false

        const pushSection = () => {
            if (currentContent.length > 0) {
                sections.push({
                    headers: [...currentHeaders],
                    contentLines: [...currentContent]
                })
                currentContent = []
            }
        }

        for (const line of lines) {
            if (/^```/.test(line.trim())) {
                insideCodeBlock = !insideCodeBlock
                currentContent.push(line)
                continue
            }

            if (!insideCodeBlock) {
                const match = line.match(/^(#{1,6})\s+(.*)$/)
                if (match) {
                    const level = match[1].length
                    const text = match[2].trim()

                    if (this.headersToSplitOn.includes(level)) {
                        pushSection()
                        currentHeaders = currentHeaders.filter((h) => h.level < level)
                        currentHeaders.push({ level, text })
                        if (!this.stripHeader) currentContent.push(line)
                        continue
                    }
                }
            }

            currentContent.push(line)
        }

        pushSection()

        return sections.map((s) => ({
            headers: s.headers,
            content: s.contentLines.join('\n').trim()
        }))
    }
}

function locateContent(source: string, content: string, fromIndex: number) {
    const index = source.indexOf(content, Math.max(0, fromIndex))
    return index >= 0 ? index : undefined
}

/** Restores page, block, and asset provenance after the merged Markdown is split. */
function sourceProvenance(entries: DocumentMarkdownSourceMapEntry[], startOffset: number, endOffset: number) {
    const overlapping = entries.filter((entry) => entry.endOffset > startOffset && entry.startOffset < endOffset)
    if (!overlapping.length) return { startOffset, endOffset }
    const pageStart = Math.min(...overlapping.map((entry) => entry.pageStart))
    const pageEnd = Math.max(...overlapping.map((entry) => entry.pageEnd))
    const sourceBlockIds = [...new Set(overlapping.flatMap((entry) => entry.blockIds ?? []))]
    const assets = uniqueAssets(overlapping.flatMap((entry) => entry.assets ?? []))
    return {
        startOffset,
        endOffset,
        pageStart,
        pageEnd,
        ...(pageStart === pageEnd ? { page: pageStart } : {}),
        ...(sourceBlockIds.length ? { sourceBlockIds } : {}),
        ...(assets.length ? { assets } : {})
    }
}

function uniqueAssets(assets: TDocumentAsset[]) {
    return [...new Map(assets.map((asset) => [asset.filePath, asset])).values()]
}

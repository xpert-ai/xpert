import { Document } from '@langchain/core/documents'
import { DocxLoader } from '@langchain/community/document_loaders/fs/docx'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { DefaultTransformerStrategy } from './transformer.strategy'
import { AutoTextSplitterStrategy } from '../textsplitter-common/auto.strategy'
import { StructureAwareStrategy } from '../textsplitter-common/structure-aware.strategy'
import { RecursiveCharacterStrategy } from '../textsplitter-common/recursive-character.strategy'
import { MarkdownRecursiveStrategy } from '../textsplitter-common/markdown-recursive.strategy'

describe('default converter format contract', () => {
    const transformer = new DefaultTransformerStrategy()
    const recursive = new RecursiveCharacterStrategy()
    const auto = new AutoTextSplitterStrategy(
        new StructureAwareStrategy(recursive),
        new MarkdownRecursiveStrategy(),
        recursive
    )
    const options = { chunkSize: 1000, chunkOverlap: 0 }

    it('routes loaded Markdown like the same pasted Markdown, while loaded TXT remains plain text', async () => {
        const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'xpert-chunking-formats-'))
        try {
            const filePath = path.join(directory, 'input')
            const text = '# Manual\n\n| Name | Value |\n| --- | --- |\n| A | B |'
            await fs.writeFile(filePath, text)
            const markdown = await transformer.processMarkdown(filePath)
            const plain = await transformer.processText(filePath)
            const loaded = await auto.splitDocuments(markdown, options)
            const pasted = await auto.splitDocuments(
                [new Document({ pageContent: text, metadata: { chunkId: 'pasted', contentFormat: 'markdown' } })],
                options
            )
            expect(loaded.decisions).toEqual(pasted.decisions)
            expect(loaded.chunks.map((chunk) => chunk.pageContent)).toEqual(
                pasted.chunks.map((chunk) => chunk.pageContent)
            )
            expect((await auto.splitDocuments(plain, options)).decisions[0].resolvedStrategy).toBe(
                'recursive-character'
            )
        } finally {
            await fs.rm(directory, { recursive: true })
        }
    })

    it('declares the plain-text DOC/DOCX fallback without interpreting Markdown-looking text', async () => {
        const load = jest
            .spyOn(DocxLoader.prototype, 'load')
            .mockResolvedValue([new Document({ pageContent: '# Literal text', metadata: {} })])
        try {
            const documents = await transformer.processDoc('fixture.doc')
            expect(documents[0].metadata.contentFormat).toBe('text')
            expect((await auto.splitDocuments(documents, options)).decisions[0].resolvedStrategy).toBe(
                'recursive-character'
            )
        } finally {
            load.mockRestore()
        }
    })
})

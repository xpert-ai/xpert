import { SANDBOX_FILE_OUTPUT_RULES, SandboxFileOutputRule } from '@xpert-ai/contracts'
import { extname } from 'node:path'
import { TextDecoder } from 'node:util'
import { lookup } from 'mime-types'
import JSZip from 'jszip'
import { workspaceRelativePath } from './file-activity-snapshot'

export const FILE_PRESENTATION_DESCRIPTION = `File operations record workspace changes but do not create output cards. After completing and checking the requested deliverables, call present_files from SandboxFile with only their workspace-relative paths. Select the files the user needs; exclude drafts, scripts and QA files unless requested. Existing unchanged files may also be presented. Present again after edits to deliver a new saved version. Do not add delivery or deliverables arguments to writing or shell tools.`

/** File format selects validation and rendering, never whether a file should be delivered. */
export function getFileOutputRule(workspacePath: string): SandboxFileOutputRule {
    const path = workspaceRelativePath(workspacePath)
    const extension = extname(path).toLowerCase()
    return (
        SANDBOX_FILE_OUTPUT_RULES.find((rule) => rule.extension === extension) ?? {
            extension,
            kind: 'file',
            mimeType: lookup(extension) || 'application/octet-stream',
            format: 'binary'
        }
    )
}

/** Incomplete writes and renamed arbitrary bytes must not become document cards. Not visual QA. */
export async function validateFilePresentationFormat(buffer: Buffer, rule: SandboxFileOutputRule): Promise<boolean> {
    if (!buffer.length) return false
    try {
        switch (rule.format) {
            case 'binary':
                return true
            case 'docx':
            case 'xlsx':
            case 'pptx': {
                const main = { docx: 'word/document.xml', xlsx: 'xl/workbook.xml', pptx: 'ppt/presentation.xml' }[
                    rule.format
                ]
                const zip = await JSZip.loadAsync(buffer)
                return Boolean(zip.file('[Content_Types].xml') && zip.file('_rels/.rels') && zip.file(main))
            }
            case 'pdf':
                return (
                    buffer.subarray(0, 8).toString('ascii').startsWith('%PDF-') &&
                    /%%EOF\s*$/.test(buffer.subarray(-1024).toString('ascii'))
                )
            case 'png':
                return (
                    buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
                    buffer.subarray(-8, -4).toString('ascii') === 'IEND'
                )
            case 'jpeg':
                return (
                    buffer[0] === 255 &&
                    buffer[1] === 216 &&
                    buffer[buffer.length - 2] === 255 &&
                    buffer[buffer.length - 1] === 217
                )
            case 'json':
                JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer))
                return true
            case 'utf8':
                return !new TextDecoder('utf-8', { fatal: true }).decode(buffer).includes('\0')
        }
    } catch {
        return false
    }
}

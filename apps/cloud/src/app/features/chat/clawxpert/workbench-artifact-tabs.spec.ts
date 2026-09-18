import type { XpertViewHostEventMessage } from '@xpert-ai/contracts'
import {
  fileTabsFromToolEvent,
  createFileArtifactTab,
  sameArtifact,
  updateArtifactTab
} from './workbench-artifact-tabs'

function event(output: unknown): XpertViewHostEventMessage {
  return {
    id: 'event',
    type: 'assistant.tool.completed',
    source: 'chatkit',
    receivedAt: '',
    hostId: 'assistant',
    threadId: 'thread',
    toolName: 'export_files',
    data: { output }
  }
}
const scope = { projectId: 'project', conversationId: 'conversation' }
const report = {
  fileName: 'report.pdf',
  filePath: '/report.pdf',
  fileUrl: 'https://files/report.pdf',
  mimeType: 'application/pdf'
}

describe('file preview tabs', () => {
  it('opens each exported file independently using the existing file-output contract', () => {
    const tabs = fileTabsFromToolEvent(
      event(
        JSON.stringify({
          files: [
            report,
            { fileName: 'image.png', filePath: '/image.png', fileUrl: 'https://files/image.png', mimeType: 'image/png' }
          ]
        })
      ),
      scope
    )
    expect(tabs.map((tab) => tab.title)).toEqual(['report.pdf', 'image.png'])
    expect(tabs[0].id).not.toBe(tabs[1].id)
    expect(tabs[0].resource).toMatchObject({ type: 'file', file: { mimeType: 'application/pdf' } })
  })

  it('reads existing content-and-artifact file payloads without a plugin manifest', () => {
    const tabs = fileTabsFromToolEvent(event({ artifact: { files: [report] } }), scope)
    expect(tabs.map((tab) => tab.title)).toEqual(['report.pdf'])
  })

  it.each([
    { files: [report], success: false },
    { files: [report], status: 'failed' },
    { files: [report], status: 'running' },
    '{"files":',
    { document: { id: 'document-1', title: 'Native editor document' } },
    { files: [{ ...report, fileUrl: 'javascript:alert(1)' }] }
  ])('ignores unsuccessful, malformed, non-file, and unsafe outputs', (output) => {
    expect(fileTabsFromToolEvent(event(output), scope)).toEqual([])
  })

  it('deduplicates repeated file entries in one tool response', () => {
    expect(fileTabsFromToolEvent(event({ files: [report, report] }), scope)).toHaveLength(1)
  })

  it('isolates identical file paths by assistant and project', () => {
    const input = event({ files: [report] })
    const first = fileTabsFromToolEvent(input, scope)[0]
    expect(fileTabsFromToolEvent(input, { projectId: 'other' })[0].id).not.toBe(first.id)
    expect(fileTabsFromToolEvent({ ...input, hostId: 'other' }, scope)[0].id).not.toBe(first.id)
  })

  it('matches tree paths and agent workspace paths across conversations in one personal workspace', () => {
    const file = { name: 'report.pdf', url: 'https://files/report.pdf' }
    const tree = createFileArtifactTab(file, 'assistant', { conversationId: 'one' }, undefined, 'shared/report.pdf')
    const generated = createFileArtifactTab(
      file,
      'assistant',
      { conversationId: 'two' },
      undefined,
      '/workspace/shared/report.pdf'
    )
    expect(sameArtifact(tree, generated)).toBe(true)
    const otherFolder = createFileArtifactTab(file, 'assistant', {}, undefined, 'workspace/shared/report.pdf')
    expect(sameArtifact(tree, otherFolder)).toBe(false)
  })

  it('keeps the tab identity when a summary adds an asset ID and a new signed URL', () => {
    const [first] = fileTabsFromToolEvent(event({ files: [report] }), scope)
    const next = createFileArtifactTab(
      { fileAssetId: 'asset-1', name: 'report.pdf', url: 'https://files/report.pdf?sig=2' },
      'assistant',
      scope,
      undefined,
      '/report.pdf'
    )
    expect(sameArtifact(first, next)).toBe(true)
    expect(updateArtifactTab(first, next)).toMatchObject({
      id: first.id,
      revision: 1,
      resource: { file: { fileAssetId: 'asset-1', url: 'https://files/report.pdf?sig=2' } }
    })
  })

  it('keeps file identity stable when signed preview URLs change', () => {
    const first = createFileArtifactTab(
      { id: 'file', name: 'Report', url: 'https://files/report?sig=1' },
      'assistant',
      scope
    )
    const next = createFileArtifactTab(
      { id: 'file', name: 'Report', url: 'https://files/report?sig=2' },
      'assistant',
      scope
    )
    expect(first.id).toBe(next.id)
  })
})

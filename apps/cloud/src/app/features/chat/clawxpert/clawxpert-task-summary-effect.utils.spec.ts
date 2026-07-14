import { getTaskSummaryResourceTarget } from './clawxpert-task-summary-effect.utils'

describe('getTaskSummaryResourceTarget', () => {
  it.each([
    [
      {
        type: 'workspace_file',
        workspacePath: '/workspace/report.pdf',
        fileAssetId: 'file-1'
      },
      {
        type: 'workspace_file',
        workspacePath: '/workspace/report.pdf',
        fileAssetId: 'file-1',
        storageFileId: undefined,
        conversationId: 'conversation-1',
        title: 'Report'
      }
    ],
    [
      { type: 'artifact', artifactId: 'artifact-1' },
      {
        type: 'artifact',
        artifactId: 'artifact-1',
        conversationId: 'conversation-1',
        title: 'Report'
      }
    ],
    [
      { type: 'browser', serviceId: 'service-1', url: 'https://example.com/' },
      {
        type: 'browser',
        serviceId: 'service-1',
        url: 'https://example.com/',
        conversationId: 'conversation-1',
        title: 'Report'
      }
    ],
    [
      { type: 'url', url: 'https://example.com/report' },
      {
        type: 'url',
        url: 'https://example.com/report',
        conversationId: 'conversation-1',
        title: 'Report'
      }
    ]
  ])('parses a supported %s resource', (resource, expected) => {
    expect(
      getTaskSummaryResourceTarget({
        name: 'task_summary.open_resource',
        data: {
          resource,
          conversationId: 'conversation-1',
          title: 'Report'
        }
      })
    ).toEqual(expected)
  })

  it.each(['javascript:alert(1)', 'file:///tmp/report.html', '/relative/path'])(
    'rejects unsafe URL protocols: %s',
    (url) => {
      expect(
        getTaskSummaryResourceTarget({
          name: 'task_summary.open_resource',
          data: { resource: { type: 'url', url } }
        })
      ).toBeNull()
    }
  )

  it('ignores unrelated effects', () => {
    expect(
      getTaskSummaryResourceTarget({
        name: 'knowledgebase.open_citation',
        data: { resource: { type: 'artifact', artifactId: 'artifact-1' } }
      })
    ).toBeNull()
  })
})

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

  it('preserves pinned artifact versions and both review endpoints', () => {
    const open = (resource: unknown) =>
      getTaskSummaryResourceTarget({ name: 'task_summary.open_resource', data: { resource } })
    expect(open({ type: 'artifact', artifactId: 'a', artifactVersionId: 'v1' })).toMatchObject({
      artifactVersionId: 'v1'
    })
    const resource = {
      type: 'file_change',
      first: { artifactId: 'a', artifactVersionId: 'v1' },
      last: { artifactId: 'b', artifactVersionId: 'v2' }
    }
    expect(open(resource)).toMatchObject(resource)
    expect(open({ ...resource, last: { artifactId: 'b' } })).toBeNull()
  })

  it('ignores unrelated effects', () => {
    expect(
      getTaskSummaryResourceTarget({
        name: 'knowledgebase.open_citation',
        data: { resource: { type: 'artifact', artifactId: 'artifact-1' } }
      })
    ).toBeNull()
  })
})

describe('message review resource boundary', () => {
  const resource = {
    type: 'file_change_set',
    messageId: 'm',
    changes: [
      {
        workspacePath: 'a.ts',
        resource: {
          type: 'file_change',
          first: { artifactId: 'a', artifactVersionId: '1' },
          last: { artifactId: 'b', artifactVersionId: '2' }
        }
      }
    ]
  }
  const parse = (value: unknown) =>
    getTaskSummaryResourceTarget({ name: 'task_summary.open_resource', data: { conversationId: 'c', resource: value } })
  it('preserves fixed versions and message membership', () => {
    expect(parse(resource)).toEqual({ ...resource, conversationId: 'c', title: undefined })
  })
  it('rejects malformed or unbounded groups rather than guessing another scope', () => {
    expect(parse({ ...resource, messageId: '' })).toBeNull()
    expect(parse({ ...resource, changes: [] })).toBeNull()
    expect(
      parse({ ...resource, changes: [{ workspacePath: 'a', resource: { type: 'file_change', first: {} } }] })
    ).toBeNull()
    expect(parse({ ...resource, changes: Array.from({ length: 1025 }, () => resource.changes[0]) })).toBeNull()
  })
})

import {
  workspaceFileMutationMetadata,
  workspaceFileMutationPath,
  workspaceRelativeFilePathSchema
} from './workspace-file-tools'

describe('portable file tool inputs', () => {
  it('accepts named relative files and rejects ambiguous or escaping paths', () => {
    for (const path of [
      'dashboards/sales.html',
      'scripts/销售分析.py',
      'data/sales report.csv',
      '.xpert/skills/a/SKILL.md'
    ])
      expect(workspaceRelativeFilePathSchema.parse(path)).toBe(path)
    for (const path of [
      '',
      '  .html',
      '/workspace/a.html',
      '../a',
      'a/../b',
      'a//b',
      './a',
      'a/ b',
      'a /b',
      'C:/a',
      'a\\b',
      'a\0b',
      'a\nb',
      'a'.repeat(1025)
    ])
      expect(workspaceRelativeFilePathSchema.safeParse(path).success).toBe(false)
  })
  it('observes explicitly declared mutations only, using their declared path argument', () => {
    expect(workspaceFileMutationPath(workspaceFileMutationMetadata, { file_path: 'page.html' })).toBe('page.html')
    expect(workspaceFileMutationPath(undefined, { file_path: 'page.html' })).toBeUndefined()
    expect(
      workspaceFileMutationPath(
        { workspaceFileOperation: { type: 'read', pathArgument: 'path' } },
        { path: 'page.html' }
      )
    ).toBeUndefined()
    expect(workspaceFileMutationPath(workspaceFileMutationMetadata, { html: 'page.html' })).toBeUndefined()
    expect(
      workspaceFileMutationPath(
        { workspaceFileOperation: { type: 'mutation', pathArgument: 'path' }, label: 'Custom file writer' },
        { path: 'page.html' }
      )
    ).toBe('page.html')
  })
  it('ignores malformed metadata and invalid paths instead of treating them as file mutations', () => {
    for (const metadata of [
      null,
      'mutation',
      {},
      { workspaceFileOperation: null },
      { workspaceFileOperation: { type: 'mutation', pathArgument: '' } }
    ])
      expect(workspaceFileMutationPath(metadata, { file_path: 'page.html' })).toBeUndefined()
    for (const file_path of [null, [], '../page.html', '/workspace/page.html', '  .html'])
      expect(workspaceFileMutationPath(workspaceFileMutationMetadata, { file_path })).toBeUndefined()
  })
})

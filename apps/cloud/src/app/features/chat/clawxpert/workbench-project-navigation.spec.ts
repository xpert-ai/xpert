import { openWorkbenchProject } from './workbench-project-navigation'

describe('atomic Project and View navigation', () => {
  it('resolves a unique manifest alias and passes the Case in one navigation', async () => {
    const onChatProjectChange = jest.fn(async () => true)
    await openWorkbenchProject(
      { projectId: 'project-b', view: { viewKey: 'studio', selectionId: 'case-b', parameters: { tab: 'features' } } },
      [{ viewKey: 'provider__studio' }],
      { onChatProjectChange }
    )
    expect(onChatProjectChange).toHaveBeenCalledTimes(1)
    expect(onChatProjectChange).toHaveBeenCalledWith('project-b', {
      viewKey: 'provider__studio',
      selectionId: 'case-b',
      parameters: { tab: 'features' }
    })
  })
  it('does not change Projects when the target View is missing or ambiguous', () => {
    const onChatProjectChange = jest.fn()
    for (const views of [[], [{ viewKey: 'one__studio' }, { viewKey: 'two__studio' }]]) {
      expect(() =>
        openWorkbenchProject({ projectId: 'project-b', view: { viewKey: 'studio' } }, views, { onChatProjectChange })
      ).toThrow('not available')
    }
    expect(onChatProjectChange).not.toHaveBeenCalled()
  })
  it('keeps plain Project selection compatible and surfaces cancelled navigation', async () => {
    const onChatProjectChange = jest.fn(async () => false)
    expect(await openWorkbenchProject({ projectId: 'project-b' }, [], { onChatProjectChange })).toBe(false)
    expect(onChatProjectChange).toHaveBeenCalledWith('project-b')
  })
})

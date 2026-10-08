import { signal } from '@angular/core'
import { XpertTypeEnum, type IXpert, type TXpertTeamDraft } from '@xpert-ai/contracts'
import { defer, of, Subject, type Observable } from 'rxjs'
import { createStudioSettingsSource } from './studio-settings-source'

function fixture() {
  const draft = signal<TXpertTeamDraft>({
    team: { id: 'assistant', title: 'Before', agent: { key: 'primary' } },
    nodes: [{ key: 'primary', type: 'agent', position: { x: 25, y: 50 }, entity: { key: 'primary', prompt: 'Keep' } }],
    connections: []
  })
  const api = {
    get storage() {
      return draft()
    },
    viewModel: draft,
    team: signal<IXpert>({ id: 'assistant', name: 'assistant', type: XpertTypeEnum.Agent }),
    _draft: { set: draft.set },
    unsaved: signal(false),
    draftSaving: signal(false),
    draftSaveError: signal<string | null>(null),
    saveDraft: jest.fn(() =>
      defer(() => {
        api.unsaved.set(false)
        return of(structuredClone(draft()))
      })
    ),
    getXpertTeam: jest.fn(
      (_id: string): Observable<IXpert> => of({ ...draft().team, name: 'assistant', type: XpertTypeEnum.Agent })
    ),
    initRole: jest.fn((team: IXpert) => {
      draft.update((current) => ({ ...current, team }))
    }),
    refreshSettingsView: jest.fn()
  }
  return { api, draft }
}

describe('Studio settings live draft', () => {
  it('shares the canvas draft without writing on open, and discards only settings edits', () => {
    const { api, draft } = fixture()
    api.unsaved.set(true)
    const before = structuredClone(draft())
    const source = createStudioSettingsSource(api)
    expect(source.draft).toBe(api.viewModel)
    expect(api.saveDraft).not.toHaveBeenCalled()
    source.update((value) => ({ ...value, team: { ...value.team, title: 'Changed' } }))
    expect(draft().team.title).toBe('Changed')
    expect(draft().nodes).toEqual(before.nodes)
    expect(api.saveDraft).not.toHaveBeenCalled()
    source.discard()
    expect(draft()).toEqual(before)
    expect(api.unsaved()).toBe(true)
  })

  it('uses the shared save path and rebases discard on the most recent explicit save', async () => {
    const { api, draft } = fixture()
    const source = createStudioSettingsSource(api)
    source.update((value) => ({ ...value, team: { ...value.team, title: 'Saved' } }))
    await source.save()
    source.update((value) => ({ ...value, team: { ...value.team, title: 'Discard me' } }))
    source.discard()
    expect(draft().team.title).toBe('Saved')
    expect(api.saveDraft).toHaveBeenCalledTimes(1)
    expect(api.unsaved()).toBe(false)
    source.update((value) => ({ ...value, team: { ...value.team, title: 'Saved' } }))
    expect(api.unsaved()).toBe(false)
  })

  it('does not overwrite edits made while a publish reload is in flight, or a different assistant', async () => {
    const { api, draft } = fixture()
    const loaded = new Subject<IXpert>()
    api.getXpertTeam.mockReturnValue(loaded)
    const source = createStudioSettingsSource(api)
    const reloading = source.reload()
    source.update((value) => ({ ...value, team: { ...value.team, title: 'New edit' } }))
    loaded.next({ ...draft().team, name: 'assistant', type: XpertTypeEnum.Agent, title: 'Published' })
    await reloading
    expect(api.initRole).not.toHaveBeenCalled()
    expect(draft().team.title).toBe('New edit')
    draft.update((value) => ({ ...value, team: { ...value.team, id: 'another' } }))
    source.discard()
    source.update((value) => ({ ...value, team: { ...value.team, title: 'Wrong' } }))
    expect(draft().team.title).toBe('New edit')
  })
})

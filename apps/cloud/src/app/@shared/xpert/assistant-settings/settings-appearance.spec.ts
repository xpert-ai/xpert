import { XpertWorkbenchInitialLayoutEnum, type TXpertTeamDraft } from '@xpert-ai/contracts'
import { createXpertSettingsForm } from './xpert-settings.form'
import { applyXpertSettingsChanges } from './xpert-settings.patch'

describe('Assistant message appearance draft', () => {
  const fixture = (): TXpertTeamDraft => ({
    team: { options: { scale: 0.8, workbench: { defaultViewKey: 'knowledge' } } },
    nodes: [],
    connections: []
  })

  it.each(['transcript', 'bubbles'] as const)('persists %s independently of layout and other draft fields', (mode) => {
    const draft = fixture()
    const form = createXpertSettingsForm(draft.team)
    const before = form.getRawValue()
    expect(before.workbench.messagePresentation).toBeNull()
    form.controls.workbench.controls.messagePresentation.setValue(mode)
    const updated = applyXpertSettingsChanges(draft, before, form.getRawValue(), 'workbench')
    expect(updated.team.options).toEqual({ ...draft.team.options, messagePresentation: { mode } })
    expect(createXpertSettingsForm(updated.team).controls.workbench.controls.messagePresentation.value).toBe(mode)
    expect(updated.nodes).toBe(draft.nodes)
    expect(draft.team.options.messagePresentation).toBeUndefined()
  })

  it('removes the override when inheriting and preserves concurrent layout edits', () => {
    const draft = fixture()
    draft.team.options.messagePresentation = { mode: 'bubbles' }
    const form = createXpertSettingsForm(draft.team)
    const before = form.getRawValue()
    form.controls.workbench.controls.messagePresentation.setValue(null)
    draft.team.options.workbench.initialLayout = XpertWorkbenchInitialLayoutEnum.OverlayDialog
    const result = applyXpertSettingsChanges(draft, before, form.getRawValue(), 'workbench')
    expect(result.team.options.messagePresentation).toBeUndefined()
    expect(result.team.options.workbench).toEqual(draft.team.options.workbench)
  })

  it('does not replace another editor’s message mode when only layout changes', () => {
    const draft = fixture()
    const before = createXpertSettingsForm(draft.team).getRawValue()
    const after = structuredClone(before)
    after.workbench.initialLayout = XpertWorkbenchInitialLayoutEnum.TwoColumns
    draft.team.options.messagePresentation = { mode: 'bubbles' }
    expect(applyXpertSettingsChanges(draft, before, after, 'workbench').team.options.messagePresentation).toEqual({
      mode: 'bubbles'
    })
  })
})

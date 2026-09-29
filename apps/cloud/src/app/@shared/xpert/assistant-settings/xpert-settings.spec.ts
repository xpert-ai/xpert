import { DIALOG_DATA } from '@angular/cdk/dialog'
import { signal } from '@angular/core'
import { TestBed, fakeAsync, tick } from '@angular/core/testing'
import { FormControl } from '@angular/forms'
import {
  AiModelTypeEnum,
  XpertWorkbenchInitialLayoutEnum,
  type TCopilotModel,
  type TXpertTeamDraft
} from '@xpert-ai/contracts'
import { createXpertSettingsForm, modelValidator } from './xpert-settings.form'
import { applyXpertSettingsChanges } from './xpert-settings.patch'
import { XpertSettingsEditor } from './xpert-settings.editor'
import { DraftSaveQueue } from './draft-save-queue'
import type { XpertSettingsSource } from './xpert-settings.types'

const primary = { copilotId: 'provider', model: 'primary', modelType: AiModelTypeEnum.LLM } satisfies TCopilotModel
const alternative = { ...primary, model: 'alternative' }
const draftFixture = (): TXpertTeamDraft => ({
  team: {
    id: 'assistant-test',
    title: 'Original',
    name: 'immutable-name',
    workspaceDataScope: 'user',
    copilotModel: primary,
    agent: { key: 'leader', copilotModel: primary },
    agentConfig: { recursionLimit: 300 },
    options: { scale: 0.8, workbench: { defaultViewKey: 'existing-view' } },
    memory: { enabled: true, copilotModel: alternative, profile: { enabled: true, afterSeconds: 25, prompt: 'Keep' } }
  },
  nodes: [
    {
      type: 'agent',
      key: 'leader',
      position: { x: 2, y: 3 },
      entity: { key: 'leader', copilotModel: primary, prompt: 'Preserve me' }
    }
  ],
  connections: []
})

describe('unified Assistant settings draft merge', () => {
  it('only changes edited general fields, preserving the graph and immutable identity', () => {
    const draft = draftFixture(),
      before = createXpertSettingsForm(draft.team).getRawValue()
    const after = structuredClone(before)
    after.general.title = 'Edited'
    const concurrent = { ...draft, team: { ...draft.team, description: 'Changed elsewhere' } }
    const result = applyXpertSettingsChanges(concurrent, before, after, 'general')
    expect(result.team).toEqual({ ...concurrent.team, title: 'Edited' })
    expect(result.nodes).toBe(draft.nodes)
    expect(draft.team.title).toBe('Original')
  })

  it('preserves view selection and canvas options when changing the initial layout', () => {
    const draft = draftFixture(),
      before = createXpertSettingsForm(draft.team).getRawValue()
    const after = structuredClone(before)
    after.workbench.initialLayout = XpertWorkbenchInitialLayoutEnum.OverlayDialog
    const result = applyXpertSettingsChanges(draft, before, after, 'workbench')
    expect(result.team.options).toEqual({
      scale: 0.8,
      workbench: { defaultViewKey: 'existing-view', initialLayout: XpertWorkbenchInitialLayoutEnum.OverlayDialog }
    })
  })

  it('migrates inherited legacy primary models while preserving explicit node overrides', () => {
    const draft = draftFixture(),
      before = createXpertSettingsForm(draft.team).getRawValue()
    const after = structuredClone(before)
    after.models.primary = alternative
    const result = applyXpertSettingsChanges(draft, before, after, 'models')
    expect(result.team.agent.copilotModel).toEqual(alternative)
    expect(result.nodes[0].entity).toEqual(expect.objectContaining({ prompt: 'Preserve me', copilotModel: undefined }))
    draft.nodes = [
      { ...draft.nodes[0], type: 'agent', entity: { key: 'leader', copilotModel: { ...primary, model: 'explicit' } } }
    ]
    expect(applyXpertSettingsChanges(draft, before, after, 'models').nodes).toBe(draft.nodes)
  })

  it('does not rewrite unrelated long-term memory fields when toggling a profile', () => {
    const draft = draftFixture(),
      before = createXpertSettingsForm(draft.team).getRawValue()
    const after = structuredClone(before)
    after.memory.longTerm.profileEnabled = false
    const result = applyXpertSettingsChanges(draft, before, after, 'memory')
    expect(result.team.memory).toEqual({
      ...draft.team.memory,
      profile: { ...draft.team.memory.profile, enabled: false }
    })
    expect(result.team.summarize).toBeUndefined()
    expect(result.team.features).toBeUndefined()
  })

  it('preserves the hidden attachment source mode and other feature settings', () => {
    const draft = draftFixture()
    draft.team.features = {
      opener: { enabled: true, message: 'Hi', questions: ['Q'] },
      suggestion: { enabled: false, prompt: 'Keep' },
      textToSpeech: { enabled: false },
      speechToText: { enabled: false },
      attachment: { enabled: true, type: 'url', maxNum: 2 }
    }
    const before = createXpertSettingsForm(draft.team).getRawValue(),
      after = structuredClone(before)
    after.files.maxNum = 5
    const result = applyXpertSettingsChanges(draft, before, after, 'files')
    expect(result.team.features.attachment).toEqual({ enabled: true, type: 'url', maxNum: 5 })
    expect(result.team.features.opener).toEqual(draft.team.features.opener)
  })

  it('keeps unset concurrency unset when changing only recursion', () => {
    const draft = draftFixture(),
      before = createXpertSettingsForm(draft.team).getRawValue(),
      after = structuredClone(before)
    after.runtime.recursionLimit = 500
    expect(applyXpertSettingsChanges(draft, before, after, 'runtime').team.agentConfig).toEqual({ recursionLimit: 500 })
  })
})

describe('settings validation', () => {
  it('rejects duplicate and incomplete selectable models', () => {
    const form = createXpertSettingsForm(draftFixture().team).controls.models
    form.controls.allowed.push(new FormControl(primary, modelValidator))
    expect(form.hasError('duplicateModels')).toBe(true)
    form.controls.allowed.at(0).setValue(alternative)
    expect(form.valid).toBe(true)
    form.controls.allowed.at(0).setValue(null)
    expect(form.invalid).toBe(true)
  })
  it('uses the runtime summary defaults, and requires room for at least four summarized messages', () => {
    const form = createXpertSettingsForm({}).controls.memory.controls.summary
    expect(form.getRawValue()).toEqual({ enabled: false, maxMessages: 100, retainMessages: 90, prompt: '' })
    form.patchValue({ enabled: true, retainMessages: 99 })
    expect(form.invalid).toBe(true)
    form.controls.retainMessages.setValue(20)
    expect(form.valid).toBe(true)
  })
  it('rejects fractional counts, out of range scores and enabled speech without models', () => {
    const form = createXpertSettingsForm({})
    form.controls.files.controls.maxNum.setValue(2.5)
    expect(form.controls.files.invalid).toBe(true)
    form.controls.runtime.controls.maxConcurrency.setValue(101)
    expect(form.controls.runtime.invalid).toBe(true)
    form.controls.memory.controls.reply.controls.scoreThreshold.setValue(0.7)
    expect(form.controls.memory.invalid).toBe(true)
    form.controls.speech.controls.ttsEnabled.setValue(true)
    expect(form.controls.speech.hasError('speechModel')).toBe(true)
  })
})

describe('settings editor', () => {
  function setup() {
    const draft = signal(draftFixture()),
      unsaved = signal(false),
      error = signal<string | null>(null)
    const save = jest.fn(async () => {
      unsaved.set(false)
    })
    const source: XpertSettingsSource = {
      id: 'assistant-test',
      draft,
      unsaved,
      error,
      saving: signal(false),
      workspaceDataScope: 'user',
      update: (change) => {
        draft.update(change)
        unsaved.set(true)
      },
      save
    }
    TestBed.configureTestingModule({
      providers: [{ provide: DIALOG_DATA, useValue: { source, section: 'general', selectSection: jest.fn() } }]
    })
    return { editor: TestBed.runInInjectionContext(() => new XpertSettingsEditor()), source, save }
  }
  afterEach(() => TestBed.resetTestingModule())
  it('does not save untouched defaults and retains edits across category changes', fakeAsync(() => {
    const { editor, source, save } = setup()
    tick(700)
    expect(save).not.toHaveBeenCalled()
    editor.form.controls.general.controls.title.setValue('Changed')
    editor.select('memory')
    editor.select('general')
    expect(editor.form.controls.general.controls.title.value).toBe('Changed')
    expect(source.draft().team.title).toBe('Changed')
    tick(700)
    expect(save).toHaveBeenCalledTimes(1)
  }))
  it('holds invalid changes locally while saving valid edits in another category', fakeAsync(() => {
    const { editor, source } = setup()
    editor.form.controls.runtime.controls.recursionLimit.setValue(1)
    editor.form.controls.general.controls.title.setValue('Valid')
    tick(700)
    expect(source.draft().team.agentConfig.recursionLimit).toBe(300)
    expect(source.draft().team.title).toBe('Valid')
    expect(editor.invalidSections()).toEqual(['runtime'])
    editor.form.controls.runtime.controls.recursionLimit.setValue(400)
    expect(editor.invalidSections()).toEqual([])
    tick(700)
    expect(source.draft().team.agentConfig.recursionLimit).toBe(400)
  }))
  it('retains the draft and allows retry after a failed save', async () => {
    const { editor, source, save } = setup()
    editor.form.controls.general.controls.title.setValue('Retry me')
    save.mockRejectedValueOnce(new Error('Offline'))
    expect(await editor.save()).toBe(false)
    expect(source.unsaved()).toBe(true)
    expect(await editor.save()).toBe(true)
    expect(source.draft().team.title).toBe('Retry me')
  })
})

describe('draft save queue', () => {
  it('writes A again when the user reverts to A after queuing B', async () => {
    const queue = new DraftSaveQueue<{ title: string }>()
    const write = jest.fn(async (snapshot: { title: string }) => snapshot)
    await Promise.all([
      queue.save({ title: 'A' }, write),
      queue.save({ title: 'B' }, write),
      queue.save({ title: 'A' }, write)
    ])
    expect(write.mock.calls.map(([snapshot]) => snapshot.title)).toEqual(['A', 'B', 'A'])
  })
  it('serializes different snapshots, deduplicates identical saves and recovers after rejection', async () => {
    const queue = new DraftSaveQueue<{ version: number }>()
    let rejectFirst: (error: Error) => void
    const write = jest.fn((snapshot: { version: number }) =>
      snapshot.version === 1
        ? new Promise<{ version: number }>((_, reject) => {
            rejectFirst = reject
          })
        : Promise.resolve(snapshot)
    )
    const first = queue.save({ version: 1 }, write)
    expect(queue.save({ version: 1 }, write)).toBe(first)
    const second = queue.save({ version: 2 }, write)
    await Promise.resolve()
    expect(write).toHaveBeenCalledTimes(1)
    rejectFirst(new Error('Disconnected'))
    await expect(first).rejects.toThrow('Disconnected')
    await expect(second).resolves.toEqual({ version: 2 })
    expect(write.mock.calls.map(([snapshot]) => snapshot.version)).toEqual([1, 2])
  })
  it('captures a snapshot before the caller can mutate it', async () => {
    const queue = new DraftSaveQueue<{ title: string }>(),
      value = { title: 'First' }
    const result = queue.save(value, async (snapshot) => snapshot)
    value.title = 'Later'
    await expect(result).resolves.toEqual({ title: 'First' })
  })
})

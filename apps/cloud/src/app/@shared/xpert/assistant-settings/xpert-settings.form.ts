import { AbstractControl, FormArray, FormControl, FormGroup, Validators, type ValidatorFn } from '@angular/forms'
import {
  DEFAULT_XPERT_AGENT_RECURSION_LIMIT,
  type ITag,
  type IXpert,
  type TAvatar,
  type TCopilotModel,
  type TXpertAttachmentType,
  XpertWorkbenchInitialLayoutEnum
} from '@xpert-ai/contracts'

const text = (value?: string) => new FormControl(value ?? '', { nonNullable: true })
const toggle = (value?: boolean) => new FormControl(value ?? false, { nonNullable: true })
const number = (value: number | null, min: number, max: number) =>
  new FormControl(value, [Validators.min(min), Validators.max(max)])
export const modelIdentity = (value: TCopilotModel | null | undefined) =>
  value?.referencedId ||
  (value?.copilotId && value.model ? `${value.copilotId}:${value.modelType ?? 'llm'}:${value.model}` : null)
export const modelValidator: ValidatorFn = (control) => (modelIdentity(control.value) ? null : { modelRequired: true })
export const integerValidator: ValidatorFn = (control) =>
  control.value == null || Number.isInteger(control.value) ? null : { integer: true }

export function createXpertSettingsForm(team: Partial<IXpert>) {
  const features = team.features
  const general = new FormGroup({
    avatar: new FormControl<TAvatar | null>(team.avatar ?? null),
    title: text(team.title),
    description: text(team.description),
    tags: new FormControl<ITag[]>(team.tags ?? [], { nonNullable: true })
  })
  const models = new FormGroup({
    primary: new FormControl<TCopilotModel | null>(team.copilotModel ?? null, modelValidator),
    allowed: new FormArray(
      (team.options?.modelSelection?.allowedModels ?? []).map(
        (model) => new FormControl<TCopilotModel | null>(model, modelValidator)
      )
    )
  })
  models.addValidators(() => {
    const identities = [models.controls.primary.value, ...models.controls.allowed.getRawValue()]
      .map(modelIdentity)
      .filter(Boolean)
    return new Set(identities).size === identities.length ? null : { duplicateModels: true }
  })
  const conversation = new FormGroup({
    opener: new FormGroup({
      enabled: toggle(features?.opener?.enabled),
      message: text(features?.opener?.message),
      questions: new FormArray((features?.opener?.questions ?? []).map((question) => text(question)))
    }),
    frequentQuestions: toggle(features?.frequentQuestions?.enabled),
    suggestion: new FormGroup({
      enabled: toggle(features?.suggestion?.enabled),
      prompt: text(features?.suggestion?.prompt)
    }),
    title: new FormGroup({ enabled: toggle(features?.title?.enabled), instruction: text(features?.title?.instruction) })
  })
  const workbench = new FormGroup({
    initialLayout: new FormControl(
      team.options?.workbench?.initialLayout ?? XpertWorkbenchInitialLayoutEnum.ChatkitMaximized,
      { nonNullable: true }
    ),
    defaultViewKey: new FormControl<string | null>(team.options?.workbench?.defaultViewKey ?? null)
  })
  const summary = new FormGroup({
    enabled: toggle(team.summarize?.enabled),
    maxMessages: number(team.summarize?.maxMessages ?? 100, 4, 200),
    retainMessages: number(team.summarize?.retainMessages ?? 90, 0, 200),
    prompt: text(team.summarize?.prompt)
  })
  summary.addValidators(() => {
    const { enabled, maxMessages, retainMessages } = summary.getRawValue()
    return enabled &&
      (maxMessages == null ||
        retainMessages == null ||
        !Number.isInteger(maxMessages) ||
        !Number.isInteger(retainMessages) ||
        maxMessages - retainMessages < 4)
      ? { summaryRange: true }
      : null
  })
  const memory = new FormGroup({
    summary,
    longTerm: new FormGroup({
      enabled: toggle(team.memory?.enabled),
      profileEnabled: toggle(team.memory?.profile?.enabled),
      profilePrompt: text(team.memory?.profile?.prompt),
      afterSeconds: number(team.memory?.profile?.afterSeconds ?? 10, 0, 100),
      qaEnabled: toggle(team.memory?.qa?.enabled),
      qaPrompt: text(team.memory?.qa?.prompt)
    }),
    reply: new FormGroup({
      enabled: toggle(features?.memoryReply?.enabled),
      scoreThreshold: number(features?.memoryReply?.scoreThreshold ?? 0.8, 0.8, 1)
    })
  })
  const files = new FormGroup({
    enabled: toggle(features?.attachment?.enabled),
    maxNum: number(features?.attachment?.maxNum ?? 3, 1, 10),
    fileTypes: new FormControl<TXpertAttachmentType[]>(features?.attachment?.fileTypes ?? [], { nonNullable: true })
  })
  files.controls.maxNum.addValidators([Validators.required, integerValidator])
  const speech = new FormGroup({
    ttsEnabled: toggle(features?.textToSpeech?.enabled),
    ttsModel: new FormControl<TCopilotModel | null>(features?.textToSpeech?.copilotModel ?? null),
    sttEnabled: toggle(features?.speechToText?.enabled),
    sttModel: new FormControl<TCopilotModel | null>(features?.speechToText?.copilotModel ?? null)
  })
  speech.addValidators(() => {
    const value = speech.getRawValue()
    return (value.ttsEnabled && !modelIdentity(value.ttsModel)) || (value.sttEnabled && !modelIdentity(value.sttModel))
      ? { speechModel: true }
      : null
  })
  const runtime = new FormGroup({
    maxConcurrency: number(team.agentConfig?.maxConcurrency ?? null, 1, 100),
    recursionLimit: number(team.agentConfig?.recursionLimit ?? DEFAULT_XPERT_AGENT_RECURSION_LIMIT, 100, 10000),
    sandboxEnabled: toggle(features?.sandbox?.enabled),
    sandboxProvider: text(features?.sandbox?.provider)
  })
  runtime.controls.maxConcurrency.addValidators(integerValidator)
  runtime.controls.recursionLimit.addValidators([Validators.required, integerValidator])
  runtime.addValidators(() =>
    runtime.controls.sandboxEnabled.value && !runtime.controls.sandboxProvider.value ? { sandboxProvider: true } : null
  )
  memory.controls.reply.controls.scoreThreshold.addValidators(Validators.required)
  memory.controls.longTerm.controls.afterSeconds.addValidators([Validators.required, integerValidator])

  const form = new FormGroup({ general, models, conversation, workbench, files, speech, memory, runtime })
  validateTree(form)
  return form
}

export type XpertSettingsForm = ReturnType<typeof createXpertSettingsForm>
export type XpertSettingsValue = ReturnType<XpertSettingsForm['getRawValue']>

function validateTree(control: AbstractControl) {
  if (control instanceof FormGroup || control instanceof FormArray) {
    for (const child of Object.values(control.controls)) validateTree(child)
  }
  control.updateValueAndValidity({ onlySelf: true, emitEvent: false })
}

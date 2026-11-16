import { setFileMemoryEnabled } from './settings-middleware.utils'
import { isEqual } from 'lodash-es'
import { normalizeXpertAgentConfig, type TXpertFeatures, type TXpertTeamDraft } from '@xpert-ai/contracts'
import { clearLegacyInheritedPrimaryAgentModel } from './primary-agent-model.util'
import type { XpertDraftSettingsSection } from './xpert-settings.types'
import type { XpertSettingsValue } from './xpert-settings.form'

function delta<T extends object>(before: T, after: T): Partial<T> {
  const change: Partial<T> = {}
  for (const key of Object.keys(after) as Array<keyof T>) {
    if (!isEqual(before[key], after[key])) change[key] = after[key]
  }
  return change
}

const featureDefaults: TXpertFeatures = {
  opener: { enabled: false, message: '', questions: [] },
  suggestion: { enabled: false, prompt: '' },
  textToSpeech: { enabled: false },
  speechToText: { enabled: false }
}

/** Merge edited fields into the latest draft, including fields unknown to this dialog. */
export function applyXpertSettingsChanges(
  draft: TXpertTeamDraft,
  before: XpertSettingsValue,
  after: XpertSettingsValue,
  section: XpertDraftSettingsSection
): TXpertTeamDraft {
  const team = { ...draft.team }
  const result = { ...draft, team }
  const features = () => ({ ...featureDefaults, ...team.features })
  switch (section) {
    case 'general':
      Object.assign(team, delta(before.general, after.general))
      break
    case 'models': {
      if (!isEqual(before.models.primary, after.models.primary)) {
        result.nodes = clearLegacyInheritedPrimaryAgentModel(draft) ?? draft.nodes
        team.copilotModel = after.models.primary
        team.copilotModelId = undefined
        if (team.agent) team.agent = { ...team.agent, copilotModel: after.models.primary, copilotModelId: undefined }
      }
      if (!isEqual(before.models.allowed, after.models.allowed)) {
        team.options = {
          ...team.options,
          modelSelection: { ...team.options?.modelSelection, allowedModels: after.models.allowed }
        }
      }
      break
    }
    case 'conversation': {
      const b = before.conversation,
        a = after.conversation
      team.features = features()
      if (!isEqual(b.opener, a.opener)) {
        const change = delta(b.opener, a.opener)
        team.features.opener = {
          ...team.features.opener,
          ...change,
          questions: change.questions
            ? change.questions.map(({ label, prompt }) => (label.trim() ? { label: label.trim(), prompt } : prompt))
            : team.features.opener.questions
        }
      }
      if (!isEqual(b.suggestion, a.suggestion))
        team.features.suggestion = { ...team.features.suggestion, ...delta(b.suggestion, a.suggestion) }
      if (!isEqual(b.title, a.title))
        team.features.title = { enabled: false, ...team.features.title, ...delta(b.title, a.title) }
      if (b.frequentQuestions !== a.frequentQuestions)
        team.features.frequentQuestions = { ...team.features.frequentQuestions, enabled: a.frequentQuestions }
      break
    }
    case 'workbench': {
      const { messagePresentation: beforeMode, ...beforeLayout } = before.workbench
      const { messagePresentation: afterMode, ...afterLayout } = after.workbench
      team.options = {
        ...team.options,
        workbench: { ...team.options?.workbench, ...delta(beforeLayout, afterLayout) }
      }
      if (beforeMode !== afterMode) {
        if (afterMode === null) delete team.options.messagePresentation
        else team.options.messagePresentation = { ...team.options.messagePresentation, mode: afterMode }
      }
      break
    }
    case 'files':
      team.features = {
        ...features(),
        attachment: { ...team.features?.attachment, ...delta(before.files, after.files) }
      }
      break
    case 'speech': {
      const b = before.speech,
        a = after.speech
      team.features = features()
      if (b.ttsEnabled !== a.ttsEnabled || !isEqual(b.ttsModel, a.ttsModel)) {
        team.features.textToSpeech = { ...team.features.textToSpeech, enabled: a.ttsEnabled, copilotModel: a.ttsModel }
      }
      if (b.sttEnabled !== a.sttEnabled || !isEqual(b.sttModel, a.sttModel)) {
        team.features.speechToText = { ...team.features.speechToText, enabled: a.sttEnabled, copilotModel: a.sttModel }
      }
      break
    }
    case 'memory': {
      const b = before.memory,
        a = after.memory
      if (!isEqual(b.summary, a.summary)) team.summarize = { ...team.summarize, ...delta(b.summary, a.summary) }
      if (b.enabled !== a.enabled) return setFileMemoryEnabled(result, a.enabled)
      break
    }
    case 'runtime': {
      const b = before.runtime,
        a = after.runtime
      if (b.recursionLimit !== a.recursionLimit) {
        team.agentConfig = normalizeXpertAgentConfig({ ...team.agentConfig, recursionLimit: a.recursionLimit })
      }
      // Provider changes are composed together with capabilities on explicit save.
      break
    }
  }
  return result
}

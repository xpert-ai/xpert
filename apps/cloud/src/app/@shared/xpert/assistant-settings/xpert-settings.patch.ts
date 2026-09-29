import { isEqual } from 'lodash-es'
import type { TXpertFeatures, TXpertTeamDraft } from '@xpert-ai/contracts'
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
      if (!isEqual(b.opener, a.opener)) team.features.opener = { ...team.features.opener, ...delta(b.opener, a.opener) }
      if (!isEqual(b.suggestion, a.suggestion))
        team.features.suggestion = { ...team.features.suggestion, ...delta(b.suggestion, a.suggestion) }
      if (!isEqual(b.title, a.title))
        team.features.title = { enabled: false, ...team.features.title, ...delta(b.title, a.title) }
      if (b.frequentQuestions !== a.frequentQuestions)
        team.features.frequentQuestions = { ...team.features.frequentQuestions, enabled: a.frequentQuestions }
      break
    }
    case 'workbench':
      team.options = {
        ...team.options,
        workbench: { ...team.options?.workbench, ...delta(before.workbench, after.workbench) }
      }
      break
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
      if (!isEqual(b.longTerm, a.longTerm)) {
        const change = delta(b.longTerm, a.longTerm)
        team.memory = { ...team.memory }
        if ('enabled' in change) team.memory.enabled = change.enabled
        if ('profileEnabled' in change || 'profilePrompt' in change || 'afterSeconds' in change) {
          team.memory.profile = { ...team.memory.profile }
          if ('profileEnabled' in change) team.memory.profile.enabled = change.profileEnabled
          if ('profilePrompt' in change) team.memory.profile.prompt = change.profilePrompt
          if ('afterSeconds' in change) team.memory.profile.afterSeconds = change.afterSeconds
        }
        if ('qaEnabled' in change || 'qaPrompt' in change) {
          team.memory.qa = { ...team.memory.qa }
          if ('qaEnabled' in change) team.memory.qa.enabled = change.qaEnabled
          if ('qaPrompt' in change) team.memory.qa.prompt = change.qaPrompt
        }
      }
      if (!isEqual(b.reply, a.reply))
        team.features = {
          ...features(),
          memoryReply: { enabled: false, ...team.features?.memoryReply, ...delta(b.reply, a.reply) }
        }
      break
    }
    case 'runtime': {
      const b = before.runtime,
        a = after.runtime
      if (b.maxConcurrency !== a.maxConcurrency || b.recursionLimit !== a.recursionLimit) {
        team.agentConfig = { ...team.agentConfig }
        if (b.maxConcurrency !== a.maxConcurrency) team.agentConfig.maxConcurrency = a.maxConcurrency ?? undefined
        if (b.recursionLimit !== a.recursionLimit) team.agentConfig.recursionLimit = a.recursionLimit
      }
      if (b.sandboxEnabled !== a.sandboxEnabled || b.sandboxProvider !== a.sandboxProvider) {
        team.features = {
          ...features(),
          sandbox: { ...team.features?.sandbox, enabled: a.sandboxEnabled, provider: a.sandboxProvider }
        }
      }
      break
    }
  }
  return result
}

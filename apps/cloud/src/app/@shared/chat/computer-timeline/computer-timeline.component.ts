import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, input, signal } from '@angular/core'
import {
  ChatMessageStepCategory,
  IChatConversation,
  IKnowledgeDocument,
  IXpertProjectTask,
  TChatMessageStep,
  TFile,
  TMessageComponentStep,
  TMessageContentComponent,
  TProgramToolMessage
} from '@cloud/app/@core'
import { FileEditorComponent } from '@cloud/app/@shared/files'
import { XpertProjectTasksComponent } from '@cloud/app/@shared/xpert'
import { FileTypePipe } from '@xpert-ai/core'
import { TranslateModule } from '@ngx-translate/core'
import { ZardSliderComponent } from '@xpert-ai/headless-ui'
import type { ZardSliderValue } from '@xpert-ai/headless-ui'
import type { DocumentInterface } from '@langchain/core/documents'
import { CanvasHtmlEditorComponent } from '../../../xpert/canvas/html-editor/html-editor.component'
import { ChatCanvasFileEditorComponent } from '../../../xpert/canvas/file-editor/file-editor.component'
import { ChatCanvasIframeComponent } from '../../../xpert/canvas/iframe/iframe.component'
import { ChatCanvasKnowledgesComponent } from '../../../xpert/canvas/knowledges/knowledges.component'
import { ChatSharedTerminalComponent } from '../terminal/terminal.component'

@Component({
  standalone: true,
  selector: 'xp-chat-computer-timeline',
  imports: [
    CommonModule,
    TranslateModule,
    FileTypePipe,
    FileEditorComponent,
    XpertProjectTasksComponent,
    CanvasHtmlEditorComponent,
    ChatCanvasFileEditorComponent,
    ChatCanvasIframeComponent,
    ChatCanvasKnowledgesComponent,
    ChatSharedTerminalComponent,
    ZardSliderComponent
  ],
  templateUrl: './computer-timeline.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'flex h-full min-h-0 flex-col gap-3'
  }
})
export class ChatComputerTimelineComponent {
  readonly eChatMessageStepCategory = ChatMessageStepCategory

  readonly conversation = input<IChatConversation | null>(null)
  readonly componentId = input<string | null | undefined>(null)
  readonly projectId = input<string | null | undefined>(null)

  readonly pin = signal(false)
  readonly stepIndex = signal(0)

  readonly stepContents = computed(() => {
    const messages = this.conversation()?.messages ?? []
    const steps: TMessageContentComponent<TMessageComponentStep>[] = []

    for (const message of messages) {
      const contents = message.content
      if (!Array.isArray(contents)) {
        continue
      }

      for (const content of contents) {
        if (isComputerComponentContent(content)) {
          steps.push(content)
        }
      }
    }

    return steps
  })

  readonly stepMessageLength = computed(() => this.stepContents().length)
  readonly stepMessage = computed<ComputerTimelineStep | null>(() => this.stepContents()[this.stepIndex()]?.data ?? null)
  readonly stepTitleUrl = computed(() => {
    const step = this.stepMessage()
    if (!step || (step.toolset !== 'browser-use' && step.toolset !== 'file')) {
      return null
    }

    return getStepDataUrl(step.data)
  })
  readonly listItems = computed(() => {
    const step = this.stepMessage()
    return isStepOfCategory(step, ChatMessageStepCategory.List, isTimelineLinkItemArray) ? step.data : []
  })
  readonly webSearchItems = computed(() => {
    const step = this.stepMessage()
    return isStepOfCategory(step, ChatMessageStepCategory.WebSearch, isTimelineLinkItemArray) ? step.data : []
  })
  readonly fileStep = computed(() => {
    const step = this.stepMessage()
    return isStepOfCategory(step, ChatMessageStepCategory.File, isFileData) ? step : null
  })
  readonly filesItems = computed(() => {
    const step = this.stepMessage()
    return isStepOfCategory(step, ChatMessageStepCategory.Files, isFileDataArray) ? step.data : []
  })
  readonly programStep = computed(() => {
    const step = this.stepMessage()
    return isStepOfCategory(step, ChatMessageStepCategory.Program, isProgramToolMessage) ? step : null
  })
  readonly iframeStep = computed(() => {
    const step = this.stepMessage()
    return isStepOfCategory(step, ChatMessageStepCategory.Iframe, isFileData) ? step : null
  })
  readonly knowledgesStep = computed(() => {
    const step = this.stepMessage()
    return isStepOfCategory(step, ChatMessageStepCategory.Knowledges, isKnowledgeStepDocumentArray)
      ? step
      : null
  })
  readonly browserUseData = computed(() => {
    const step = this.stepMessage()
    if (!step || step.toolset !== 'browser-use' || !isBrowserUseData(step.data)) {
      return null
    }

    return step.data
  })
  readonly fileToolData = computed(() => {
    const step = this.stepMessage()
    if (!step || step.toolset !== 'file' || !isFileToolData(step.data)) {
      return null
    }

    return step.data
  })
  readonly projectTasks = computed(() => {
    const step = this.stepMessage()
    if (
      !step ||
      step.toolset !== 'project' ||
      (step.tool !== 'project_create_tasks' && step.tool !== 'project_update_tasks') ||
      !isProjectTaskArray(step.data)
    ) {
      return null
    }

    return step.data
  })
  readonly planningData = computed(() => {
    const step = this.stepMessage()
    if (step?.toolset !== 'planning' || step.tool !== 'create_plan' || !isPlanningStepData(step.data)) {
      return null
    }

    return step.data
  })
  readonly browserArtifact = computed(() => {
    const step = this.stepMessage()
    if (!step || step.toolset !== 'browser' || !isBrowserArtifact(step.artifact)) {
      return null
    }

    return step.artifact
  })

  constructor() {
    effect(() => {
      const total = this.stepMessageLength()

      if (!total) {
        this.stepIndex.set(0)
        return
      }

      if (this.stepIndex() >= total) {
        this.stepIndex.set(total - 1)
      }
    })

    effect(() => {
      const componentId = this.componentId()
      if (!componentId) {
        return
      }

      const stepMessage = this.stepContents().find((item) => item.id === componentId)
      if (!stepMessage) {
        return
      }

      const nextIndex = this.stepContents().indexOf(stepMessage)
      if (nextIndex > -1) {
        this.stepIndex.set(nextIndex)
      }
    })

    effect(() => {
      if (this.stepMessageLength() && !this.pin() && !this.componentId()) {
        this.stepIndex.set(this.stepMessageLength() - 1)
      }
    })
  }

  togglePin() {
    this.pin.update((state) => !state)
  }

  updateStepIndex(index: number) {
    this.stepIndex.set(index)
  }

  updateStepIndexFromSlider(value: ZardSliderValue) {
    this.updateStepIndex(typeof value === 'number' ? value : value[0])
  }

  prevStep() {
    this.stepIndex.update((state) => Math.max(0, state - 1))
  }

  nextStep() {
    this.stepIndex.update((state) => {
      const lastIndex = this.stepMessageLength() - 1
      if (lastIndex < 0) {
        return 0
      }

      return Math.min(lastIndex, state + 1)
    })
  }
}

function isComputerComponentContent(content: unknown): content is TMessageContentComponent<TMessageComponentStep> {
  if (!content || typeof content !== 'object' || !('type' in content) || content.type !== 'component') {
    return false
  }

  if (!('data' in content) || !content.data || typeof content.data !== 'object' || !('category' in content.data)) {
    return false
  }

  return content.data.category === 'Computer'
}

type ComputerTimelineStep<T = unknown> = TChatMessageStep<T>

type TimelineLinkItem = {
  title: string
  url: string
  description?: string
  content?: string
}

type BrowserUseData = {
  url?: string
  screenshot?: string
  errors?: string
}

type FileToolData = {
  extension?: string
  content?: string
  url?: string
}

type PlanningStepItem = {
  content: string
}

type PlanningStepData = {
  title: string
  steps: PlanningStepItem[]
}

type BrowserArtifact = {
  image_url: string
  title?: string
}

type KnowledgeStepDocument = DocumentInterface & {
  document: Partial<IKnowledgeDocument>
}

function isObject(value: unknown): value is object {
  return !!value && typeof value === 'object'
}

function hasOptionalStringProperty<K extends string>(value: unknown, key: K): value is { [P in K]?: string } {
  if (!isObject(value)) {
    return false
  }

  if (!(key in value)) {
    return true
  }

  const candidate = value as { [P in K]?: unknown }
  return candidate[key] === undefined || typeof candidate[key] === 'string'
}

function hasRequiredStringProperty<K extends string>(value: unknown, key: K): value is { [P in K]: string } {
  if (!hasOptionalStringProperty(value, key)) {
    return false
  }

  const candidate = value as { [P in K]?: string }
  return typeof candidate[key] === 'string'
}

function hasRequiredObjectProperty<K extends string>(value: unknown, key: K): value is { [P in K]: object } {
  if (!isObject(value) || !(key in value)) {
    return false
  }

  const candidate = value as { [P in K]?: unknown }
  return isObject(candidate[key])
}

function getStepDataUrl(value: unknown): string | null {
  if (!hasOptionalStringProperty(value, 'url')) {
    return null
  }

  return value.url ?? null
}

function isTimelineLinkItem(value: unknown): value is TimelineLinkItem {
  return hasRequiredStringProperty(value, 'title') && hasRequiredStringProperty(value, 'url')
}

function isTimelineLinkItemArray(value: unknown): value is TimelineLinkItem[] {
  return Array.isArray(value) && value.every(isTimelineLinkItem)
}

function isFileData(value: unknown): value is TFile {
  return hasRequiredStringProperty(value, 'filePath')
}

function isFileDataArray(value: unknown): value is TFile[] {
  return Array.isArray(value) && value.every(isFileData)
}

function isProgramToolMessage(value: unknown): value is TProgramToolMessage {
  return hasRequiredStringProperty(value, 'code') && hasRequiredStringProperty(value, 'output')
}

function isKnowledgeStepDocument(value: unknown): value is KnowledgeStepDocument {
  return (
    hasRequiredStringProperty(value, 'pageContent') &&
    hasRequiredObjectProperty(value, 'metadata') &&
    hasRequiredObjectProperty(value, 'document')
  )
}

function isKnowledgeStepDocumentArray(value: unknown): value is KnowledgeStepDocument[] {
  return Array.isArray(value) && value.every(isKnowledgeStepDocument)
}

function isBrowserUseData(value: unknown): value is BrowserUseData {
  return (
    isObject(value) &&
    hasOptionalStringProperty(value, 'url') &&
    hasOptionalStringProperty(value, 'screenshot') &&
    hasOptionalStringProperty(value, 'errors')
  )
}

function isFileToolData(value: unknown): value is FileToolData {
  return (
    isObject(value) &&
    hasOptionalStringProperty(value, 'extension') &&
    hasOptionalStringProperty(value, 'content') &&
    hasOptionalStringProperty(value, 'url')
  )
}

function isProjectTask(value: unknown): value is IXpertProjectTask {
  if (!hasRequiredStringProperty(value, 'name') || !hasRequiredStringProperty(value, 'status')) {
    return false
  }

  if (!('steps' in value)) {
    return false
  }

  const candidate = value as { steps?: unknown }
  return Array.isArray(candidate.steps)
}

function isProjectTaskArray(value: unknown): value is IXpertProjectTask[] {
  return Array.isArray(value) && value.every(isProjectTask)
}

function isPlanningStepItem(value: unknown): value is PlanningStepItem {
  return hasRequiredStringProperty(value, 'content')
}

function isPlanningStepData(value: unknown): value is PlanningStepData {
  if (!hasRequiredStringProperty(value, 'title') || !isObject(value) || !('steps' in value)) {
    return false
  }

  const candidate = value as { steps?: unknown }
  return Array.isArray(candidate.steps) && candidate.steps.every(isPlanningStepItem)
}

function isBrowserArtifact(value: unknown): value is BrowserArtifact {
  return hasRequiredStringProperty(value, 'image_url') && hasOptionalStringProperty(value, 'title')
}

function isStepOfCategory<T>(
  step: ComputerTimelineStep | null,
  type: ChatMessageStepCategory,
  guard: (value: unknown) => value is T
): step is ComputerTimelineStep<T> {
  return !!step && step.type === type && guard(step.data)
}

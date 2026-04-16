jest.mock('@xpert-ai/headless-ui', () => {
  const { Component, Input, Output, EventEmitter } = jest.requireActual('@angular/core')

  @Component({
    standalone: true,
    selector: 'z-slider',
    template: ''
  })
  class ZardSliderComponent {
    @Input() min?: number | string
    @Input() max?: number | string
    @Input() step?: number | string
    @Input() showTickMarks?: boolean
    @Input() showValueLabel?: boolean
    @Input() value?: number
    @Output() changeEnd = new EventEmitter<number>()
  }

  return {
    ZardSliderComponent
  }
})

jest.mock('../../../xpert/canvas/file-editor/file-editor.component', () => {
  const { Component, Input } = jest.requireActual('@angular/core')

  @Component({
    standalone: true,
    selector: 'chat-canvas-file-editor',
    template: ''
  })
  class ChatCanvasFileEditorComponent {
    @Input() step?: unknown
  }

  return { ChatCanvasFileEditorComponent }
})

jest.mock('../../../xpert/canvas/iframe/iframe.component', () => {
  const { Component, Input } = jest.requireActual('@angular/core')

  @Component({
    standalone: true,
    selector: 'chat-canvas-iframe',
    template: ''
  })
  class ChatCanvasIframeComponent {
    @Input() step?: unknown
  }

  return { ChatCanvasIframeComponent }
})

jest.mock('../../../xpert/canvas/knowledges/knowledges.component', () => {
  const { Component, Input } = jest.requireActual('@angular/core')

  @Component({
    standalone: true,
    selector: 'chat-canvas-knowledges',
    template: ''
  })
  class ChatCanvasKnowledgesComponent {
    @Input() message?: unknown
  }

  return { ChatCanvasKnowledgesComponent }
})

jest.mock('../../../xpert/canvas/html-editor/html-editor.component', () => {
  const { Component, Input } = jest.requireActual('@angular/core')

  @Component({
    standalone: true,
    selector: 'xpert-canvas-html-editor',
    template: ''
  })
  class CanvasHtmlEditorComponent {
    @Input() content?: string | null
    @Input() url?: string | null
  }

  return { CanvasHtmlEditorComponent }
})

jest.mock('@cloud/app/@shared/xpert', () => {
  const { Component, Input } = jest.requireActual('@angular/core')

  @Component({
    standalone: true,
    selector: 'xpert-project-tasks',
    template: ''
  })
  class XpertProjectTasksComponent {
    @Input() projectId?: string | null
    @Input() tasks?: unknown
  }

  return { XpertProjectTasksComponent }
})

jest.mock('../terminal/terminal.component', () => {
  const { Component, Input } = jest.requireActual('@angular/core')

  @Component({
    standalone: true,
    selector: 'xp-chat-shared-terminal',
    template: ''
  })
  class ChatSharedTerminalComponent {
    @Input() mode?: 'interactive' | 'replay'
    @Input() replayStep?: unknown
  }

  return { ChatSharedTerminalComponent }
})

jest.mock('@cloud/app/@shared/files', () => {
  const { Component, Input } = jest.requireActual('@angular/core')

  @Component({
    standalone: true,
    selector: 'pac-file-editor',
    template: ''
  })
  class FileEditorComponent {
    @Input() fileName?: string | null
    @Input() content?: string | null
  }

  return { FileEditorComponent }
})

import { TestBed } from '@angular/core/testing'
import { TranslateModule } from '@ngx-translate/core'
import { IChatConversation, IChatMessage, TMessageComponentStep, TMessageContentComponent } from '@cloud/app/@core'
import { ChatComputerTimelineComponent } from './computer-timeline.component'

describe('ChatComputerTimelineComponent', () => {
  beforeEach(async () => {
    TestBed.resetTestingModule()
    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), ChatComputerTimelineComponent]
    }).compileComponents()
  })

  afterEach(() => {
    TestBed.resetTestingModule()
    jest.clearAllMocks()
  })

  it('follows the latest computer step when not pinned', () => {
    const fixture = TestBed.createComponent(ChatComputerTimelineComponent)
    fixture.componentRef.setInput('conversation', createConversation([createMessage([createComputerStep('step-1', 'First step')])]))
    fixture.detectChanges()

    expect(fixture.nativeElement.textContent).toContain('First step')

    fixture.componentRef.setInput(
      'conversation',
      createConversation([
        createMessage([createComputerStep('step-1', 'First step')]),
        createMessage([createComputerStep('step-2', 'Second step')])
      ])
    )
    fixture.detectChanges()

    expect(fixture.nativeElement.textContent).toContain('Second step')
  })

  it('selects the requested component id when provided', () => {
    const fixture = TestBed.createComponent(ChatComputerTimelineComponent)
    fixture.componentRef.setInput(
      'conversation',
      createConversation([
        createMessage([
          createComputerStep('step-1', 'First step'),
          createComputerStep('step-2', 'Second step')
        ])
      ])
    )
    fixture.componentRef.setInput('componentId', 'step-1')
    fixture.detectChanges()

    expect(fixture.nativeElement.textContent).toContain('First step')
    expect(fixture.componentInstance.stepIndex()).toBe(0)
  })

  it('shows the empty state when the conversation has no computer steps', () => {
    const fixture = TestBed.createComponent(ChatComputerTimelineComponent)
    fixture.componentRef.setInput('conversation', createConversation([createMessage([])]))
    fixture.detectChanges()

    expect(fixture.nativeElement.textContent).toContain('PAC.Chat.ComputerTimelineEmptyTitle')
  })
})

function createConversation(messages: IChatMessage[]): IChatConversation {
  return {
    id: 'conversation-1',
    threadId: 'thread-1',
    from: 'webapp',
    messages
  }
}

function createMessage(
  content: Array<TMessageContentComponent<TMessageComponentStep>>
): IChatMessage {
  return {
    id: `message-${content.length}`,
    role: 'ai',
    content
  }
}

function createComputerStep(
  id: string,
  title: string
): TMessageContentComponent<TMessageComponentStep> {
  return {
    id,
    type: 'component',
    data: {
      id,
      category: 'Computer',
      type: 'program',
      title,
      toolset: 'shell',
      tool: 'run',
      message: title,
      data: {
        code: 'pwd',
        output: '/workspace'
      }
    }
  }
}

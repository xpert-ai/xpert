import { TestBed } from '@angular/core/testing'
import { TranslateModule } from '@ngx-translate/core'
import { of } from 'rxjs'
import { SandboxService, ToastrService } from '../../../@core'
import { ChatSharedTerminalComponent } from './terminal.component'

describe('ChatSharedTerminalComponent', () => {
  let sandboxService: {
    terminal: jest.Mock
  }
  let toastr: {
    error: jest.Mock
  }

  beforeEach(async () => {
    sandboxService = {
      terminal: jest.fn(() =>
        of(
          { event: 'message', data: 'src' },
          { event: 'message', data: 'dist' }
        )
      )
    }
    toastr = {
      error: jest.fn()
    }

    TestBed.resetTestingModule()
    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), ChatSharedTerminalComponent],
      providers: [
        {
          provide: SandboxService,
          useValue: sandboxService
        },
        {
          provide: ToastrService,
          useValue: toastr
        }
      ]
    }).compileComponents()
  })

  afterEach(() => {
    TestBed.resetTestingModule()
    jest.clearAllMocks()
  })

  it('runs interactive commands through SandboxService and appends streamed output', () => {
    const fixture = TestBed.createComponent(ChatSharedTerminalComponent)
    fixture.componentRef.setInput('mode', 'interactive')
    fixture.componentRef.setInput('conversationId', 'conversation-1')
    fixture.componentRef.setInput('projectId', 'project-1')
    fixture.detectChanges()

    const component = fixture.componentInstance
    component.currentInput.set('ls')
    component.runCommand(new Event('submit'))
    fixture.detectChanges()

    expect(sandboxService.terminal).toHaveBeenCalledWith(
      { cmd: 'ls' },
      {
        projectId: 'project-1',
        conversationId: 'conversation-1'
      }
    )
    expect(component.history()).toEqual([
      { type: 'input', text: 'ls' },
      { type: 'output', text: 'src' },
      { type: 'output', text: 'dist' }
    ])
  })

  it('renders replay content without calling the backend', () => {
    const fixture = TestBed.createComponent(ChatSharedTerminalComponent)
    fixture.componentRef.setInput('mode', 'replay')
    fixture.componentRef.setInput('replayStep', {
      id: 'bash-1',
      message: 'pwd',
      error: null,
      data: {
        code: 'pwd',
        output: '/workspace/project'
      }
    } as any)
    fixture.detectChanges()

    expect(sandboxService.terminal).not.toHaveBeenCalled()
    expect(fixture.nativeElement.textContent).toContain('pwd')
    expect(fixture.nativeElement.textContent).toContain('/workspace/project')
  })
})

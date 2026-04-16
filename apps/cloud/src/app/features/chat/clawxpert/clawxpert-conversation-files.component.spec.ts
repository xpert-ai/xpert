import { Component, Input } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { By } from '@angular/platform-browser'
import { TranslateModule } from '@ngx-translate/core'
import { ChatConversationService } from '../../../@core'
import { FileWorkbenchComponent } from '../../../@shared/files'
import { ClawXpertConversationFilesComponent } from './clawxpert-conversation-files.component'

@Component({
  standalone: true,
  selector: 'pac-file-workbench',
  template: ''
})
class MockFileWorkbenchComponent {
  @Input() rootId?: string | null
  @Input() rootLabel?: string | null
  @Input() filesLoader?: unknown
  @Input() fileLoader?: unknown
  @Input() fileSaver?: unknown
  @Input() reloadKey?: number
  @Input() treeSize?: 'sm' | 'default' | 'lg'
}

describe('ClawXpertConversationFilesComponent', () => {
  const conversationService = {
    getFiles: jest.fn(),
    getFile: jest.fn(),
    saveFile: jest.fn()
  }

  beforeEach(async () => {
    TestBed.resetTestingModule()
    TestBed.overrideComponent(ClawXpertConversationFilesComponent, {
      remove: {
        imports: [FileWorkbenchComponent]
      },
      add: {
        imports: [MockFileWorkbenchComponent]
      }
    })
    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), ClawXpertConversationFilesComponent],
      providers: [
        {
          provide: ChatConversationService,
          useValue: conversationService
        }
      ]
    }).compileComponents()
  })

  afterEach(() => {
    TestBed.resetTestingModule()
    jest.clearAllMocks()
  })

  it('passes read-only mode by omitting the fileSaver loader', () => {
    const fixture = TestBed.createComponent(ClawXpertConversationFilesComponent)
    fixture.componentRef.setInput('conversationId', 'conversation-1')
    fixture.componentRef.setInput('xpertId', 'xpert-1')
    fixture.componentRef.setInput('mode', 'readonly')
    fixture.detectChanges()

    const workbench = fixture.debugElement.query(By.directive(MockFileWorkbenchComponent)).componentInstance as MockFileWorkbenchComponent

    expect(workbench.rootId).toBe('xpert-1')
    expect(workbench.fileSaver).toBeNull()
    expect(workbench.treeSize).toBe('sm')
  })

  it('passes editable mode by providing the fileSaver loader', () => {
    const fixture = TestBed.createComponent(ClawXpertConversationFilesComponent)
    fixture.componentRef.setInput('conversationId', 'conversation-1')
    fixture.componentRef.setInput('xpertId', 'xpert-1')
    fixture.componentRef.setInput('mode', 'editable')
    fixture.componentRef.setInput('reloadKey', 3)
    fixture.detectChanges()

    const workbench = fixture.debugElement.query(By.directive(MockFileWorkbenchComponent)).componentInstance as MockFileWorkbenchComponent

    expect(typeof workbench.filesLoader).toBe('function')
    expect(typeof workbench.fileLoader).toBe('function')
    expect(typeof workbench.fileSaver).toBe('function')
    expect(workbench.reloadKey).toBe(3)
  })
})

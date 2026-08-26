import { TestBed } from '@angular/core/testing'
import { TranslateModule } from '@ngx-translate/core'
import { MarkdownEditorComponent } from './markdown-editor.component'

type MarkdownUpdatedListener = (context: unknown, markdown: string, previousMarkdown: string) => void

var mockCreate: jest.Mock<Promise<void>, []>
var mockDestroy: jest.Mock<Promise<void>, []>
var mockGetMarkdown: jest.Mock<string, []>
var mockMarkdownUpdatedListener: MarkdownUpdatedListener | null

jest.mock('@milkdown/crepe', () => {
  class Crepe {
    static Feature = {
      AI: 'ai',
      Placeholder: 'placeholder',
      TopBar: 'top-bar'
    }

    constructor(readonly config: unknown) {}

    create() {
      return mockCreate()
    }

    destroy() {
      return mockDestroy()
    }

    getMarkdown() {
      return mockGetMarkdown()
    }

    on(register: (listener: { markdownUpdated: (listener: MarkdownUpdatedListener) => void }) => void) {
      register({
        markdownUpdated: (listener) => {
          mockMarkdownUpdatedListener = listener
        }
      })
      return this
    }
  }

  return { Crepe }
})

describe('MarkdownEditorComponent', () => {
  beforeEach(async () => {
    mockCreate = jest.fn().mockResolvedValue(undefined)
    mockDestroy = jest.fn().mockResolvedValue(undefined)
    mockGetMarkdown = jest.fn().mockReturnValue('# Normalized\n')
    mockMarkdownUpdatedListener = null

    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), MarkdownEditorComponent]
    }).compileComponents()
  })

  afterEach(() => {
    TestBed.resetTestingModule()
  })

  it('uses the initialized Markdown as its baseline and emits later changes', async () => {
    const fixture = TestBed.createComponent(MarkdownEditorComponent)
    fixture.componentRef.setInput('content', '# Normalized')
    const changes: string[] = []
    fixture.componentInstance.contentChange.subscribe((content) => changes.push(content))

    fixture.detectChanges()
    await fixture.whenStable()

    expect(mockCreate).toHaveBeenCalledTimes(1)
    expect(mockMarkdownUpdatedListener).not.toBeNull()

    mockMarkdownUpdatedListener?.({}, '# Normalized\n', '# Normalized')
    mockMarkdownUpdatedListener?.({}, '# Updated\n', '# Normalized\n')

    expect(changes).toEqual(['# Updated\n'])
  })
})

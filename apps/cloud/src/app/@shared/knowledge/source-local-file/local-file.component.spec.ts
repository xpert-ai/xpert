import { TestBed } from '@angular/core/testing'
import { KnowledgebaseService, KnowledgeFileUploader } from '@cloud/app/@core'
import { KnowledgeLocalFileComponent } from './local-file.component'

describe('KnowledgeLocalFileComponent selection', () => {
  afterEach(() => TestBed.resetTestingModule())

  it('clears a removed preview while retaining the selection when removing another file', () => {
    TestBed.configureTestingModule({ providers: [{ provide: KnowledgebaseService, useValue: {} }] })
    TestBed.overrideComponent(KnowledgeLocalFileComponent, { set: { template: '', imports: [] } })
    const fixture = TestBed.createComponent(KnowledgeLocalFileComponent)
    fixture.componentRef.setInput('knowledgebaseId', 'kb')
    const component = fixture.componentInstance
    const api = TestBed.inject(KnowledgebaseService)
    const files = ['first.txt', 'second.txt'].map(
      (name) => new KnowledgeFileUploader('kb', api, new File(['content'], name), { parentId: null, path: null })
    )
    component.files.set(files)
    component.selected.set(files[1])

    component.removeFile(0)
    expect(component.selected()).toBe(files[1])
    expect(component.files()).toEqual([files[1]])

    component.removeFile(0)
    expect(component.selected()).toBeNull()
    expect(component.files()).toEqual([])
  })
})

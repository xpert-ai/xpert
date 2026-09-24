jest.mock('../../../@core', () => ({ injectEditorTheme: () => jest.requireActual('@angular/core').signal('vs-dark') }))
jest.mock('../../../@shared/files/editor/editor.component', () => ({ mapFileLanguageFromPath: () => 'typescript' }))
jest.mock('ngx-monaco-editor', () => {
  const { Component, Input, Output, EventEmitter, NgModule } = jest.requireActual('@angular/core')
  @Component({ standalone: true, selector: 'ngx-monaco-diff-editor', template: '' })
  class MockDiff {
    @Input() options: unknown
    @Input() originalModel: unknown
    @Input() modifiedModel: unknown
    @Output() onInit = new EventEmitter()
  }
  @NgModule({ imports: [MockDiff], exports: [MockDiff] })
  class MonacoEditorModule {}
  return { MonacoEditorModule }
})
import { TestBed } from '@angular/core/testing'
import type { editor } from 'monaco-editor'
import { FileChangeDiffComponent } from './file-change-diff.component'

describe('review diff editor lifecycle', () => {
  it.each([
    { before: { text: 'old' }, after: { text: 'new' }, expected: { added: 2, removed: 3 } },
    { before: null, after: { text: 'new' }, expected: { added: 2, removed: 0 } },
    { before: { text: 'old' }, after: null, expected: { added: 0, removed: 3 } },
    { before: { text: '' }, after: { text: 'new' }, expected: { added: 2, removed: 0 } }
  ])('preserves the read-only editor and counts real lines for $expected', ({ before, after, expected }) => {
    TestBed.configureTestingModule({ imports: [FileChangeDiffComponent] })
    const fixture = TestBed.createComponent(FileChangeDiffComponent)
    fixture.componentRef.setInput('report', { workspacePath: 'a.ts', before, after })
    fixture.detectChanges()
    const subscription = { dispose: jest.fn() }
    const models = { original: { dispose: jest.fn() }, modified: { dispose: jest.fn() } }
    const codeEditor = { getContentHeight: () => 88, onDidContentSizeChange: () => subscription }
    const instance = {
      getModel: () => models,
      setModel: jest.fn(),
      updateOptions: jest.fn(),
      layout: jest.fn(),
      getOriginalEditor: () => codeEditor,
      getModifiedEditor: () => codeEditor,
      onDidUpdateDiff: () => subscription,
      getLineChanges: () => [
        { originalStartLineNumber: 0, originalEndLineNumber: 0, modifiedStartLineNumber: 1, modifiedEndLineNumber: 2 },
        { originalStartLineNumber: 1, originalEndLineNumber: 3, modifiedStartLineNumber: 0, modifiedEndLineNumber: 0 }
      ]
    }
    const counts = jest.fn()
    fixture.componentInstance.stats.subscribe(counts)
    fixture.componentInstance.init(instance as unknown as editor.IStandaloneDiffEditor)
    fixture.detectChanges()
    fixture.componentRef.setInput('sideBySide', false)
    fixture.componentRef.setInput('wordWrap', true)
    fixture.componentRef.setInput('showWhitespace', true)
    fixture.detectChanges()
    expect(instance.updateOptions).toHaveBeenLastCalledWith(
      expect.objectContaining({
        renderSideBySide: false,
        wordWrap: 'on',
        diffWordWrap: 'on',
        renderWhitespace: 'all',
        theme: 'vs-dark'
      })
    )
    expect(fixture.componentInstance.initialOptions).toMatchObject({
      readOnly: true,
      originalEditable: false,
      ignoreTrimWhitespace: false
    })
    expect(counts).toHaveBeenCalledWith(expected)
    expect(models.original.dispose).not.toHaveBeenCalled()
    fixture.destroy()
    expect(instance.setModel).toHaveBeenCalledWith(null)
    expect(models.original.dispose).toHaveBeenCalledTimes(1)
    expect(models.modified.dispose).toHaveBeenCalledTimes(1)
    expect(subscription.dispose).toHaveBeenCalledTimes(2)
    TestBed.resetTestingModule()
  })
})

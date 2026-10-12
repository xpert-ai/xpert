// Formly, Monaco and execution payloads use local adapters; the frame and emoji picker are real components.
import { Component, Pipe, forwardRef, EventEmitter } from '@angular/core'
import { NG_VALUE_ACCESSOR } from '@angular/forms'
export function batchElevenChildren(imports) {
  const types = []
  function component(type, selector, template, inputs = [], outputs = [], providers = []) {
    Component({
      standalone: true,
      selector,
      imports,
      template,
      inputs,
      outputs,
      providers,
      host: { class: 'block min-w-0' }
    })(type)
    types.push(type)
  }
  class FormlyForm {
    form = null
    fields = []
    model = {}
    options = {}
    modelChange = new EventEmitter()
  }
  component(
    FormlyForm,
    'formly-form',
    '<label class="block space-y-2"><span>Name</span><input z-input class="w-full" [formControl]="form.controls.name" /></label>',
    ['form', 'fields', 'model', 'options'],
    ['modelChange']
  )
  class FormlyField {
    field = {}
  }
  component(
    FormlyField,
    'formly-field',
    '<input z-input class="w-full min-w-24" [value]="field.value" aria-label="Table value" />',
    ['field']
  )
  class Editor {
    value = ''
    options = {}
    onInit = new EventEmitter()
    onChange = () => {}
    writeValue(v) {
      this.value = v || ''
    }
    registerOnChange(fn) {
      this.onChange = fn
    }
    registerOnTouched() {}
  }
  component(
    Editor,
    'ngx-monaco-editor',
    '<textarea class="h-full w-full resize-none rounded-md border border-border p-3 font-mono text-sm" aria-label="Code" [ngModel]="value" (ngModelChange)="onChange($event)"></textarea>',
    ['options'],
    ['onInit'],
    [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => Editor), multi: true }]
  )
  class Execution {
    execution = {}
  }
  component(
    Execution,
    'xpert-agent-execution',
    '<dl class="grid grid-cols-2 gap-4"><dt class="text-muted-foreground">Agent</dt><dd>Research assistant</dd><dt class="text-muted-foreground">Status</dt><dd>Completed</dd><dt class="text-muted-foreground">Duration</dt><dd>1.2 s</dd></dl><p class="mt-6 border-t border-border pt-4 text-muted-foreground">Execution details · local sample</p>',
    ['execution']
  )
  class Relative {
    transform() {
      return '2 hours ago'
    }
  }
  Pipe({ name: 'relative', standalone: true })(Relative)
  types.push(Relative)
  return types
}

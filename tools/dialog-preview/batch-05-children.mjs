// Credential fields use their production template; API-backed rows, model picker and Monaco use local adapters.
import { Component, EventEmitter, forwardRef, signal } from '@angular/core'
import { NG_VALUE_ACCESSOR } from '@angular/forms'
export function batchFiveChildren(imports, templates) {
  const accessor = (type) => [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => type), multi: true }]
  class CredentialForm {
    credentialFormSchemas = []
    modelType = ''
    eParameterType = { BOOLEAN: 'boolean' }
    credentials = signal({})
    onChange = () => {}
    credentialSchemas() {
      return this.credentialFormSchemas
    }
    get invalid() {
      return this.credentialFormSchemas.some((f) => f.required && !this.credentials()[f.variable])
    }
    writeValue(value) {
      this.credentials.set(value || {})
    }
    registerOnChange(fn) {
      this.onChange = fn
    }
    registerOnTouched() {}
    selectedOption(credential) {
      const index =
        credential.options?.findIndex((option) => option.value === this.credentials()[credential.variable]) ?? -1
      return index < 0 ? null : index
    }
    selectOption(credential, index) {
      const option = credential.options?.[index]
      if (option) this.updateValue(credential.variable, option.value)
    }
    updateValue(key, value) {
      this.credentials.update((current) => ({ ...current, [key]: value }))
      this.onChange(this.credentials())
    }
  }
  Component({
    selector: 'copilot-credential-form',
    standalone: true,
    inputs: ['credentialFormSchemas', 'modelType'],
    imports,
    template: templates.credentialForm,
    providers: accessor(CredentialForm)
  })(CredentialForm)
  class ModelSelect {
    inheritModel = null
    modelType = ''
    value = 'preview'
    onChange = () => {}
    writeValue(value) {
      this.value = value
    }
    registerOnChange(fn) {
      this.onChange = fn
    }
    registerOnTouched() {}
  }
  Component({
    selector: 'copilot-model-select',
    standalone: true,
    inputs: ['inheritModel', 'modelType'],
    imports,
    template:
      '<z-select class="w-full" [ngModel]="value" (ngModelChange)="onChange($event)"><z-select-item zValue="preview">Preview model</z-select-item></z-select>',
    providers: accessor(ModelSelect)
  })(ModelSelect)
  class InstructionEditor {
    instruction = ''
    instructionChange = new EventEmitter()
  }
  Component({
    selector: 'copilot-instruction-editor',
    standalone: true,
    inputs: ['instruction', 'initHeight', 'lineNumbers'],
    outputs: ['instructionChange'],
    imports,
    template:
      '<textarea z-input class="h-full w-full font-mono" aria-label="Prompt editor" [ngModel]="instruction" (ngModelChange)="instructionChange.emit($event)"></textarea>'
  })(InstructionEditor)
  class Conversation {
    conversation = {}
    route = []
  }
  Component({
    selector: 'xp-sidebar-conversation',
    standalone: true,
    inputs: ['conversation', 'route'],
    template:
      '<div class="flex min-w-0 items-center gap-2 rounded-md px-2 py-3 hover:bg-muted"><i class="ri-chat-3-line" aria-hidden="true"></i><span class="truncate">{{ conversation.title }}</span></div>'
  })(Conversation)
  return [CredentialForm, ModelSelect, InstructionEditor, Conversation]
}

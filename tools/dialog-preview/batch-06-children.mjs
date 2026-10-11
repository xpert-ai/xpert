// Test panels and auth triggers use production templates; API-backed fields use local CVA adapters.
import { Component, forwardRef, signal, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core'
import { NG_VALUE_ACCESSOR } from '@angular/forms'
import { inputVariants } from '../../packages/ui/src/lib/components/input/input.variants.ts'
export function batchSixChildren(imports, templates, busy, notify) {
  const accessor = (type) => [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => type), multi: true }]
  class LocalField {
    value = ''
    type = 'text'
    placeholder = ''
    variables = []
    onChange = () => {}
    writeValue(value) {
      this.value = value ?? ''
    }
    registerOnChange(fn) {
      this.onChange = fn
    }
    registerOnTouched() {}
  }
  Component({
    selector: 'xpert-variable-input',
    standalone: true,
    imports,
    inputs: ['type', 'placeholder', 'variables'],
    host: { class: 'inline-flex flex-wrap relative min-w-0' },
    template:
      '<input class="min-w-0 flex-1 bg-transparent outline-none" [type]="type" [placeholder]="placeholder" [ngModel]="value" (ngModelChange)="onChange($event)" aria-label="Variable value" />',
    providers: accessor(LocalField)
  })(LocalField)
  class SchemaForm extends LocalField {
    schema = {}
  }
  Component({
    selector: 'json-schema-form',
    standalone: true,
    imports,
    inputs: ['schema'],
    template:
      '<label class="block space-y-2"><span>Endpoint</span><input z-input class="w-full" [ngModel]="value.endpoint" (ngModelChange)="onChange({endpoint: $event, api_key: value.api_key})" /></label><label class="block space-y-2"><span>API Key</span><input z-input class="w-full" type="password" [ngModel]="value.api_key" (ngModelChange)="onChange({endpoint: value.endpoint, api_key: $event})" /></label>',
    providers: accessor(SchemaForm)
  })(SchemaForm)
  class ParametersForm extends LocalField {
    tool = {}
  }
  Component({
    selector: 'xp-tool-parameters-form',
    standalone: true,
    inputs: ['tool'],
    imports,
    template:
      '<label class="block space-y-2"><span>Query</span><input z-input class="w-full" [ngModel]="value.query" (ngModelChange)="onChange({query: $event})" /></label>',
    providers: accessor(ParametersForm)
  })(ParametersForm)
  class AuthInput extends LocalField {
    controlClasses = inputVariants()
    credentials = signal({ auth_type: 'api_key' })
    writeValue(value) {
      this.credentials.set(value || {})
    }
    openAuth() {
      notify('授权设置请在工具授权场景中查看')
    }
  }
  Component({
    selector: 'xpert-tool-authorization-input',
    standalone: true,
    imports,
    template: templates.toolAuthInput,
    providers: accessor(AuthInput)
  })(AuthInput)
  class Spin {}
  Component({
    selector: 'xp-spin',
    standalone: true,
    imports,
    template: templates.spin,
    host: { class: 'flex items-center justify-center text-primary [&>svg]:size-6' }
  })(Spin)
  const panels = ['mcpTestBody', 'toolTestBody'].map((key) => {
    class TestPanel {
      toolValue = {}
      tool = () => this.toolValue
      loading = busy
      visibleAll = true
      parameters = signal({ query: 'Research plan' })
      parameterList = () => [{ name: 'query', type: 'text', required: true }]
      jsonSchema = () => null
      invalid = () => !this.parameters().query
      testResult = () => ''
      onParameter(name, value) {
        this.parameters.update((p) => ({ ...p, [name]: value }))
      }
      testTool() {
        busy.set(true)
      }
      stopTestTool() {
        busy.set(false)
      }
    }
    Component({
      selector: key === 'mcpTestBody' ? 'mcp-toolset-tool-test' : 'xpert-toolset-tool-test',
      standalone: true,
      inputs: ['toolValue: tool', 'visibleAll'],
      imports: [...imports, SchemaForm, ParametersForm, Spin],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
      template: templates[key]
    })(TestPanel)
    return TestPanel
  })
  return [LocalField, SchemaForm, AuthInput, Spin, ...panels]
}

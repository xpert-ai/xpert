import { Component, EventEmitter, Pipe, forwardRef, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core'
import { NG_VALUE_ACCESSOR } from '@angular/forms'
export function remainingChildren(imports, templates) {
  const types = []
  for (const [selector, key] of [
    ['xp-blank-wizard-start', 'remainingStart'],
    ['xp-blank-wizard-capabilities', 'remainingCapabilities']
  ]) {
    class Step {
      parent
      selectedSection
      vm = () => this.parent
      section = () => this.selectedSection
    }
    Component({
      selector,
      standalone: true,
      imports,
      inputs: ['parent: vm', 'selectedSection: section'],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
      template: templates[key]
    })(Step)
    types.push(Step)
  }
  for (const [name, transform] of [
    ['mask', (value) => value.slice(0, 4) + '••••••••' + value.slice(-4)],
    ['format', () => '2026-10-11 13:30'],
    ['relative', () => '2 hours ago']
  ]) {
    class Format {
      transform(...args) {
        return transform(...args)
      }
    }
    Pipe({ name, standalone: true })(Format)
    types.push(Format)
  }
  class McpConfig {
    value = {}
    valueChange = new EventEmitter()
    inValid = () => false
    writeValue(value) {
      this.value = value ?? {}
    }
    registerOnChange(fn) {
      this.changed = fn
    }
    registerOnTouched() {}
  }
  Component({
    selector: 'xpert-tool-mcp-configure',
    standalone: true,
    imports,
    outputs: ['valueChange'],
    template:
      '<label class="block space-y-2"><span>MCP name</span><input z-input class="w-full" [value]="value.name || \'Research\'" /></label>',
    providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => McpConfig), multi: true }]
  })(McpConfig)
  types.push(McpConfig)
  return types
}

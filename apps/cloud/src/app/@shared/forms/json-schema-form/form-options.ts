import { Injectable, signal } from '@angular/core'

/**
 * Default inputs keyed by rendered control name (for example `switch` or `textarea`).
 * Field-level `x-ui.inputs` take precedence over these form-scoped defaults.
 */
export type JsonSchemaControlDefaults = Record<string, Record<string, unknown>>

/**
 * Form-scoped presentation context for JSON Schema controls.
 *
 * The service is provided by each `json-schema-form` instance, so nested properties inherit
 * presentation defaults through Angular DI instead of adding and forwarding one input per
 * control option through every recursive property component.
 */
@Injectable()
export class JsonSchemaFormOptions {
  readonly controlDefaults = signal<JsonSchemaControlDefaults>({})
}

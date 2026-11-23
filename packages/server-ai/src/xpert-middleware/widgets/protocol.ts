// Adapted from the existing WidgetsMiddleware A2UI 0.8 normalization contract.
import { assertWidgetBudget, validateSurfaceGraph } from './validation'
import { validateCatalogComponent } from './catalog'

const DEFAULT_SURFACE_ID = '@default'
const DEFAULT_A2UI_WIDGET_NAME = 'generated_surface'
const SUPPORTED_A2UI_COMPONENTS = [
    'Text',
    'Image',
    'Icon',
    'Video',
    'AudioPlayer',
    'Divider',
    'Row',
    'Column',
    'List',
    'Card',
    'Tabs',
    'Modal',
    'Button',
    'CheckBox',
    'TextField',
    'DateTimeInput',
    'MultipleChoice',
    'Slider'
] as const
const SUPPORTED_A2UI_COMPONENT_SET = new Set<string>(SUPPORTED_A2UI_COMPONENTS)

type A2UIComponentArrayTemplate = {
    componentId: string
    dataBinding: string
}

type A2UIComponentArrayReference = {
    explicitList?: string[]
    template?: A2UIComponentArrayTemplate
}

type A2UIComponentProperties = {
    children?: A2UIComponentArrayReference
    child?: string
    [key: string]: unknown
}

export type A2UIComponentInstance = {
    id: string
    weight?: number
    component?: A2UIComponentProperties
}

type A2UIBeginRenderingMessage = {
    surfaceId: string
    root: string
    styles?: { [key: string]: string }
}

type A2UISurfaceUpdateMessage = {
    surfaceId: string
    components: A2UIComponentInstance[]
}

type A2UIValueMap = {
    [key: string]: unknown
    key: string
    valueString?: string
    valueNumber?: number
    valueBoolean?: boolean
    valueMap?: A2UIValueMap[]
}

type A2UIDataModelUpdate = {
    surfaceId: string
    path?: string
    contents: A2UIValueMap[]
}

type A2UIDeleteSurfaceMessage = {
    surfaceId: string
}

export type A2UIServerToClientMessage = {
    beginRendering?: A2UIBeginRenderingMessage
    surfaceUpdate?: A2UISurfaceUpdateMessage
    dataModelUpdate?: A2UIDataModelUpdate
    deleteSurface?: A2UIDeleteSurfaceMessage
}

type A2UIMessageNormalizationOptions = {
    strictCatalog?: boolean
}

export type WidgetResult = {
    name: string
    messages: A2UIServerToClientMessage[]
    values?: unknown
}

export function isPlainObject(value: unknown): value is object {
    return !!value && typeof value === 'object' && !Array.isArray(value)
}

export function readStringProperty(input: object, key: string): string | undefined {
    const value = Reflect.get(input, key)
    return typeof value === 'string' ? value : undefined
}

function readNumberProperty(input: object, key: string): number | undefined {
    const value = Reflect.get(input, key)
    return typeof value === 'number' ? value : undefined
}

function readBooleanProperty(input: object, key: string): boolean | undefined {
    const value = Reflect.get(input, key)
    return typeof value === 'boolean' ? value : undefined
}

export function readArrayProperty(input: object, key: string): unknown[] | undefined {
    const value = Reflect.get(input, key)
    return Array.isArray(value) ? value : undefined
}

function cloneJsonLike(value: unknown): unknown {
    if (value === null) {
        return null
    }
    if (Array.isArray(value)) {
        return value.map((item) => cloneJsonLike(item))
    }
    if (isPlainObject(value)) {
        const output: { [key: string]: unknown } = {}
        for (const [key, item] of Object.entries(value)) {
            output[key] = cloneJsonLike(item)
        }
        return output
    }
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return value
    }
    return undefined
}

function normalizeStringMap(value: unknown, label: string): { [key: string]: string } | undefined {
    if (value === undefined) {
        return undefined
    }
    if (!isPlainObject(value)) {
        throw new Error(`${label} must be an object with string values.`)
    }
    const output: { [key: string]: string } = {}
    for (const [key, item] of Object.entries(value)) {
        if (typeof item !== 'string') {
            throw new Error(`${label}.${key} must be a string.`)
        }
        output[key] = item
    }
    return output
}

function normalizeValueMap(raw: unknown, label: string): A2UIValueMap {
    if (!isPlainObject(raw)) {
        throw new Error(`${label} must be an object.`)
    }

    const key = readStringProperty(raw, 'key')
    if (!key) {
        throw new Error(`${label}.key must be a non-empty string.`)
    }

    const result: A2UIValueMap = { key }
    const valueString = readStringProperty(raw, 'valueString')
    const valueNumber = readNumberProperty(raw, 'valueNumber')
    const valueBoolean = readBooleanProperty(raw, 'valueBoolean')
    const valueMap = readArrayProperty(raw, 'valueMap')
    const valueCount =
        (valueString === undefined ? 0 : 1) +
        (valueNumber === undefined ? 0 : 1) +
        (valueBoolean === undefined ? 0 : 1) +
        (valueMap === undefined ? 0 : 1)

    if (valueCount !== 1) {
        throw new Error(`${label} must define exactly one valueString/valueNumber/valueBoolean/valueMap.`)
    }

    if (valueString !== undefined) {
        result.valueString = valueString
    }
    if (valueNumber !== undefined) {
        result.valueNumber = valueNumber
    }
    if (valueBoolean !== undefined) {
        result.valueBoolean = valueBoolean
    }
    if (valueMap !== undefined) {
        result.valueMap = valueMap.map((item, index) => normalizeValueMap(item, `${label}.valueMap[${index}]`))
    }

    return result
}

function shouldEnforceStrictCatalog(options: A2UIMessageNormalizationOptions | undefined): boolean {
    return options?.strictCatalog !== false
}

function validateA2UIStringBinding(raw: unknown, label: string) {
    if (!isPlainObject(raw)) {
        throw new Error(`${label} must be an object with path or literalString.`)
    }

    const path = readStringProperty(raw, 'path')
    const literalString = readStringProperty(raw, 'literalString')
    if (path === undefined && literalString === undefined) {
        throw new Error(`${label} must include path or literalString.`)
    }
}

function validateComponentArrayReference(raw: unknown, label: string) {
    if (!isPlainObject(raw)) {
        throw new Error(`${label} must be an object.`)
    }

    for (const key of Object.keys(raw)) {
        if (key !== 'explicitList' && key !== 'template') {
            throw new Error(`${label}.${key} is not standard A2UI. Use only explicitList or template.`)
        }
    }

    const explicitList = readArrayProperty(raw, 'explicitList')
    if (explicitList) {
        explicitList.forEach((item, index) => {
            if (typeof item !== 'string') {
                throw new Error(`${label}.explicitList[${index}] must be a component id string.`)
            }
        })
    }

    const template = Reflect.get(raw, 'template')
    if (template === undefined) {
        return
    }
    if (!isPlainObject(template)) {
        throw new Error(`${label}.template must be an object.`)
    }

    for (const key of Object.keys(template)) {
        if (key !== 'componentId' && key !== 'dataBinding') {
            throw new Error(`${label}.template.${key} is not standard A2UI. Use only componentId and dataBinding.`)
        }
    }

    const componentId = readStringProperty(template, 'componentId')
    const dataBinding = readStringProperty(template, 'dataBinding')
    if (!componentId || !dataBinding) {
        throw new Error(`${label}.template must include componentId and dataBinding strings.`)
    }
}

function validateStrictComponentProperties(componentType: string, raw: object, label: string) {
    if (Reflect.has(raw, 'style')) {
        throw new Error(`${label}.style is not supported. Use usageHint and layout components instead.`)
    }
    if (Reflect.has(raw, 'weight')) {
        throw new Error(`${label}.weight is not supported. Put weight on the component instance.`)
    }

    if (componentType === 'Text') {
        validateA2UIStringBinding(Reflect.get(raw, 'text'), `${label}.text`)
    }
    if (componentType === 'TextField') {
        validateA2UIStringBinding(Reflect.get(raw, 'text'), `${label}.text (TextField uses text, not value)`)
    }

    const children = Reflect.get(raw, 'children')
    if (children !== undefined) {
        validateComponentArrayReference(children, `${label}.children`)
    }
    validateCatalogComponent(componentType, raw)
}

function normalizeComponentInstance(
    raw: unknown,
    label: string,
    options?: A2UIMessageNormalizationOptions
): A2UIComponentInstance {
    if (!isPlainObject(raw)) {
        throw new Error(`${label} must be an object.`)
    }

    const id = readStringProperty(raw, 'id')
    if (!id) {
        throw new Error(`${label}.id must be a non-empty string.`)
    }

    const componentValue = Reflect.get(raw, 'component')
    if (!isPlainObject(componentValue)) {
        throw new Error(`${label}.component must be an object.`)
    }

    const componentEntries = Object.entries(componentValue)
    if (componentEntries.length !== 1) {
        throw new Error(`${label}.component must have exactly one component type key.`)
    }

    const [componentType, componentPropertiesValue] = componentEntries[0]
    if (!SUPPORTED_A2UI_COMPONENT_SET.has(componentType)) {
        throw new Error(
            `${label}.component type "${componentType}" is not supported. Supported types: ${SUPPORTED_A2UI_COMPONENTS.join(', ')}.`
        )
    }

    if (!isPlainObject(componentPropertiesValue)) {
        throw new Error(`${label}.component.${componentType} must be an object.`)
    }
    if (shouldEnforceStrictCatalog(options)) {
        validateStrictComponentProperties(
            componentType,
            componentPropertiesValue,
            `${label}.component.${componentType}`
        )
    }

    const component: A2UIComponentProperties = {}
    Reflect.set(component, componentType, cloneJsonLike(componentPropertiesValue))

    const result: A2UIComponentInstance = {
        id,
        component
    }
    const weight = readNumberProperty(raw, 'weight')
    if (weight !== undefined) {
        result.weight = weight
    }
    return result
}

function normalizeBeginRendering(raw: unknown, label: string): A2UIBeginRenderingMessage {
    if (!isPlainObject(raw)) {
        throw new Error(`${label} must be an object.`)
    }

    const root = readStringProperty(raw, 'root')
    if (!root) {
        throw new Error(`${label}.root must be a non-empty string.`)
    }

    const result: A2UIBeginRenderingMessage = {
        surfaceId: readStringProperty(raw, 'surfaceId') ?? DEFAULT_SURFACE_ID,
        root
    }
    const styles = normalizeStringMap(Reflect.get(raw, 'styles'), `${label}.styles`)
    if (styles) {
        result.styles = styles
    }
    return result
}

function normalizeSurfaceUpdate(
    raw: unknown,
    label: string,
    options?: A2UIMessageNormalizationOptions
): A2UISurfaceUpdateMessage {
    if (!isPlainObject(raw)) {
        throw new Error(`${label} must be an object.`)
    }

    const components = readArrayProperty(raw, 'components')
    if (!components?.length) {
        throw new Error(`${label}.components must be a non-empty array.`)
    }

    return {
        surfaceId: readStringProperty(raw, 'surfaceId') ?? DEFAULT_SURFACE_ID,
        components: components.map((component, index) =>
            normalizeComponentInstance(component, `${label}.components[${index}]`, options)
        )
    }
}

function normalizeDataModelUpdate(raw: unknown, label: string): A2UIDataModelUpdate {
    if (!isPlainObject(raw)) {
        throw new Error(`${label} must be an object.`)
    }

    const contents = readArrayProperty(raw, 'contents')
    if (!contents) {
        throw new Error(`${label}.contents must be an array.`)
    }

    const result: A2UIDataModelUpdate = {
        surfaceId: readStringProperty(raw, 'surfaceId') ?? DEFAULT_SURFACE_ID,
        contents: contents.map((item, index) => normalizeValueMap(item, `${label}.contents[${index}]`))
    }
    const path = readStringProperty(raw, 'path')
    if (path !== undefined) {
        result.path = path
    }
    return result
}

function normalizeDeleteSurface(raw: unknown, label: string): A2UIDeleteSurfaceMessage {
    if (!isPlainObject(raw)) {
        throw new Error(`${label} must be an object.`)
    }
    return {
        surfaceId: readStringProperty(raw, 'surfaceId') ?? DEFAULT_SURFACE_ID
    }
}

function normalizeA2UIMessage(
    raw: unknown,
    label: string,
    options?: A2UIMessageNormalizationOptions
): A2UIServerToClientMessage {
    if (!isPlainObject(raw)) {
        throw new Error(`${label} must be an object.`)
    }

    const result: A2UIServerToClientMessage = {}
    let operationCount = 0
    const beginRendering = Reflect.get(raw, 'beginRendering')
    const surfaceUpdate = Reflect.get(raw, 'surfaceUpdate')
    const dataModelUpdate = Reflect.get(raw, 'dataModelUpdate')
    const deleteSurface = Reflect.get(raw, 'deleteSurface')

    if (beginRendering !== undefined) {
        result.beginRendering = normalizeBeginRendering(beginRendering, `${label}.beginRendering`)
        operationCount += 1
    }
    if (surfaceUpdate !== undefined) {
        result.surfaceUpdate = normalizeSurfaceUpdate(surfaceUpdate, `${label}.surfaceUpdate`, options)
        operationCount += 1
    }
    if (dataModelUpdate !== undefined) {
        result.dataModelUpdate = normalizeDataModelUpdate(dataModelUpdate, `${label}.dataModelUpdate`)
        operationCount += 1
    }
    if (deleteSurface !== undefined) {
        result.deleteSurface = normalizeDeleteSurface(deleteSurface, `${label}.deleteSurface`)
        operationCount += 1
    }

    if (operationCount !== 1) {
        throw new Error(`${label} must include an A2UI message operation.`)
    }
    return result
}

export function normalizeA2UIServerMessages(
    rawMessages: unknown,
    options?: A2UIMessageNormalizationOptions
): A2UIServerToClientMessage[] {
    if (!Array.isArray(rawMessages)) {
        throw new Error('A2UI messages must be an array.')
    }

    assertWidgetBudget(rawMessages)
    const messages = rawMessages.map((message, index) => normalizeA2UIMessage(message, `messages[${index}]`, options))
    validateA2UIServerMessages(messages, options)
    validateSurfaceGraph(messages)
    return messages
}

function validateA2UIServerMessages(messages: A2UIServerToClientMessage[], options?: A2UIMessageNormalizationOptions) {
    const componentIds = new Set<string>()
    const roots = new Set<string>()
    const templateDataBindings = new Set<string>()
    let surfaceUpdateCount = 0

    for (const message of messages) {
        if (message.surfaceUpdate) {
            surfaceUpdateCount += 1
            for (const component of message.surfaceUpdate.components) {
                if (componentIds.has(component.id)) {
                    throw new Error(`Duplicate A2UI component id "${component.id}".`)
                }
                componentIds.add(component.id)
                collectTemplateDataBindings(component, templateDataBindings)
            }
        }
        if (message.beginRendering) {
            roots.add(message.beginRendering.root)
        }
    }

    if (surfaceUpdateCount === 0) {
        throw new Error('A2UI messages must include at least one surfaceUpdate.')
    }
    if (!roots.size) {
        throw new Error('A2UI messages must include beginRendering.root.')
    }
    for (const root of roots) {
        if (!componentIds.has(root)) {
            throw new Error(`A2UI beginRendering.root "${root}" does not reference an existing component id.`)
        }
    }
    if (shouldEnforceStrictCatalog(options)) {
        validateTemplatedDataModels(messages, templateDataBindings)
    }
}

function collectTemplateDataBindings(component: A2UIComponentInstance, bindings: Set<string>) {
    const componentPropertiesList = Object.values(component.component ?? {})
    for (const componentProperties of componentPropertiesList) {
        if (!isPlainObject(componentProperties)) {
            continue
        }

        const children = Reflect.get(componentProperties, 'children')
        if (!isPlainObject(children)) {
            continue
        }

        const template = Reflect.get(children, 'template')
        if (!isPlainObject(template)) {
            continue
        }

        const dataBinding = readStringProperty(template, 'dataBinding')
        if (dataBinding) {
            bindings.add(dataBinding)
        }
    }
}

function validateTemplatedDataModels(messages: A2UIServerToClientMessage[], templateDataBindings: Set<string>) {
    if (!templateDataBindings.size) {
        return
    }

    for (const message of messages) {
        const dataModelUpdate = message.dataModelUpdate
        if (!dataModelUpdate) {
            continue
        }

        const basePath = normalizeA2UIDataPath(dataModelUpdate.path ?? '/')

        if (templateDataBindings.has(basePath)) {
            validateTemplatedRowCollection(basePath, dataModelUpdate.contents)
        }

        for (const item of dataModelUpdate.contents) {
            const itemPath = resolveA2UIDataPath(basePath, item.key)
            if (templateDataBindings.has(itemPath) && item.valueMap) {
                validateTemplatedRowCollection(itemPath, item.valueMap)
            }
        }
    }
}

function validateTemplatedRowCollection(path: string, contents: A2UIValueMap[]) {
    const seenKeys = new Set<string>()

    for (const item of contents) {
        if (/^(?:r\d+|row_\d+)_/.test(item.key)) {
            throw new Error(
                `A2UI dataModelUpdate at "${path}" is used by a List template and must be an array/valueMap row collection, not flattened keys like "${item.key}".`
            )
        }

        if (seenKeys.has(item.key)) {
            throw new Error(
                `A2UI dataModelUpdate at "${path}" is used by a List template and must encode each row as a JSON array item or a valueMap row object. Repeated field key "${item.key}" directly under the collection will be collapsed by A2UI.`
            )
        }
        seenKeys.add(item.key)
    }
}

function normalizeA2UIDataPath(path: string): string {
    if (!path || path === '.') {
        return '/'
    }
    return path.startsWith('/') ? path.replace(/\/$/, '') || '/' : `/${path.replace(/\/$/, '')}`
}

function resolveA2UIDataPath(basePath: string, key: string): string {
    if (key === '.') {
        return basePath
    }
    if (key.startsWith('/')) {
        return normalizeA2UIDataPath(key)
    }
    if (basePath === '/') {
        return `/${key}`
    }
    return `${basePath}/${key}`
}

function normalizeA2UIWidgetResult(raw: unknown, fallbackName: string): WidgetResult {
    if (Array.isArray(raw)) {
        return {
            name: fallbackName,
            messages: normalizeA2UIServerMessages(raw)
        }
    }

    if (!isPlainObject(raw)) {
        throw new Error('A2UI widget output must be an object or a messages array.')
    }

    const name = readStringProperty(raw, 'name')?.trim() || fallbackName
    const rawMessages = Reflect.get(raw, 'messages')
    if (!Array.isArray(rawMessages)) {
        throw new Error('A2UI widget output must include a messages array.')
    }

    return {
        name,
        messages: normalizeA2UIServerMessages(rawMessages),
        values: cloneJsonLike(Reflect.get(raw, 'values'))
    }
}

export function normalizeA2UIWidgetResults(raw: unknown): WidgetResult[] {
    assertWidgetBudget(raw)
    if (isPlainObject(raw)) {
        const widgets = readArrayProperty(raw, 'widgets')
        if (widgets) {
            if (widgets.length < 1 || widgets.length > 8)
                throw new Error('A2UI output must contain between 1 and 8 widgets.')
            return widgets.map((widget, index) => normalizeA2UIWidgetResult(widget, `generated_surface_${index + 1}`))
        }
    }

    return [normalizeA2UIWidgetResult(raw, DEFAULT_A2UI_WIDGET_NAME)]
}

// The pinned catalog matches ChatKit's @a2ui/lit 0.8.1 renderer.
// Source: Google A2UI, standard_catalog_definition.json (Apache-2.0).
import Ajv from 'ajv'
import catalog from './catalog-0.8.json'

const ajv = new Ajv({ allErrors: true, strict: false })
const validators = new Map(Object.entries(catalog.components).map(([name, schema]) => [name, ajv.compile(schema)]))

export function validateCatalogComponent(name: string, properties: object) {
    const validate = validators.get(name)
    if (!validate || !validate(properties)) {
        const errors = validate?.errors
            ?.map((error) => `${error.instancePath || '/'} ${error.message} ${JSON.stringify(error.params)}`)
            .join('; ')
        throw new Error(
            `Invalid A2UI ${name}: ${errors ?? 'unsupported component'}. Read a2ui_catalog for the exact fields.`
        )
    }
}

function omitDescriptions(_key: string, value: unknown) {
    return _key === 'description' ? undefined : value
}

export const A2UI_COMPONENT_SCHEMAS = JSON.stringify(catalog.components, omitDescriptions)

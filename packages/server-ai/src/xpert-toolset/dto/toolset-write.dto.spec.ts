import { BadRequestException } from '@nestjs/common'
import { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface'
import { ModelPropertiesAccessor } from '@nestjs/swagger/dist/services/model-properties-accessor'
import { SchemaObjectFactory } from '@nestjs/swagger/dist/services/schema-object-factory'
import { SwaggerTypesMapper } from '@nestjs/swagger/dist/services/swagger-types-mapper'
import {
    BuiltinToolsetDTO,
    CreateToolsetDTO,
    parseBuiltinToolset,
    parseToolsetCreate,
    parseToolsetUpdate,
    ToolsetWriteValidationPipe,
    UpdateToolsetDTO
} from './toolset-write.dto'
import { ToolsetToolDTO } from './toolset-tool.dto'

describe('toolset write input', () => {
    it('removes the entity graph, including reverse relations on tools and writes on existing tags', () => {
        expect(
            parseToolsetUpdate({
                id: 'ignored',
                name: 'Renamed',
                createdBy: { id: 'ignored' },
                workspace: { id: 'ignored' },
                updatedById: 'ignored',
                tools: [{ name: 'search', toolset: { name: 'ignored' }, toolsetId: 'ignored' }],
                tags: [{ id: '11111111-1111-4111-8111-111111111111', name: 'ignored', isActive: true }]
            })
        ).toEqual({
            name: 'Renamed',
            tools: [{ name: 'search' }],
            tags: [{ id: '11111111-1111-4111-8111-111111111111' }]
        })
    })

    it('preserves explicit nulls, empty collections, JSON options and ID-less tag definitions', () => {
        const input = {
            credentials: null,
            tools: [],
            options: { custom: { nested: ['value'] } },
            tags: [{ name: 'Imported', color: '#fff' }]
        }
        expect(parseToolsetUpdate(input)).toEqual(input)
        expect(parseToolsetUpdate({ tags: null, tools: null })).toEqual({ tags: null, tools: null })
        expect(parseToolsetUpdate({})).toEqual({})
    })

    it.each([
        { tools: 'search' },
        { credentials: 'secret' },
        { tags: [{ id: 'not-a-uuid', name: 'Imported' }] },
        { tools: [{ name: 'search', disabled: 'false' }] },
        { options: [] },
        { name: null },
        { tools: [{ name: null }] },
        { tools: [{ name: 'search', label: { zh_Hans: '搜索' } }] },
        { tools: [{ name: 'search', avatar: { emoji: null } }] },
        { avatar: { emoji: { id: 'rocket', set: 'unknown' } } },
        { avatar: { url: null } },
        { tags: [{ id: null }] },
        { tags: [{ targets: ['unknown'] }] },
        { category: 'unknown' },
        { schemaType: 'unknown' }
    ])('rejects malformed writes before persistence: %j', (input) => {
        expect(() => parseToolsetUpdate(input)).toThrow(BadRequestException)
    })

    it('uses the same DTO projection for HTTP and direct service entry points', () => {
        const input = {
            name: 'Search',
            workspace: { id: 'ignored' },
            tools: [{ name: 'search', toolset: { id: 'ignored' } }]
        }
        const result = new ToolsetWriteValidationPipe(CreateToolsetDTO).transform(input)
        expect(result).toBeInstanceOf(CreateToolsetDTO)
        expect(result.tools[0]).toBeInstanceOf(ToolsetToolDTO)
        expect(result).toEqual(parseToolsetCreate(input))
        expect(result).toEqual({ name: 'Search', tools: [{ name: 'search' }] })
        expect(parseToolsetUpdate({})).toBeInstanceOf(UpdateToolsetDTO)
        expect(parseBuiltinToolset({})).toBeInstanceOf(BuiltinToolsetDTO)
    })

    it('publishes finite Swagger schemas with a required create name and no reverse relations', () => {
        const schemas: Record<string, SchemaObject> = {}
        const factory = new SchemaObjectFactory(new ModelPropertiesAccessor(), new SwaggerTypesMapper())
        factory.exploreModelSchema(CreateToolsetDTO, schemas)
        factory.exploreModelSchema(UpdateToolsetDTO, schemas)
        factory.exploreModelSchema(BuiltinToolsetDTO, schemas)
        expect(schemas.CreateToolsetDTO.required).toEqual(['name'])
        expect(schemas.UpdateToolsetDTO.required ?? []).toEqual([])
        expect(schemas.CreateToolsetDTO.properties.tools).toMatchObject({
            type: 'array',
            items: { $ref: '#/components/schemas/ToolsetToolDTO' }
        })
        expect(schemas.UpdateToolsetDTO.properties.description).toMatchObject({ type: 'string', nullable: true })
        expect(schemas.ToolsetToolDTO.properties).not.toHaveProperty('toolset')
        expect(schemas.ToolsetToolDTO.properties).not.toHaveProperty('toolsetId')
        expect(schemas.ToolsetToolDTO.properties.label).toMatchObject({
            oneOf: [{ type: 'string' }, { type: 'object' }]
        })
        expect(schemas.CreateToolsetDTO.properties).not.toHaveProperty('workspace')
        expect(schemas.BuiltinToolsetDTO.properties).toHaveProperty('id')
    })

    it('drops cyclic loaded tool relations before transforming nested DTOs', () => {
        const toolset = { tools: [{ name: 'search', toolset: {} }] }
        toolset.tools[0].toolset = toolset
        expect(parseToolsetUpdate(toolset)).toEqual({ tools: [{ name: 'search' }] })
    })

    it.each([null, [], 'input', { name: null }, {}])(
        'rejects invalid create bodies through the HTTP pipe: %j',
        (input) => {
            expect(() => new ToolsetWriteValidationPipe(CreateToolsetDTO).transform(input)).toThrow(BadRequestException)
        }
    )

    it('requires a create name while allowing provider defaults and an ID for builtin authorization', () => {
        expect(() => parseToolsetCreate({})).toThrow(BadRequestException)
        expect(parseBuiltinToolset({ id: 'toolset-1', credentials: {} })).toEqual({ id: 'toolset-1', credentials: {} })
        expect(parseToolsetCreate({ name: 'New', id: 'ignored' })).toEqual({ name: 'New' })
    })

    it('keeps localized labels and bounded avatars while ignoring definition fields on tag references', () => {
        const input = {
            tools: [{ name: 'search', label: { en_US: 'Search', zh_Hans: '搜索', fr_FR: 'Recherche' } }],
            avatar: { emoji: { id: 'rocket', set: 'apple' }, useNotoColor: true },
            tags: [{ id: '11111111-1111-4111-8111-111111111111', targets: ['ignored'], isActive: 'ignored' }]
        }
        expect(parseToolsetUpdate(input)).toEqual({
            ...input,
            tags: [{ id: '11111111-1111-4111-8111-111111111111' }]
        })
    })
})

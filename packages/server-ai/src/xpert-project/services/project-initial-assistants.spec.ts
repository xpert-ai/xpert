import type { IXpert } from '@xpert-ai/contracts'
import { IsNull, type Repository } from 'typeorm'
import { Xpert } from '../../xpert/xpert.entity'
import { XpertProject } from '../entities/project.entity'
import { XpertProjectXpertBindingService } from './project-xpert-binding.service'

describe('Project initial Assistant membership', () => {
    const scope = { tenantId: 'tenant', organizationId: 'org' }

    it('includes optional and nested edges from internal agents, deduplicates diamonds and terminates cycles', async () => {
        const root = assistant('root', ['left', 'right', 'left'])
        const left = assistant('left', ['leaf'])
        const right = assistant('right', ['leaf'])
        const leaf = assistant('leaf', ['root'])
        root.graph.nodes.push({
            type: 'xpert',
            key: 'unconnected',
            entity: assistant('unconnected'),
            position: { x: 0, y: 0 }
        })
        const f = fixture([root, left, right, leaf])

        const members = await f.bindings.resolveInitialMembers([root, right], scope)

        expect(members.map((member) => member.id)).toEqual(['root', 'right', 'left', 'leaf'])
        expect(f.findOne).toHaveBeenCalledTimes(4)
        expect(f.findOne).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({ tenantId: 'tenant', organizationId: 'org' }),
                relations: ['agent']
            })
        )
    })

    it('uses canonical published versions and never includes draft-only dependencies', async () => {
        const root = assistant('root', ['old', 'current'])
        root.draft = {
            team: root,
            nodes: [{ type: 'xpert', key: 'draft-only', entity: assistant('draft-only'), position: { x: 0, y: 0 } }],
            connections: []
        }
        const current = assistant('current', ['leaf'])
        const old = { ...current, id: 'old', latest: false, graph: assistant('unused', ['old-only']).graph }
        const f = fixture([root, old, current, assistant('leaf')])

        expect((await f.bindings.resolveInitialMembers([root], scope)).map((member) => member.id)).toEqual([
            'root',
            'current',
            'leaf'
        ])
        expect(f.findOne.mock.calls.some(([options]) => options.where.id === 'draft-only')).toBe(false)
        expect(f.findOne.mock.calls.some(([options]) => options.where.id === 'old-only')).toBe(false)
    })

    it.each(['missing', 'unpublished', 'inactive', 'cross-tenant', 'cross-organization'])(
        'rejects a %s dependency, including optional edges',
        async (invalid) => {
            const root = assistant('root', ['child'])
            const child = assistant('child')
            if (invalid === 'unpublished') child.publishAt = null
            if (invalid === 'inactive') child.active = false
            if (invalid === 'cross-tenant') child.tenantId = 'other'
            if (invalid === 'cross-organization') child.organizationId = 'other'
            const f = fixture(invalid === 'missing' ? [root] : [root, child])
            await expect(f.bindings.resolveInitialMembers([root], scope)).rejects.toMatchObject({
                response: { errorCode: 'project_initial_assistant_unavailable' }
            })
        }
    )

    it('supports tenant-scoped graphs without treating a missing organization as a wildcard', async () => {
        const root = { ...assistant('root', ['child']), organizationId: null }
        const child = { ...assistant('child'), organizationId: null }
        const f = fixture([root, child])
        expect((await f.bindings.resolveInitialMembers([root], { tenantId: 'tenant' })).map((item) => item.id)).toEqual(
            ['root', 'child']
        )
        expect(f.findOne).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({ organizationId: IsNull() })
            })
        )
    })

    it('fails explicitly when a graph exceeds the bound instead of persisting a partial member set', async () => {
        const graph = Array.from({ length: 257 }, (_, index) =>
            assistant(String(index), index < 256 ? [String(index + 1)] : [])
        )
        const f = fixture(graph)
        await expect(f.bindings.resolveInitialMembers([graph[0]], scope)).rejects.toMatchObject({
            response: { errorCode: 'project_initial_assistants_limit' }
        })
    })
})

function assistant(id: string, children: string[] = []): IXpert {
    return {
        id,
        name: id,
        slug: id,
        type: 'agent',
        tenantId: 'tenant',
        organizationId: 'org',
        latest: true,
        publishAt: new Date(),
        agent: { key: `agent-${id}` },
        graph: {
            nodes: [
                { type: 'agent', key: 'internal-agent' },
                ...children.map((key) => ({ type: 'xpert' as const, key }))
            ],
            connections: children.map((to, index) => ({
                type: 'xpert',
                from: 'internal-agent/output',
                to: `${to}/input`,
                ...(index === 0 ? { required: false } : {})
            }))
        }
    } as IXpert
}

function fixture(assistants: IXpert[]) {
    const findOne = jest.fn(
        async (options: { where: { id?: string; slug?: string; latest?: boolean } }) =>
            assistants.find((item) =>
                options.where.id
                    ? item.id === options.where.id
                    : item.slug === options.where.slug && item.latest === options.where.latest
            ) ?? null
    )
    return {
        findOne,
        bindings: new XpertProjectXpertBindingService(
            { findOne } as unknown as Repository<Xpert>,
            {} as Repository<XpertProject>
        )
    }
}

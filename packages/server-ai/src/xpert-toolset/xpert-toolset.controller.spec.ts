import { RequestMethod } from '@nestjs/common'
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants'
import { MetadataScanner } from '@nestjs/core/metadata-scanner'
import { BuiltinToolsetDTO, CreateToolsetDTO, UpdateToolsetDTO } from './dto/toolset-write.dto'
import { XpertToolsetController } from './xpert-toolset.controller'

describe('XpertToolsetController', () => {
    function routes() {
        const prototype = XpertToolsetController.prototype
        return new MetadataScanner().getAllMethodNames(prototype).flatMap((name) => {
            const method = Reflect.get(prototype, name)
            const path = Reflect.getMetadata(PATH_METADATA, method)
            return path === undefined ? [] : [{ name, method: Reflect.getMetadata(METHOD_METADATA, method), path }]
        })
    }

    it('retains the read and mutation routes without inheriting generic CRUD writes', () => {
        expect(Object.getPrototypeOf(XpertToolsetController.prototype)).toBe(Object.prototype)
        expect(routes()).toEqual(
            expect.arrayContaining([
                { name: 'findAllTools', method: RequestMethod.GET, path: '/' },
                { name: 'getCount', method: RequestMethod.GET, path: 'count' },
                { name: 'pagination', method: RequestMethod.GET, path: 'pagination' },
                { name: 'findMyAll', method: RequestMethod.GET, path: 'my' },
                { name: 'findById', method: RequestMethod.GET, path: ':id' },
                { name: 'create', method: RequestMethod.POST, path: '/' },
                { name: 'update', method: RequestMethod.PUT, path: ':id' },
                { name: 'delete', method: RequestMethod.DELETE, path: ':id' },
                { name: 'softRemove', method: RequestMethod.DELETE, path: ':id/soft' },
                { name: 'softRecover', method: RequestMethod.PUT, path: ':id/recover' }
            ])
        )
        expect(routes().filter(({ method, path }) => method === RequestMethod.GET && path === '/')).toHaveLength(1)
        const paths = routes()
            .filter(({ method }) => method === RequestMethod.GET)
            .map(({ path }) => path)
        expect(paths.indexOf(':id')).toBeGreaterThan(paths.indexOf('providers'))
    })

    it('declares bounded request DTOs for ordinary and builtin mutations', () => {
        const prototype = XpertToolsetController.prototype
        expect(Reflect.getMetadata('design:paramtypes', prototype, 'create')).toEqual([CreateToolsetDTO])
        expect(Reflect.getMetadata('design:paramtypes', prototype, 'update')).toEqual([String, UpdateToolsetDTO])
        expect(Reflect.getMetadata('design:paramtypes', prototype, 'createBuiltinInstance')).toEqual([
            String,
            BuiltinToolsetDTO
        ])
    })

    it('delegates queries to the service with relation and selection options', async () => {
        const service = {
            countBy: jest.fn().mockResolvedValue(2),
            findOneByIdString: jest.fn().mockResolvedValue({ id: 'toolset-1' })
        }
        const controller = new XpertToolsetController(
            service as unknown as ConstructorParameters<typeof XpertToolsetController>[0],
            {} as ConstructorParameters<typeof XpertToolsetController>[1],
            {} as ConstructorParameters<typeof XpertToolsetController>[2],
            {} as ConstructorParameters<typeof XpertToolsetController>[3]
        )
        await expect(controller.getCount({ name: 'Search' })).resolves.toBe(2)
        expect(service.countBy).toHaveBeenCalledWith({ name: 'Search' })
        await expect(controller.findById('toolset-1', ['tools'], ['id'])).resolves.toEqual({ id: 'toolset-1' })
        expect(service.findOneByIdString).toHaveBeenCalledWith('toolset-1', { relations: ['tools'], select: ['id'] })
    })
})

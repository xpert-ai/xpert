import { MetadataScanner } from '@nestjs/core'
import { METHOD_METADATA } from '@nestjs/common/constants'
import { PermissionsEnum } from '@xpert-ai/contracts'
import { PERMISSIONS_METADATA } from '@xpert-ai/server-common'
import { AuthController } from '../../auth/auth.controller'
import { UserController } from '../../user/user.controller'

describe('mixed account controllers keep management authorization on methods', () => {
	const scanner = new MetadataScanner()

	it.each([
		{ controller: AuthController, selfService: ['hasRole', 'refreshToken', 'alive', 'resendVerificationMail'] },
		{ controller: UserController, selfService: ['findMe', 'updateMe', 'updatePreferredLanguage'] }
	])(
		'protects every non-public management route in $controller.name, including inherited CRUD',
		({ controller, selfService }) => {
			expect(Reflect.getMetadata(PERMISSIONS_METADATA, controller)).toBeUndefined()
			for (const name of scanner.getAllMethodNames(controller.prototype)) {
				const handler: unknown = Reflect.get(controller.prototype, name)
				if (typeof handler !== 'function' || Reflect.getMetadata(METHOD_METADATA, handler) === undefined)
					continue
				const permissions: unknown = Reflect.getMetadata(PERMISSIONS_METADATA, handler)
				if (selfService.includes(name) || Reflect.getMetadata('isPublic', handler)) {
					expect({ name, permissions }).toEqual({ name, permissions: undefined })
				} else {
					expect({ name, protected: Array.isArray(permissions) && permissions.length > 0 }).toEqual({
						name,
						protected: true
					})
				}
			}
		}
	)

	it.each(['findMyAll', 'softRemove', 'softRecover', 'createBulk', 'uploadAndParseCsv'])(
		'retains the previous management requirement for UserController.%s',
		(name) => {
			const handler: unknown = Reflect.get(UserController.prototype, name)
			if (typeof handler !== 'function') throw new Error(`Missing user management method: ${name}`)
			expect(Reflect.getMetadata(PERMISSIONS_METADATA, handler)).toEqual([PermissionsEnum.ORG_USERS_EDIT])
		}
	)

	it('keeps managed account registration protected independently of public signup', () => {
		expect(Reflect.getMetadata(PERMISSIONS_METADATA, AuthController.prototype.create)).toEqual([
			PermissionsEnum.ORG_USERS_EDIT
		])
		expect(Reflect.getMetadata('isPublic', AuthController.prototype.signup)).toBe(true)
	})
})

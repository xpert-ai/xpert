import {
	Ability,
	AbilityBuilder,
	AbilityClass,
	ExtractSubjectType,
	InferSubjects,
} from '@casl/ability'
import { Injectable } from '@nestjs/common'
import { RolesEnum } from '@xpert-ai/contracts'
import { RequestContext, User } from '@xpert-ai/server-core'
import { Story } from '../entities/internal'
import { AuthActions } from './action'

type Subjects = InferSubjects<typeof Story | typeof User> | 'all'

export type AppAbility = Ability<[AuthActions, Subjects]>

@Injectable()
export class CaslAbilityFactory {
	// constructor(private userGroupService: UserBusinessGroupService) {}

	async createForUser(user: User) {
		const { can, cannot, build } = new AbilityBuilder<
			Ability<[AuthActions, Subjects]>
		>(Ability as AbilityClass<AppAbility>)

		// const {items} = await this.userGroupService.findAll({
		// 	where: {
		// 		userId: user.id,
		// 	}
		// })

		// can(Action.Read, Story, {groupId: { $in: items.map(item => item.id) }})

		// if (user) {
		// 	can(Action.Manage, 'all') // read-write access to everything
		// } else {
		// 	can(Action.Read, 'all') // read-only access to everything
		// }

		if (RequestContext.hasRoles([RolesEnum.ADMIN])) {
			can(AuthActions.Manage, Story)
		}

		cannot(AuthActions.Delete, Story, { createdAt: 1 })

		return build({
			// Read https://casl.js.org/v5/en/guide/subject-type-detection#use-classes-as-subject-types for details
			detectSubjectType: (item) =>
				item.constructor as ExtractSubjectType<Subjects>,
		})
	}
}

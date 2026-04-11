import { IRole, ITenant, RolesEnum } from '@xpert-ai/contracts';
import { Connection } from 'typeorm';
import { defaultRoles } from './default-role';
import { Role } from './role.entity';

export const createRoles = async (
	connection: Connection,
	tenants: ITenant[]
): Promise<IRole[]> => {
	try {
		const roles: IRole[] = [];
		for (const tenant of tenants) {
			for (const name of Object.values(RolesEnum)) {
				const role = new Role();
				role.name = name;
				role.tenant = tenant;
				role.isSystem = defaultRoles.includes(name);
				roles.push(role);
			}
		}
		return await connection.manager.save(roles);
	} catch (error) {
		console.log({error})
	}
};

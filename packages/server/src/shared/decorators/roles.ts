import { RolesEnum } from '@metad/contracts';
import { SetMetadata, createParamDecorator } from '@nestjs/common';
import { RequestContext } from '../../core/context';

export const Roles = (...roles: string[]) => SetMetadata('roles', roles);

export const UserRole = createParamDecorator(
	(): RolesEnum | null => {
		const role = RequestContext.currentUser()?.role?.name;
		return role ? RolesEnum[role] : null;
	}
);

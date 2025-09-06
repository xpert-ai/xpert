import { Injectable } from '@nestjs/common';
import { ValidationArguments, ValidatorConstraint, ValidatorConstraintInterface } from 'class-validator';
import { ID, IOrganization } from '@metad/contracts';
import { isEmpty } from '@metad/server-common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RequestContext } from '../../../core/context';
import { UserOrganization } from '../../../core/entities/internal';

/**
 * Validator constraint for checking if a user belongs to the organization.
 */
@ValidatorConstraint({ name: 'IsOrganizationBelongsToUser', async: true })
@Injectable()
export class OrganizationBelongsToUserConstraint implements ValidatorConstraintInterface {
	constructor(
		@InjectRepository(UserOrganization)
		private readonly repository: Repository<UserOrganization>
	) {}

	/**
	 * Validates if the user belongs to the organization.
	 *
	 * @param value - The organization ID or organization object.
	 * @returns {Promise<boolean>} - True if the user belongs to the organization, otherwise false.
	 */
	async validate(value: ID | IOrganization): Promise<boolean> {
		if (isEmpty(value)) {
			return true;
		}

		const organizationId = typeof value === 'string' ? value : value.id;

		// Use the consolidated ORM logic function
		return this.checkOrganizationExistence(organizationId);
	}

	/**
	 * Checks if the given organization exists for the current user in the database.
	 *
	 * @param organizationId - The ID of the organization.
	 * @returns {Promise<boolean>} - True if found, false otherwise.
	 */
	async checkOrganizationExistence(organizationId: string): Promise<boolean> {
		const tenantId = RequestContext.currentTenantId();
		const userId = RequestContext.currentUserId();

		if (!tenantId || !userId) {
			return false;
		}

		try {
			await this.repository.findOneByOrFail({
						tenantId,
						userId,
						organizationId
					});
					return true;
		} catch {
			return false;
		}
	}

	/**
	 * Gets the default error message when validation fails.
	 *
	 * @returns {string} - Default error message.
	 */
	defaultMessage(): string {
		const userId = RequestContext.currentUserId();
		return `The user with ID ${userId} is not associated with the specified organization.`;
	}
}

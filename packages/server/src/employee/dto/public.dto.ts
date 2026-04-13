import { IUser } from '@xpert-ai/contracts'
import { Exclude, Expose, Transform } from 'class-transformer'
import { UserPublicDTO } from '../../user/dto'
import { Employee } from '../employee.entity'

@Exclude()
export class EmployeePublicDTO {
	@Expose()
	id: string

	@Expose()
	@Transform(({ value }) => value && new UserPublicDTO(value))
	user: IUser

	constructor(partial: Partial<Employee>) {
		Object.assign(this, partial)
	}
}

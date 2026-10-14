import {
	BadRequestException,
	Body,
	Controller,
	Delete,
	Get,
	Header,
	HttpCode,
	Param,
	ParseUUIDPipe,
	Post
} from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { t } from 'i18next'
import { ZodValidationPipe } from '../../shared/pipes/zod-validation.pipe'
import { personalApiKeyCreateSchema, PersonalApiKeyCreate } from './personal-api-key.schema'
import { ApiKeyService } from '../api-key.service'

@ApiTags('Personal API keys')
@Controller('personal')
export class PersonalApiKeyController {
	constructor(private readonly keys: ApiKeyService) {}

	@Get()
	@Header('Cache-Control', 'no-store')
	list() {
		return this.keys.listPersonal()
	}

	@Post()
	@Header('Cache-Control', 'no-store')
	create(
		@Body(
			new ZodValidationPipe(
				personalApiKeyCreateSchema,
				() =>
					new BadRequestException(
						t('server-ai:Error.PersonalApiKeyInvalidInput', {
							defaultValue: 'Provide a key name and a valid lifetime.'
						})
					)
			)
		)
		input: PersonalApiKeyCreate
	) {
		return this.keys.createPersonal(input)
	}

	@Delete(':id')
	@HttpCode(204)
	revoke(@Param('id', new ParseUUIDPipe()) id: string) {
		return this.keys.revokePersonal(id)
	}
}

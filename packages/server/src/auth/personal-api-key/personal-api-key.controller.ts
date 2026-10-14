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
import { PersonalApiKeyService } from './personal-api-key.service'

@ApiTags('Personal API keys')
@Controller('personal-api-keys')
export class PersonalApiKeyController {
	constructor(private readonly keys: PersonalApiKeyService) {}

	@Get()
	@Header('Cache-Control', 'no-store')
	list() {
		return this.keys.list()
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
		return this.keys.create(input)
	}

	@Delete(':id')
	@HttpCode(204)
	revoke(@Param('id', new ParseUUIDPipe()) id: string) {
		return this.keys.revoke(id)
	}
}

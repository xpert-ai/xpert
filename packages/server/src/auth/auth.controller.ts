import {
	Controller,
	Post,
	HttpStatus,
	HttpCode,
	Body,
	Get,
	Req,
	Query,
	Headers,
	UseGuards,
	UsePipes,
	ValidationPipe,
	BadRequestException,
	Session,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { CommandBus } from '@nestjs/cqrs';
import { Request } from 'express';
import { I18nLang } from 'nestjs-i18n';
import {
	IUserLoginInput,
	IAuthResponse,
	LanguagesEnum
} from '@metad/contracts';
import { AuthService } from './auth.service';
import { User as IUser, User } from '../user/user.entity';
import { AuthRegisterCommand, AuthTrialCommand } from './commands';
import { RequestContext } from '../core/context';
import { AuthLoginCommand } from './commands';
import { CurrentUser, Public } from './../shared/decorators';
import { AuthGuard } from '@nestjs/passport';
import { ChangePasswordRequestDTO, ResetPasswordRequestDTO } from '../password-reset/dto';
import { RegisterUserDTO } from '../user/dto';
import { randomUUID } from 'crypto';
import { UseValidationPipe } from '../shared/pipes';

@ApiTags('Auth')
// @UseInterceptors(TransformInterceptor)
@Controller()
export class AuthController {
	constructor(
		private readonly authService: AuthService,
		private readonly commandBus: CommandBus
	) {}

	@ApiOperation({ summary: 'Is authenticated' })
	@ApiResponse({ status: HttpStatus.OK })
	@ApiResponse({ status: HttpStatus.BAD_REQUEST })
	@Get('/authenticated')
	@Public()
	async authenticated(): Promise<boolean> {
		const token = RequestContext.currentToken();
		return await this.authService.isAuthenticated(token);
	}

	@ApiOperation({ summary: 'Has role?' })
	@ApiResponse({ status: HttpStatus.OK })
	@ApiResponse({ status: HttpStatus.BAD_REQUEST })
	@Get('/role')
	async hasRole(@Query('roles') roles: string[]): Promise<boolean> {
		const token = RequestContext.currentToken();
		return await this.authService.hasRole(token, roles);
	}

	@Post('/signup')
	@Public()
	@UsePipes(new ValidationPipe({ transform: true }))
	async signup(
		@Body() entity: RegisterUserDTO,
		@Req() request: Request,
		@I18nLang() languageCode: LanguagesEnum,
	): Promise<void> {
		await this.commandBus.execute(
			new AuthTrialCommand({originalUrl: request.get('Origin'), ...entity}, languageCode)
		)
		return
	}

	@ApiOperation({ summary: 'Create new record' })
	@ApiResponse({
		status: HttpStatus.CREATED,
		description: 'The record has been successfully created.' /*, type: T*/
	})
	@ApiResponse({
		status: HttpStatus.BAD_REQUEST,
		description:
			'Invalid input, The response body may contain clues as to what went wrong'
	})
	@Post('/register')
	@UsePipes(new ValidationPipe({ transform: true }))
	async create(
		@Body() entity: RegisterUserDTO,
		@Req() request: Request,
		@I18nLang() languageCode: LanguagesEnum,
	): Promise<IUser> {

		return await this.commandBus.execute(
			new AuthRegisterCommand({ 
					originalUrl: request.get('Origin'), ...entity
				}, 
				languageCode
			)
		);
	}

	@HttpCode(HttpStatus.OK)
	@Post('/login')
	@Public()
	async login(
		@Body() entity: IUserLoginInput,
		@Session() session: Record<string, any>,
		@Req() req: Request
	): Promise<IAuthResponse | null> {
		session.name = session.name || randomUUID()
		return await this.commandBus.execute(new AuthLoginCommand(entity));
	}

	@Public()
	@Get('verify')
	@HttpCode(HttpStatus.OK)
	async verifyMail(@Query('token') token: string): Promise<void> {
	  await this.authService.verifyEmail(token);
	}

	@Public()
	@UseGuards(AuthGuard('jwt-refresh'))
	@Get('refresh')
	@HttpCode(HttpStatus.OK)
	async refreshToken(@Req() req: Request): Promise<any> {
	  const userId = req.user['id']
	  const refreshToken = req.user['refreshToken']
	  return await this.authService.refreshTokens(userId, refreshToken)
	}
	
	@ApiOperation({ summary: 'Authentication is alive' })
	@ApiResponse({ status: HttpStatus.OK })
	@Get('alive')
	@HttpCode(HttpStatus.OK)
	async alive(@Req() req: Request) {
		return { message: 'Token is valid', user: req.user };
	}

	@Post('/reset-password')
	@Public()
	@UsePipes(new ValidationPipe({ transform: true }))
	async resetPassword(
		@Body() request: ChangePasswordRequestDTO
	) {
		return await this.authService.resetPassword(request);
	}
	
	/**
	 * Request a password reset.
	 *
	 * @param body - Password reset request data.
	 * @param origin - Origin Request Header.
	 * @param languageCode - Language code.
	 * @returns
	 */
	@Post('/request-password')
	@Public()
	@UseValidationPipe({ whitelist: true })
	async requestPassword(
		@Body() body: ResetPasswordRequestDTO,
		@Headers('origin') origin: string,
		@I18nLang() languageCode: LanguagesEnum
	): Promise<boolean | BadRequestException> {
		return await this.authService.requestResetPassword(body, languageCode, origin);
	}

	@Post('resend-verification')
	@HttpCode(HttpStatus.OK)
	async resendVerificationMail(@CurrentUser() user: User, @I18nLang() languageCode: LanguagesEnum): Promise<void> {
	  await this.authService.resendVerificationMail(user, languageCode);
	}
}

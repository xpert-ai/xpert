import {
	Controller,
	Get,
	HttpStatus,
	Param,
	Query,
	UseGuards,
	HttpCode,
	Post,
	Body,
	Put,
	Delete,
	UseInterceptors,
	UsePipes,
	ValidationPipe,
	ForbiddenException,
	HttpException,
	ClassSerializerInterceptor,
	BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadedFile } from '@metad/contracts';
import { FileStorage, UploadedFileStorage } from '../core/file-storage';
import path from 'path';
import chardet from 'chardet';
import iconv from 'iconv-lite';
import * as XLSX from 'xlsx';
import fsPromises from 'fs/promises';
import {
	ApiOperation,
	ApiResponse,
	ApiTags,
	ApiBearerAuth
} from '@nestjs/swagger';
import { CommandBus } from '@nestjs/cqrs';
import {
	IPagination,
	PermissionsEnum,
	IUserCreateInput,
	IUserUpdateInput,
	UserType,
	RolesEnum
} from '@metad/contracts';
import { CrudController, PaginationParams } from './../core/crud';
import { TransformInterceptor } from './../core/interceptors';
import { RequestContext } from '../core/context';
import { UUIDValidationPipe, ParseJsonPipe } from './../shared/pipes';
import { PermissionGuard, RoleGuard, TenantPermissionGuard } from './../shared/guards';
import { Permissions, Roles } from './../shared/decorators';
import { User, UserPreferredLanguageDTO } from './user.entity';
import { UserService } from './user.service';
import { UserBulkCreateCommand, UserCreateCommand } from './commands';
import { FactoryResetService } from './factory-reset/factory-reset.service';
import { UserDeleteCommand } from './commands/user.delete.command';
import { Like, Not } from 'typeorm';
import { UserPasswordDTO } from './dto';

@ApiTags('User')
@ApiBearerAuth()
// 这个原来作用是什么？ 导致了异常被包装成正常的返回 statuscode
// @UseInterceptors(TransformInterceptor)
@Controller()
export class UserController extends CrudController<User> {
	constructor(
		private readonly userService: UserService,
		private readonly factoryResetService: FactoryResetService,
		private readonly commandBus: CommandBus
	) {
		super(userService);
	}

	/**
	 * GET current login user
	 * 
	 * @param data 
	 * @returns 
	 */
	@ApiOperation({ summary: 'Find current user.' })
	@ApiResponse({
		status: HttpStatus.OK,
		description: 'Found current user',
		type: User
	})
	@ApiResponse({
		status: HttpStatus.NOT_FOUND,
		description: 'Record not found'
	})
	@Get('/me')
	async findMe(
		@Query('data', ParseJsonPipe) data: any
	): Promise<User> {
		const { relations = [] } = data;
		const id = RequestContext.currentUserId();
		return await this.userService.findOne(id, {
			relations
		});
	}

	/**
	 * GET user by email
	 * 
	 * @param email 
	 * @returns 
	 */
	@ApiOperation({ summary: 'Find user by email address.' })
	@ApiResponse({
		status: HttpStatus.OK,
		description: 'Found user by email address',
		type: User
	})
	@ApiResponse({
		status: HttpStatus.NOT_FOUND,
		description: 'Record not found'
	})
	@Get('/email/:email')
	async findByEmail(@Param('email') email: string): Promise<User> {
		return this.userService.getUserByEmail(email);
	}

	/**
	 * UPDATE user preferred language
	 * 
	 * @param id 
	 * @param entity 
	 * @param options 
	 * @returns 
	 */
	@HttpCode(HttpStatus.ACCEPTED)
	@UseGuards(TenantPermissionGuard)
	@Put('/preferred-language/:id')
	@UsePipes(new ValidationPipe({
		transform: true,
		whitelist: true
	}))
	async updatePreferredLanguage(
		@Param('id', UUIDValidationPipe) id: string,
		@Body() entity: UserPreferredLanguageDTO
	) {
		const userId = RequestContext.currentUserId();
		if (userId !== id) {
			throw new ForbiddenException();
		}

		const { preferredLanguage } = entity;
		return this.userService.updatePreferredLanguage(
			id,
			preferredLanguage
		);
	}

	/**
	 * GET user count
	 * 
	 * @param data 
	 * @returns 
	 */
	@Get('count')
	async getCount(
		@Query('data', ParseJsonPipe) data: any
	): Promise<any> {
		const { relations, findInput } = data;
		return this.userService.count({
			where: findInput,
			relations
		});
	}

	/**
	 * GET user list by pagination
	 * 
	 * @param filter 
	 * @returns 
	 */
	@UseGuards(PermissionGuard)
	@Permissions(PermissionsEnum.ORG_USERS_VIEW)
	@Get('pagination')
	@UsePipes(new ValidationPipe({ transform: true }))
	async pagination(
		@Query() filter: PaginationParams<User>
	): Promise<IPagination<User>> {
		return this.userService.paginate(filter);
	}

	/**
	 * GET all users
	 * 
	 * @param data 
	 * @returns 
	 */
	@ApiOperation({ summary: 'Find all users.' })
	@ApiResponse({
		status: HttpStatus.OK,
		description: 'Found users',
		type: User
	})
	@ApiResponse({
		status: HttpStatus.NOT_FOUND,
		description: 'Record not found'
	})
	@UseGuards(PermissionGuard)
	@Permissions(PermissionsEnum.ORG_USERS_VIEW)
	@Get()
	async findAll(@Query('data', ParseJsonPipe) data: any): Promise<IPagination<User>> {
		const { relations, search } = data;
		let { findInput } = data;
		if (search) {
			findInput = findInput ?? {}
			findInput.email = Like(`%${search.split('%').join('')}%`)
		}

		return this.userService.findAll({
			where: {
				...(findInput ?? {}),
				type: Not(UserType.COMMUNICATION)
			},
			relations
		});
	}

	@UseInterceptors(ClassSerializerInterceptor)
	@Get('search')
	async search(@Query('search') search: string) {
		const organizationId = RequestContext.getOrganizationId()
		return this.userService.search(search, organizationId)
	}

	@HttpCode(HttpStatus.ACCEPTED)
	@Put('me')
	async updateMe(
		@Body() entity: IUserUpdateInput
	): Promise<any> {
		const me = RequestContext.currentUser()
		return await this.userService.updateProfile(me.id, {
			...entity,
			id: me.id,
		} as User);
	}

	/**
	 * GET user by id
	 * 
	 * @param id 
	 * @param data 
	 * @returns 
	 */
	@ApiOperation({ summary: 'Find User by id.' })
	@ApiResponse({
		status: HttpStatus.OK,
		description: 'Found one record',
		type: User
	})
	@ApiResponse({
		status: HttpStatus.NOT_FOUND,
		description: 'Record not found'
	})
	@Get(':id')
	async findById(
		@Param('id', UUIDValidationPipe) id: string,
		@Query('data', ParseJsonPipe) data?: any
	): Promise<User> {
		const { relations } = data;
		return this.userService.findOne(id, { relations });
	}

	/**
	 * CREATE new user
	 * 
	 * @param entity 
	 * @param options 
	 * @returns 
	 */
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
	@UseGuards(PermissionGuard)
	@UseGuards(TenantPermissionGuard, PermissionGuard)
	@Permissions(PermissionsEnum.ORG_USERS_EDIT)
	@HttpCode(HttpStatus.CREATED)
	@Post()
	async create(
		@Body() entity: IUserCreateInput
	): Promise<User> {
		return await this.commandBus.execute(
			new UserCreateCommand(entity)
		);
	}

	/**
	 * UPDATE user by id
	 * 
	 * @param id 
	 * @param entity 
	 * @param options 
	 * @returns 
	 */
	@HttpCode(HttpStatus.ACCEPTED)
	@UseGuards(TenantPermissionGuard, PermissionGuard)
	@Permissions(PermissionsEnum.ORG_USERS_EDIT, PermissionsEnum.PROFILE_EDIT)
	@Put(':id')
	async update(
		@Param('id', UUIDValidationPipe) id: string,
		@Body() entity: IUserUpdateInput
	): Promise<any> {
		return await this.userService.updateProfile(id, {
			id,
			...entity
		} as User);
	}

	/**
	 * DELTE user account
	 * 
	 * @param userId 
	 * @returns 
	 */
	@ApiOperation({
		summary: 'Delete record'
	})
	@ApiResponse({
		status: HttpStatus.OK,
		description: 'The record has been successfully deleted'
	})
	@ApiResponse({
		status: HttpStatus.NOT_FOUND,
		description: 'Record not found'
	})
	@UseGuards(TenantPermissionGuard, PermissionGuard)
	@Permissions(PermissionsEnum.ACCESS_DELETE_ACCOUNT)
	@Delete(':id')
	async delete(
		@Param('id', UUIDValidationPipe) userId: string,
	): Promise<any> {
		return await this.commandBus.execute(
			new UserDeleteCommand(userId)
		)
	}

	@HttpCode(HttpStatus.ACCEPTED)
	@UseGuards(TenantPermissionGuard, PermissionGuard)
	@Permissions(PermissionsEnum.ORG_USERS_EDIT, PermissionsEnum.PROFILE_EDIT)
	@Post(':id/password')
	async resetPassword(
		@Param('id', UUIDValidationPipe) userId: string,
		@Body() userPassword: UserPasswordDTO
	) {
		return await this.userService.resetPassword(userId, userPassword.hash, userPassword.password)
	}

	/**
	 * DELETE all user data from all tables
	 * 
	 * @param id 
	 * @returns 
	 */
	@ApiOperation({ summary: 'Delete all user data.' })
	@ApiResponse({
		status: HttpStatus.OK,
		description: 'Deleted all user data.',
		type: User
	})
	@ApiResponse({
		status: HttpStatus.NOT_FOUND,
		description: 'Record not found'
	})
	@UseGuards(TenantPermissionGuard, PermissionGuard)
	@Permissions(PermissionsEnum.ACCESS_DELETE_ALL_DATA)
	@Delete('/reset/:id')
	async deleteAllData(
		@Param('id', UUIDValidationPipe) id: string
	){
		return this.factoryResetService.reset(id);
	}

	@UseGuards(RoleGuard)
	@Roles(RolesEnum.SUPER_ADMIN, RolesEnum.ADMIN)
	@Post('bulk')
	async createBulk(@Body() users: IUserCreateInput[]) {
		return await this.commandBus.execute(new UserBulkCreateCommand(users))
	}

	@UseGuards(RoleGuard)
	@Roles(RolesEnum.SUPER_ADMIN, RolesEnum.ADMIN)
	@Post('bulk/upload')
	@UseInterceptors(
		FileInterceptor('file', {
			storage: new FileStorage().storage({
				dest: path.join('import', 'users'),
				prefix: 'user-import'
			})
		})
	)
	@ApiOperation({ summary: 'Upload and parse CSV file for bulk user import' })
	@ApiResponse({
		status: HttpStatus.OK,
		description: 'Users parsed from CSV file'
	})
	async uploadAndParseCsv(@UploadedFileStorage() file: UploadedFile): Promise<IUserCreateInput[]> {
		if (!file) {
			throw new BadRequestException('No file uploaded')
		}

		const { path: filePath, mimetype, originalname } = file

		// Only accept CSV files
		if (mimetype !== 'text/csv' && !originalname.endsWith('.csv')) {
			throw new BadRequestException('Only CSV files are supported')
		}

		try {
			// Read file buffer
			const buffer = await fsPromises.readFile(filePath)

			// Function to check if string contains valid Chinese characters
			const containsValidChinese = (str: string): boolean => {
				// Check for Chinese characters (CJK Unified Ideographs)
				return /[\u4e00-\u9fa5]/.test(str)
			}

			// Function to detect if string looks like mis-decoded UTF-8 (common pattern: ´ò·¢µÄ)
			const looksLikeMisDecoded = (str: string): boolean => {
				// Pattern: sequences of accented characters that look like mis-decoded UTF-8 Chinese
				// Examples: ´ò·¢µÄ, °¢ÈøµÂ
				return /[´°µÄÂÈøò·¢]{3,}/.test(str)
			}

			// Function to check if decoding is likely correct
			const isValidDecoding = (decoded: string, encoding: string): boolean => {
				// Check for replacement characters (indicates decoding failure)
				if (decoded.includes('\uFFFD')) {
					return false
				}
				
				// For UTF-8, validate it's proper UTF-8
				if (encoding === 'utf8' || encoding === 'utf-8') {
					try {
						// Try to re-encode to verify it's valid UTF-8
						Buffer.from(decoded, 'utf8')
						return true
					} catch {
						return false
					}
				}
				
				return true
			}

			// Try UTF-8 first (most common, especially for files saved from modern editors)
			// Then try Chinese encodings if UTF-8 doesn't produce valid Chinese
			const encodingsToTry = ['utf8', 'gbk', 'gb18030', 'gb2312', 'big5']
			
			// First, check for BOM
			let startOffset = 0
			if (buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
				// UTF-8 BOM detected, skip BOM bytes
				startOffset = 3
			}
			
			const bufferToDecode = startOffset > 0 ? buffer.slice(startOffset) : buffer

			let content: string | null = null
			let lastError: Error | null = null

			for (const encoding of encodingsToTry) {
				try {
					// Try to decode with this encoding
					const decoded = iconv.decode(bufferToDecode, encoding)
					
					if (!isValidDecoding(decoded, encoding)) {
						continue
					}

					// Skip if it looks like mis-decoded UTF-8
					if (looksLikeMisDecoded(decoded)) {
						continue
					}

					// If decoded string contains Chinese characters, it's likely correct
					if (containsValidChinese(decoded)) {
						content = decoded
						break
					}
					
					// For UTF-8, if no Chinese but looks valid, use it as fallback (might be English-only file)
					// For other encodings, only use if we haven't found any valid content yet
					if (encoding === 'utf8' && !content && decoded.length > 0) {
						content = decoded
					} else if (!content && decoded.length > 0 && !decoded.match(/[^\x00-\x7F]/)) {
						// Only use non-UTF-8 if it's pure ASCII (no special characters that might be mis-decoded)
						content = decoded
					}
				} catch (err) {
					lastError = err
					continue
				}
			}

			if (!content) {
				// If all encodings failed, try UTF-8 as last resort
				try {
					content = iconv.decode(bufferToDecode, 'utf8')
				} catch (err) {
					throw new BadRequestException(`Failed to decode CSV file. Tried encodings: ${encodingsToTry.join(', ')}. Error: ${lastError?.message || err.message}`)
				}
			}

			if (!content) {
				throw new BadRequestException('Failed to decode CSV file with any known encoding')
			}

			// Parse CSV with XLSX
			const workbook = XLSX.read(content, { 
				type: 'string',
				codepage: 65001 // UTF-8 codepage
			})

			const sheet = workbook.Sheets[workbook.SheetNames[0]]
			
			// Convert to JSON array
			const jsonData = XLSX.utils.sheet_to_json(sheet) as any[]

			// Map to IUserCreateInput format
			const users: IUserCreateInput[] = jsonData.map((row: any) => {
				// Map CSV columns to user input fields
				// Adjust field names based on your CSV template
				return {
					username: row.username || row.用户名,
					email: row.email || row.邮箱,
					hash: row.hash || row.密码,
					firstName: row.firstName || row.名 || row.first_name,
					lastName: row.lastName || row.姓 || row.last_name,
					roleName: row.roleName || row.角色 || row.role_name,
					thirdPartyId: row.thirdPartyId || row.第三方ID || row.third_party_id
				} as IUserCreateInput
			})

			// Clean up temporary file
			try {
				await fsPromises.unlink(filePath)
			} catch (err) {
				// Ignore cleanup errors
			}

			return users
		} catch (error) {
			// Clean up temporary file on error
			try {
				await fsPromises.unlink(filePath)
			} catch (err) {
				// Ignore cleanup errors
			}
			throw new BadRequestException(`Failed to parse CSV file: ${error.message}`)
		}
	}
}

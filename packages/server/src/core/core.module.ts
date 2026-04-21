import { forwardRef, MiddlewareConsumer, Module, NestModule } from '@nestjs/common'
import { RequestContextMiddleware } from '@xpert-ai/plugin-sdk'
import { DatabaseModule } from '../database/database.module'
import { TenantModule } from '../tenant/tenant.module'
import { RequestContextMiddleware as DeprecatedRCM } from './context/request-context.middleware'
import { TenantDomainMiddleware } from './context/tenant.middleware'
import { AnonymousTenantContextMiddleware } from './context/anonymous-tenant-context.middleware'

@Module({
	imports: [
		DatabaseModule,
		forwardRef(() => TenantModule)
		// GraphqlApiModule,
		// GraphqlModule.registerAsync((configService: ConfigService) => ({
		// 	path: configService.graphqlConfigOptions.path,
		// 	playground: configService.graphqlConfigOptions.playground,
		// 	debug: configService.graphqlConfigOptions.debug,
		// 	cors: {
		// 		methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
		// 		credentials: true,
		// 		origin: '*',
		// 		allowedHeaders:
		// 			'Authorization, Language, Tenant-Id, X-Requested-With, X-Auth-Token, X-HTTP-Method-Override, Content-Type, Content-Language, Accept, Accept-Language, Observe'
		// 	},
		// 	typePaths: [
		// 		environment.isElectron
		// 			? path.join(
		// 					path.resolve(__dirname, '../../../../../../data/'),
		// 					'*.gql'
		// 			  )
		// 			: path.join(
		// 					path.resolve(__dirname, '../**/', 'schema'),
		// 					'*.gql'
		// 			  )
		// 	],
		// 	resolverModule: GraphqlApiModule
		// })) as DynamicModule,
	],
	controllers: [],
	providers: [AnonymousTenantContextMiddleware]
})
export class CoreModule implements NestModule {
	configure(consumer: MiddlewareConsumer) {
		consumer.apply(DeprecatedRCM).forRoutes('*')
		consumer.apply(TenantDomainMiddleware).forRoutes('*')
		consumer.apply(AnonymousTenantContextMiddleware).forRoutes('*')
		consumer.apply(RequestContextMiddleware).forRoutes('*')
	}
}

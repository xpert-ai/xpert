import { OrganizationModule, RedisModule, TenantModule } from '@metad/server-core'
import { Module, forwardRef, CacheModule } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { CqrsModule } from '@nestjs/cqrs'
import { AgentModule } from './agent/index'
import { AppController } from './app.controller'
import { AnalyticsService } from './app.service'
import { ApprovalPolicyModule } from './approval-policy/approval-policy.module'
import { BusinessAreaUserModule } from './business-area-user/index'
import { BusinessAreaModule } from './business-area/index'
import { CertificationModule } from './certification'
import { CollectionModule } from './collection/index'
import { CommentModule } from './comment'
import { CommandHandlers, EventHandlers } from './core/events/handlers'
import { DataSourceTypeModule } from './data-source-type/data-source-type.module'
import { DataSourceModule } from './data-source/data-source.module'
import { FavoriteModule } from './favorite/favorite.module'
import { FeedModule } from './feed/feed.module'
import { IndicatorAppModule } from './indicator-app/'
import { IndicatorMarketModule } from './indicator-market/indicator-market.module'
import { IndicatorModule } from './indicator/indicator.module'
import { InsightModule } from './insight/insight.module'
import { SemanticModelModule } from './model/model.module'
import { NotificationDestinationModule } from './notification-destination/index'
import { PermissionApprovalUserModule } from './permission-approval-user/permission-approval-user.module'
import { PermissionApprovalModule } from './permission-approval/permission-approval.module'
import { ProjectModule } from './project/index'
import { ModelQueryModule } from './query/index'
import { ScreenshotModule } from './screenshot/screenshot.module'
import { StoryPointModule } from './story-point/story-point.module'
import { StoryTemplateModule } from './story-template/index'
import { StoryWidgetModule } from './story-widget/story-widget.module'
import { StoryModule } from './story/story.module'
import { SubscriptionModule } from './subscription/subscription.module'
import { VisitModule } from './visit/visit.module'
import { SemanticModelEntityModule } from './model-entity'
import { SemanticModelMemberModule } from './model-member'
import { ChatBIConversationModule } from './chatbi-conversation/conversation.module'
import { ChatBIModule } from './chatbi'
import { ChatBIModelModule } from './chatbi-model'
import { ModelQueryLogModule } from './model-query-log'

@Module({
	imports: [
		ConfigModule.forRoot({
			isGlobal: true
		}),
		// BullModule.forRootAsync({
		// 	imports: [ConfigModule],
		// 	useFactory: async (configService: ConfigService) => {
		// 		const host = configService.get('REDIS_HOST') || 'localhost'
		// 		const port = configService.get('REDIS_PORT') || 6379
		// 		const password = configService.get('REDIS_PASSWORD') || ''
		// 		return {
		// 			redis: {
		// 				host,
		// 				port,
		// 				password
		// 			},
		// 		}
		// 	},
		// 	inject: [ConfigService],
		//   }),
		// CacheModule.register(),
		CqrsModule,
		forwardRef(() => TenantModule),
		forwardRef(() => OrganizationModule),
		ProjectModule,
		CollectionModule,
		StoryModule,
		StoryTemplateModule,
		BusinessAreaModule,
		BusinessAreaUserModule,
		SemanticModelModule,
		SemanticModelEntityModule,
		SemanticModelMemberModule,
		ModelQueryLogModule,
		DataSourceModule,
		DataSourceTypeModule,
		StoryPointModule,
		StoryWidgetModule,
		IndicatorModule,
		IndicatorAppModule,
		IndicatorMarketModule,
		NotificationDestinationModule,
		SubscriptionModule,
		InsightModule,
		AgentModule,
		FavoriteModule,
		ModelQueryModule,
		VisitModule,
		FeedModule,
		ApprovalPolicyModule,
		PermissionApprovalModule,
		PermissionApprovalUserModule,
		CommentModule,
		ScreenshotModule,
		CertificationModule,
		RedisModule,
		ChatBIConversationModule,
		ChatBIModule,
		ChatBIModelModule
	],
	controllers: [AppController],
	providers: [AnalyticsService, ...EventHandlers, ...CommandHandlers]
})
export class AnalyticsModule {}

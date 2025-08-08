import { ApprovalPolicy } from '../../approval-policy/approval-policy.entity'
import { BusinessAreaUser } from '../../business-area-user/business-area-user.entity'
import { BusinessArea } from '../../business-area/business-area.entity'
import { Collection } from '../../collection/collection.entity'
import { DataSourceType } from '../../data-source-type/data-source-type.entity'
import { DataSourceAuthentication } from '../../data-source/authentication/authentication.entity'
import { DataSource } from '../../data-source/data-source.entity'
import { Favorite } from '../../favorite/favorite.entity'
import { Feed } from '../../feed/feed.entity'
import { IndicatorMarket } from '../../indicator-market/indicator-market.entity'
import { Indicator } from '../../indicator/indicator.entity'
import { SemanticModelCache } from '../../model/cache/cache.entity'
import { SemanticModelMember } from '../../model-member/member.entity'
import { SemanticModel } from '../../model/model.entity'
import { SemanticModelRole } from '../../model/role/role.entity'
import { NotificationDestination } from '../../notification-destination/notification-destination.entity'
import { PermissionApprovalUser } from '../../permission-approval-user/permission-approval-user.entity'
import { PermissionApproval } from '../../permission-approval/permission-approval.entity'
import { Project } from '../../project/project.entity'
import { ModelQuery } from '../../query/index'
import { StoryPoint } from '../../story-point/story-point.entity'
import { StoryWidget } from '../../story-widget/story-widget.entity'
import { Story } from '../../story/story.entity'
import { Subscription } from '../../subscription/subscription.entity'
import { Visit } from '../../visit/visit.entity'
import { Comment } from '../../comment/comment.entity'
import { StoryTemplate } from '../../story-template/story-template.entity'
import { Screenshot } from '../../screenshot/screenshot.entity'
import { Certification } from '../../certification/certification.entity'
import { IndicatorApp } from '../../indicator-app/indicator-app.entity'
import { SemanticModelEntity } from '../../model-entity/entity.entity'
import { ChatBIModel } from '../../chatbi-model/chatbi-model.entity'
import { SemanticModelQueryLog } from './internal'


export const ALL_ENTITIES = [
	DataSourceType,
	DataSource,
	DataSourceAuthentication,
	SemanticModel,
	SemanticModelCache,
	SemanticModelMember,
	SemanticModelRole,
	SemanticModelEntity,
	SemanticModelQueryLog,
	Story,
	StoryPoint,
	StoryWidget,
	StoryTemplate,
	BusinessArea,
	BusinessAreaUser,
	Indicator,
	IndicatorApp,
	IndicatorMarket,
	NotificationDestination,
	Subscription,
	Favorite,
	ModelQuery,
	Visit,
	Feed,
	ApprovalPolicy,
	PermissionApproval,
	PermissionApprovalUser,
	Project,
	Collection,
	Comment,
	Screenshot,
	Certification,
	ChatBIModel
]

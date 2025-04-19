import path from 'path';
import { ConfigService, environment } from '@metad/server-config';
import { ServeStaticModuleOptions } from '@nestjs/serve-static';

export async function resolveServeStaticPath(
	configService: ConfigService
): Promise<ServeStaticModuleOptions[]> {
	return [
		{
			rootPath: configService.assetOptions.assetPublicPath ||
				  path.resolve(process.cwd(), 'public'),
			serveRoot: '/public/'
		}
	] as ServeStaticModuleOptions[];
}

// import csurf from 'csurf';
import { INestApplication, Type } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
// import { SentryService } from '@ntegral/nestjs-sentry';
import expressSession from 'express-session';
import helmet from 'helmet';
import chalk from 'chalk';
import { urlencoded, json } from 'express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { EntitySubscriberInterface } from 'typeorm';
import { getConfig, setConfig, environment as env } from '@metad/server-config';
import { coreEntities } from '../core/entities';
import { coreSubscribers } from './../core/entities/subscribers';
import { AppService } from '../app.service';
import { ServerAppModule } from '../server.module';
import { AuthGuard } from './../shared/guards';

export async function bootstrap(
	pluginConfig?: Partial<any>
): Promise<INestApplication> {
	const config = await registerPluginConfig(pluginConfig);
	
	const { BootstrapModule } = await import('./bootstrap.module');
	const app = await NestFactory.create<NestExpressApplication>(BootstrapModule, {
		logger: ['error', 'warn']
	});

	// This will lockdown all routes and make them accessible by authenticated users only.
	const reflector = app.get(Reflector);
	app.useGlobalGuards(new AuthGuard(reflector));

	// app.useLogger(app.get(SentryService));
	app.use(json({ limit: '50mb' }));
	app.use(urlencoded({ extended: true, limit: '50mb' }));
  
	app.enableCors({
		origin: '*',
		methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
		credentials: true,
		allowedHeaders:
			'Authorization, Language, Tenant-Id, X-Requested-With, X-Auth-Token, X-HTTP-Method-Override, Content-Type, Content-Language, Accept, Accept-Language, Observe'
	});

	// TODO: enable csurf
	// As explained on the csurf middleware page https://github.com/expressjs/csurf#csurf,
	// the csurf module requires either a session middleware or cookie-parser to be initialized first.
	// app.use(csurf());

	app.use(
		expressSession({
			secret: env.EXPRESS_SESSION_SECRET,
			resave: true,
			saveUninitialized: true
		})
	);

	app.use(helmet());
	const globalPrefix = 'api';
	app.setGlobalPrefix(globalPrefix);

	const service = app.select(ServerAppModule).get(AppService);
	await service.seedDBIfEmpty();

	const options = new DocumentBuilder()
		.setTitle('Metad API')
		.setVersion('1.0')
		.addBearerAuth()
		.build();

	const document = SwaggerModule.createDocument(app, options);
	SwaggerModule.setup('swg', app, document);

	let { port, host } = config.apiConfigOptions;
	if (!port) {
		port = 3000;
	}
	if (!host) {
		host = '0.0.0.0';
	}

	console.log(chalk.green(`Configured Host: ${host}`));
	console.log(chalk.green(`Configured Port: ${port}`));

	await app.listen(port, host, () => {
		console.log(chalk.magenta(`Listening at http://${host}:${port}/${globalPrefix}`));
		//Seed Demo Server
		service.excuteDemoSeed();
	});

	return app;
}

/**
 * Setting the global config must be done prior to loading the Bootstrap Module.
 */
export async function registerPluginConfig(
	pluginConfig: Partial<any>
) {
	if (Object.keys(pluginConfig).length > 0) {
		setConfig(pluginConfig);
	}

	console.log(
		chalk.green(
			`DB Config: ${JSON.stringify(getConfig().dbConnectionOptions)}`
		)
	);

	const entities = await registerAllEntities(pluginConfig);
	setConfig({
		dbConnectionOptions: {
			entities,
			subscribers: coreSubscribers as Array<Type<EntitySubscriberInterface>>,
		}
	});
	
	const registeredConfig = getConfig();
	return registeredConfig;
}

/**
 * Returns an array of core entities and any additional entities defined in plugins.
 */
export async function registerAllEntities(
	pluginConfig: Partial<any>
) {
	const allEntities = coreEntities as Array<Type<any>>;
	// const pluginEntities = getEntitiesFromPlugins(pluginConfig.plugins);

	// for (const pluginEntity of pluginEntities) {
	// 	if (allEntities.find((e) => e.name === pluginEntity.name)) {
	// 		throw new ConflictException({
	// 			message: `error.${pluginEntity.name} conflict by default entities`
	// 		});
	// 	} else {
	// 		allEntities.push(pluginEntity);
	// 	}
	// }
	return allEntities;
}

export * from './cache'
export * from './bull'
export * from './i18n'
export * from './i18next'
export * from './event'
export * from './task'
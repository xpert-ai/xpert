import { setConfig } from '@xpert-ai/server-config';
import { registerAllEntities } from './bootstrap';
import { getDbConfig } from './main';
import { seedDefault } from './core/seeds/seed';

async function bootstrap() {
	const entities = await registerAllEntities({});
	setConfig({
		dbConnectionOptions: {
			entities,
			...getDbConfig()
			// subscribers: coreSubscribers as Array<Type<EntitySubscriberInterface>>,
		}
	});

	seedDefault({}).catch((error: any) => {
		console.log(error);
		process.exit(1);
	});
}

bootstrap()
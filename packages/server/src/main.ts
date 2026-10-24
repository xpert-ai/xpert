import { ConnectionOptions } from 'typeorm'
import { bootstrap } from './bootstrap'

// async function bootstrap() {
//   const entities = await registerAllEntities({});
//   setConfig({
//     dbConnectionOptions: {
//       entities,
//       ...getDbConfig()
//       // subscribers: coreSubscribers as Array<Type<EntitySubscriberInterface>>,
//     }
//   });
//   console.log(`DB ConnectionOptions:`, getConfig())
//   const app = await NestFactory.create(ServerAppModule);

//   // This will lockdown all routes and make them accessible by authenticated users only.
// 	const reflector = app.get(Reflector);
// 	app.useGlobalGuards(new AuthGuard(reflector));

//   await app.listen(3000);
// }
// bootstrap();

bootstrap({
	dbConnectionOptions: {
		// synchronize: true,
		...getDbConfig()
	}
}).catch((error) => {
	console.log(error)
	process.exit(1)
})

export function getDbConfig(): ConnectionOptions {
	const dbType = 'postgres'
	// process.env.DB_TYPE && process.env.DB_TYPE === 'postgres'
	// 	? 'postgres'
	// 	: 'sqlite';

	switch (dbType) {
		case 'postgres':
			const ssl = process.env.DB_SSL_MODE === 'true' ? true : undefined

			return {
				type: dbType,
				host: process.env.DB_HOST || 'localhost',
				port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 5432,
				database: process.env.DB_NAME || 'postgres',
				username: process.env.DB_USER || 'postgres',
				password: process.env.DB_PASS || 'root',
				logging: true,
				ssl: ssl,
				// Removes console logging, instead logs all queries in a file ormlogs.log
				logger: 'file',
				// All environments use schema-sync, which protects SQL-managed tables.
				synchronize: false,
				uuidExtension: 'pgcrypto'
			}

		// case 'sqlite':
		// 	const sqlitePath =
		// 		process.env.DB_PATH ||
		// 		path.join(
		// 			path.resolve('.', ...['apps', 'api', 'data']),
		// 			'metad.sqlite3'
		// 		);

		// 	return {
		// 		type: dbType,
		// 		database: sqlitePath,
		// 		logging: true,
		// 		// Removes console logging, instead logs all queries in a file ormlogs.log
		// 		logger: 'file',
		// 		synchronize: true
		// 	};
	}
}

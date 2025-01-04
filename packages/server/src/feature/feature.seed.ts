import { Connection } from 'typeorm';
import * as path from 'path';
import { copyFileSync, mkdirSync } from 'fs';
import * as chalk from 'chalk';
import { rimraf } from 'rimraf';
import { ConfigService, environment as env } from '@metad/server-config';
import {
	IFeature,
	IFeatureCreateInput,
	IFeatureOrganization,
	ITenant
} from '@metad/contracts';
import { IPluginConfig } from '@metad/server-common';
import { DEFAULT_FEATURES } from './default-features';
import { Feature } from './feature.entity';
import { FeatureOrganization } from './feature-organization.entity';

/**
 * 创建全局 Features
 * @param connection 
 */
export const createFeatures = async (
	connection: Connection,
) => {
	DEFAULT_FEATURES.forEach(async (item: IFeatureCreateInput) => {
		const feature: IFeature = createFeature(item);
		const parent = await connection.manager.save(feature);

		const { children = [] } = item;
		if (children.length > 0) {
			const featureChildren: IFeature[] = [];
			children.forEach((child: IFeature) => {
				const childFeature: IFeature = createFeature(child);
				childFeature.parent = parent;
				featureChildren.push(childFeature);
			});

			await connection.manager.save(featureChildren);
		}
	})
}

/**
 * 为 Tenant 创建 Feature Toggle
 * 
 * @param connection 
 * @param config 
 * @param tenant 
 * @returns 
 */
export const createDefaultFeatureToggle = async (
	connection: Connection,
	config: IPluginConfig,
	tenant: ITenant
) => {

	DEFAULT_FEATURES.forEach(async (item: IFeatureCreateInput) => {
		const feature: IFeature = await connection.manager.findOne(Feature, {
			where: {code: item.code},
			relations: ['featureOrganizations']
		})

		await connection.manager.save(new FeatureOrganization({
			isEnabled: feature.isEnabled,
			tenant,
			featureId: feature.id
		}))

		const { children = [] } = item
		children?.forEach(async (child: IFeature) => {
			const feature: IFeature = await connection.manager.findOne(Feature, {
				where: {code: child.code},
				relations: ['featureOrganizations']
			})
			const childFeatureToggle: FeatureOrganization = new FeatureOrganization({
				isEnabled: feature.isEnabled,
				tenant,
				featureId: feature.id
			})

			await connection.manager.save(childFeatureToggle)
		})
	})
}

export const createRandomFeatureToggle = async (
	connection: Connection,
	tenants: ITenant[]
) => {
	const features: IFeature[] = await connection.getRepository(Feature).find();

	const featureOrganizations: IFeatureOrganization[] = [];
	features.forEach(async (feature: IFeature) => {
		tenants.forEach((tenant: ITenant) => {
			const { isEnabled } = feature;
			const featureOrganization: IFeatureOrganization = new FeatureOrganization(
				{
					isEnabled,
					tenant,
					feature
				}
			);
			featureOrganizations.push(featureOrganization);
		});
	});

	await connection.manager.save(featureOrganizations);
	return features;
};

export function createFeature(item: IFeature,) {
	const {
		name,
		code,
		description,
		// image,
		link,
		isEnabled,
		status,
		icon
	} = item;
	const feature: IFeature = new Feature().instanceOf({
		name,
		code,
		description,
		// image: copyImage(image, config),
		link,
		status,
		icon,
		// featureOrganizations: [
		// 	new FeatureOrganization({
		// 		isEnabled,
		// 		tenant
		// 	})
		// ]
	})

	return feature;
}

export function createFeatureToggle(item: IFeature, tenant: ITenant) {
	item.featureOrganizations = item.featureOrganizations || []
	if (item.id === null) {
		console.error(`feature id is null`)
	}
	item.featureOrganizations.push(new FeatureOrganization({
		isEnabled: item.isEnabled,
		tenant,
		featureId: item.id
	}))
	return item
}

async function cleanFeature(connection, config) {
	if (config.dbConnectionOptions.type === 'sqlite') {
		await connection.query('DELETE FROM feature');
		await connection.query('DELETE FROM feature_organization');
	} else {
		await connection.query(
			'TRUNCATE TABLE feature RESTART IDENTITY CASCADE'
		);
		await connection.query(
			'TRUNCATE TABLE feature_organization RESTART IDENTITY CASCADE'
		);
	}

	console.log(chalk.green(`CLEANING UP FEATURE IMAGES...`));

	await new Promise((resolve, reject) => {
		const destDir = 'features';
		const configService = new ConfigService();

		// console.log('FEATURE SEED -> IS ELECTRON: ' + env.isElectron);

		/*
		console.log(
			'FEATURE SEED -> assetPath: ' + config.assetOptions.assetPath
		);
		console.log(
			'FEATURE SEED -> assetPublicPath: ' +
				config.assetOptions.assetPublicPath
		);
		console.log('FEATURE SEED -> __dirname: ' + __dirname);
		*/

		let dir: string;

		dir = path.join(
			configService.assetOptions.assetPublicPath,
			destDir
		);

		// delete old generated feature image
		rimraf(`${dir}/!(rimraf|.gitkeep)`).then(() => {
			console.log(chalk.green(`CLEANED UP FEATURE IMAGES`));
			resolve(null);
		}).catch(() => {
			reject(null);
		})
	});
}

function copyImage(fileName: string, config: IPluginConfig) {
	try {
		const destDir = 'features';

		let dir: string;
		let baseDir: string;

		// if (env.isElectron) {
		// 	dir = path.resolve(
		// 		...['src', 'assets', 'seed', destDir]
		// 	);

		// } else {
			if (config.assetOptions.assetPath) {
				dir = path.join(
					config.assetOptions.assetPath,
					...['seed', destDir]
				);
			} else {
				dir = path.resolve(
					__dirname,
					'../../../',
					...['apps', 'api', 'src', 'assets', 'seed', destDir]
				);
			}

			if (config.assetOptions.assetPublicPath) {
				baseDir = config.assetOptions.assetPublicPath;
			} else {
				baseDir = path.resolve(
					__dirname,
					'../../../',
					...['apps', 'api', 'public']
				);
			}
		// }

		// console.log('FEATURE SEED -> dir: ' + dir);
		// console.log('FEATURE SEED -> baseDir: ' + baseDir);

		const finalDir = path.join(baseDir, destDir);

		// console.log('FEATURE SEED -> finalDir: ' + finalDir);

		mkdirSync(finalDir, { recursive: true });

		const destFilePath = path.join(destDir, fileName);

		copyFileSync(
			path.join(dir, fileName),
			path.join(baseDir, destFilePath)
		);

		return destFilePath;
	} catch (err) {
		console.log(err);
	}
}

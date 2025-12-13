// import chalk from 'chalk';
// import { execSync } from 'child_process'
// import { installOrganizationPlugins, InstallOrganizationPluginsOptions } from './organization-plugin.store';

// export interface InstallPluginsOptions extends InstallOrganizationPluginsOptions {
//     /** Override plugins list instead of reading from PLUGINS env variable */
//     plugins?: string[];
//     /** Target organization. If provided, install will be isolated under that organization's workspace */
//     organizationId?: string;
// }

// /**
//  * Install plugins configured (via environment variables) during development 
//  */
// export function installPlugins(options: InstallPluginsOptions = {}) {
//     const plugins = options.plugins || process.env.PLUGINS?.split(/[,;]/).filter(Boolean) || [];
//     // Install plugins
//     if (plugins.length > 0) {
//         if (options.organizationId) {
//             installOrganizationPlugins(options.organizationId, plugins, options);
//             return;
//         }

//         process.stdout.write('Installing plugins: ')
//         for (const plugin of plugins) {
//             process.stdout.write(chalk.bgBlue(plugin) + ' ')
//         }
//         process.stdout.write('\n')
//         try {
//             execSync(`npm install --legacy-peer-deps --no-save ${plugins.join(' ')}`, {
//                 stdio: 'inherit',
//                 env: {
//                     ...process.env,
//                     npm_config_package_lock: 'false',
//                     npm_config_lockfile: 'false'
//                 }
//             });
//             console.log(chalk.green(`Installed plugins: ${plugins.join(', ')}`));
//         } catch (error) {
//             console.error('Failed to install plugins via npm:', error);
//         }
//     }
// }

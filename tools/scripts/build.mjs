import { execSync } from 'child_process';
import fs from 'fs'
import path from 'path'
import archiver from 'archiver';

// 复制文件
const copyDir = (src, dest) => {
    fs.mkdirSync(dest, { recursive: true });
    fs.readdirSync(src).forEach(file => {
        const srcPath = path.join(src, file);
        const destPath = path.join(dest, file);
        if (fs.lstatSync(srcPath).isDirectory()) {
            copyDir(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    });
};

// 压缩目录成 zip 文件
const createZip = (sourceDir, zipFileName) => {
    return new Promise((resolve, reject) => {
        const output = fs.createWriteStream(zipFileName);
        const archive = archiver('zip', {
            zlib: { level: 9 }
        });

        output.on('close', () => resolve());
        archive.on('error', (err) => reject(err));

        archive.pipe(output);
        archive.directory(sourceDir, false);
        archive.finalize();
    });
};

try {
    execSync('yarn build', { stdio: 'inherit' });
    
    // 编译后端
    execSync('yarn nx build api', { stdio: 'inherit' });
    
    // copyDir('dist/packages', 'dist/apps/api/packages');
    fs.copyFileSync('.deploy/api/package-prod.json', 'dist/apps/api/package.json');
    fs.copyFileSync('tsconfig.base.json', 'dist/apps/api/tsconfig.json');
    fs.copyFileSync('yarn.lock', 'dist/apps/api/yarn.lock');
    
    // 切换到 dist/apps/api 目录并执行 yarn install
    process.chdir('dist/apps/api');
    execSync('mv ../../packages ./packages', { stdio: 'inherit' });
    execSync('yarn install', { stdio: 'inherit' });
    // execSync('npm install ./packages/analytics --legacy-peer-deps', { stdio: 'inherit' });
    
    // 切换回原始目录（可选，如果你需要在原目录继续后续操作）
    process.chdir('../../..');
    
    // 编译前端
    process.env.NODE_OPTIONS = '--max_old_space_size=8192';
    execSync('yarn nx build cloud --configuration=production', { stdio: 'inherit' });

    // 编译计算引擎
    process.chdir('packages/olap');
    if (fs.existsSync('target/olap-1.0.0.jar')) {
        fs.copyFileSync('target/olap-1.0.0.jar', '../../dist/apps/olap.jar');
    } else {
        execSync('mvn package', { stdio: 'inherit' });
        fs.copyFileSync('target/olap-1.0.0.jar', '../../dist/apps/olap.jar');
    }
    process.chdir('../..');
    
    console.log('Build completed successfully!');

    fs.copyFileSync('tools/scripts/.env.example', 'dist/.env');
    fs.copyFileSync('tools/scripts/webapp.prod.conf', 'dist/webapp.prod.conf');
    fs.copyFileSync('tools/scripts/install.sh', 'dist/install.sh');

    console.log('Creating zip files...');
    await createZip('dist', 'xpertai.zip');

    console.log('Build and compression completed successfully!');
} catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
}
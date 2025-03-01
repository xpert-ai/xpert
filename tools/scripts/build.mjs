import { execSync } from 'child_process';
import fs from 'fs'
import path from 'path'

try {
    execSync('yarn build', { stdio: 'inherit' });
    
    // 编译后端
    execSync('yarn nx build api', { stdio: 'inherit' });
    
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
    
    copyDir('dist/packages', 'dist/apps/api/');
    fs.copyFileSync('.deploy/api/package-prod.json', 'dist/apps/api/package.json');
    fs.copyFileSync('tsconfig.base.json', 'dist/apps/api/');
    fs.copyFileSync('yarn.lock', 'dist/apps/api/');
    
    execSync('yarn install', { stdio: 'inherit' });
    
    // 编译前端
    process.env.NODE_OPTIONS = '--max_old_space_size=8192';
    execSync('yarn nx build cloud --configuration=production', { stdio: 'inherit' });
    
    console.log('Build completed successfully!');
} catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
}
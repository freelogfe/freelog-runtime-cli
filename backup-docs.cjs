const fs = require('fs');
const path = require('path');

const srcDir = 'docs/一期/产品方案';
const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('.')[0];
const dstDir = `docs/一期/产品方案 - 原始备份-${timestamp}`;

console.log(`开始备份：${srcDir} → ${dstDir}\n`);

if (fs.existsSync(dstDir)) {
  console.log('⚠️ 备份目录已存在，跳过');
  process.exit(0);
}

// 创建备份目录
fs.mkdirSync(dstDir, { recursive: true });
console.log(`✓ 已创建备份目录：${dstDir}\n`);

// 递归复制目录
function copyDirectory(src, dst) {
  const files = fs.readdirSync(src);
  
  files.forEach(file => {
    const srcPath = path.join(src, file);
    const dstPath = path.join(dst, file);
    
    const stat = fs.statSync(srcPath);
    
    if (stat.isDirectory()) {
      fs.mkdirSync(dstPath, { recursive: true });
      console.log(`📁 复制目录：${file}/`);
      copyDirectory(srcPath, dstPath);
    } else {
      fs.copyFileSync(srcPath, dstPath);
      console.log(`📄 复制文件：${file}`);
    }
  });
}

copyDirectory(srcDir, dstDir);

console.log('\n✅ 备份完成！');
console.log(`   总文件数：${countFiles(dstDir)}`);

function countFiles(dir) {
  let count = 0;
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      count += countFiles(filePath);
    } else {
      count++;
    }
  });
  return count;
}

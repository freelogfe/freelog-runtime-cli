/**
 * 发布命令
 */

import inquirer from 'inquirer';
import ora from 'ora';
import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import AdmZip from 'adm-zip';
import FormData from 'form-data';
import apiClient from '../core/http';
import { requireAuth } from '../core/auth';
import { readConfig, updateConfig } from '../core/config';
import { CommandOptions } from '../types';

export async function executePublish(options: CommandOptions): Promise<void> {
  try {
    const auth = requireAuth();
    
    console.log(chalk.cyan('\n=== 发布作品 ===\n'));
    console.log(chalk.blue('ℹ ') + (options.draft ? '模式: 草稿' : '模式: 正式发布'));
    
    // 读取配置
    const config = readConfig(process.cwd(), true);
    
    console.log(chalk.blue('ℹ ') + `作品: ${config.name}`);
    console.log(chalk.blue('ℹ ') + `版本: ${config.version}`);
    
    // 确认发布
    if (!options.draft) {
      const { confirm } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: '确认发布?',
          default: false
        }
      ]);
      
      if (!confirm) {
        console.log(chalk.yellow('⚠ ') + '操作已取消');
        return;
      }
    }
    
    // 获取更新说明
    let changeMessage = options.message;
    if (!changeMessage && !options.draft) {
      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'message',
          message: '更新说明:',
          validate: (input: string) => input ? true : '更新说明不能为空'
        }
      ]);
      changeMessage = answers.message;
    }
    
    // 打包文件
    const spinner = ora('正在打包文件...').start();
    
    try {
      const buildDir = config.publishPath || config.local?.buildDir || 'dist';
      const buildPath = path.resolve(process.cwd(), buildDir);
      
      if (!fs.existsSync(buildPath)) {
        throw new Error(`构建目录不存在: ${buildPath}`);
      }
      
      const zip = new AdmZip();
      const files = fs.readdirSync(buildPath);
      
      files.forEach(file => {
        const filePath = path.join(buildPath, file);
        const stats = fs.statSync(filePath);
        
        if (stats.isDirectory()) {
          zip.addLocalFolder(filePath, file);
        } else {
          zip.addLocalFile(filePath);
        }
      });
      
      const tempDir = path.join(require('os').homedir(), '.freelog-cli', 'temp');
      fs.ensureDirSync(tempDir);
      
      const zipFileName = `${config.name || 'resource'}.zip`;
      const zipFilePath = path.join(tempDir, zipFileName);
      zip.writeZip(zipFilePath);
      
      spinner.succeed('文件打包完成');
      
      // 上传文件
      const uploadSpinner = ora('正在上传文件...').start();
      
      try {
        const formData = new FormData();
        const fileStream = fs.createReadStream(zipFilePath);
        formData.append('file', fileStream);
        
        const uploadResponse = await apiClient.post('/v2/storages/files/upload', formData, {
          headers: formData.getHeaders(),
          maxContentLength: Infinity,
          maxBodyLength: Infinity
        });
        
        const fileSha1 = uploadResponse.data.data.sha1;
        
        uploadSpinner.succeed('文件上传完成');
        
        // 发布
        const publishSpinner = ora(options.draft ? '正在保存草稿...' : '正在发布作品...').start();
        
        try {
          const publishData: any = {
            version: config.version,
            resourceType: config.resourceType,
            baseUpcastResources: config.dependencies || [],
            fileSha1
          };
          
          if (!options.draft) {
            publishData.description = changeMessage;
          }
          
          const apiUrl = options.draft 
            ? `/v2/resources/${config.workId}/versions/drafts`
            : `/v2/resources/${config.workId}/versions`;
          
          const publishResponse = await apiClient.post(apiUrl, publishData);
          
          publishSpinner.succeed(options.draft ? '草稿保存成功!' : '作品发布成功!');
          
          console.log(chalk.green('\n✔ ') + `版本: ${config.version}`);
          console.log(chalk.green('✔ ') + `资源ID: ${config.workId}`);
          if (!options.draft) {
            console.log(chalk.blue('ℹ ') + `更新说明: ${changeMessage}\n`);
          }
          
          // 清理临时文件
          await fs.remove(zipFilePath);
          
        } catch (err: any) {
          publishSpinner.fail('发布失败');
          throw err;
        }
        
      } catch (err: any) {
        uploadSpinner.fail('上传失败');
        throw err;
      }
      
    } catch (err: any) {
      spinner.fail('打包失败');
      throw err;
    }
    
  } catch (err: any) {
    console.log(chalk.red('✖ ') + `发布失败: ${err.message}`);
    process.exit(1);
  }
}


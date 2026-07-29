import crypto from 'crypto';
import fs from 'fs-extra';
import { CRYPTO_KEY, CRYPTO_IV } from '../core/constants';

const algorithm = 'aes-256-cbc';
const key = Buffer.from(CRYPTO_KEY.padEnd(32, '0').slice(0, 32));
const iv = Buffer.from(CRYPTO_IV.padEnd(16, '0').slice(0, 16));

/**
 * 加密文本（AES-256-CBC）
 */
export function encrypt(text: string): string {
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return encrypted;
}

/**
 * 解密文本（AES-256-CBC）
 */
export function decrypt(encrypted: string): string {
  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/**
 * 计算文件 SHA1 哈希值（Node.js 环境）
 * 
 * 注意：此实现与浏览器端的 crypto.subtle.digest('SHA-1', ...) 算法一致，
 * 都是标准的 SHA-1 算法，只是运行环境不同。
 * 
 * @param filePath 文件路径
 * @returns SHA1 哈希值（十六进制字符串）
 */
export function calculateFileSha1(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha1');
    const stream = fs.createReadStream(filePath);
    
    stream.on('data', (data) => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

/**
 * 计算 Buffer 数据的 SHA1 哈希值
 * 
 * @param buffer Buffer 数据
 * @returns SHA1 哈希值（十六进制字符串）
 */
export function calculateBufferSha1(buffer: Buffer): string {
  return crypto.createHash('sha1').update(buffer).digest('hex');
}


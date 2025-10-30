/**
 * 加密解密工具
 * 使用 crypto 模块进行 Token 加密和解密
 */

const crypto = require('crypto');

// 加密密钥和算法
const ALGORITHM = 'aes-256-cbc';
const SECRET_KEY = 'freelog-cli-secret-key-2024-v1.0'; // 32字节
const IV_LENGTH = 16;

/**
 * 加密文本
 * @param {string} text - 要加密的文本
 * @returns {string} 加密后的文本（格式：iv:encryptedData）
 */
function encrypt(text) {
  try {
    // 生成随机 IV
    const iv = crypto.randomBytes(IV_LENGTH);
    
    // 创建密钥（确保32字节）
    const key = crypto.createHash('sha256').update(SECRET_KEY).digest();
    
    // 创建加密器
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    // 加密数据
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // 返回 iv:encryptedData 格式
    return iv.toString('hex') + ':' + encrypted;
  } catch (error) {
    throw new Error(`加密失败: ${error.message}`);
  }
}

/**
 * 解密文本
 * @param {string} encryptedText - 加密的文本（格式：iv:encryptedData）
 * @returns {string} 解密后的文本
 */
function decrypt(encryptedText) {
  try {
    // 分离 IV 和加密数据
    const parts = encryptedText.split(':');
    if (parts.length !== 2) {
      throw new Error('加密数据格式错误');
    }
    
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    
    // 创建密钥（确保32字节）
    const key = crypto.createHash('sha256').update(SECRET_KEY).digest();
    
    // 创建解密器
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    
    // 解密数据
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    throw new Error(`解密失败: ${error.message}`);
  }
}

/**
 * 加密对象（将对象转为JSON后加密）
 * @param {Object} obj - 要加密的对象
 * @returns {string} 加密后的字符串
 */
function encryptObject(obj) {
  const jsonStr = JSON.stringify(obj);
  return encrypt(jsonStr);
}

/**
 * 解密对象（解密后解析为对象）
 * @param {string} encryptedStr - 加密的字符串
 * @returns {Object} 解密后的对象
 */
function decryptObject(encryptedStr) {
  const decryptedStr = decrypt(encryptedStr);
  return JSON.parse(decryptedStr);
}

/**
 * 生成随机密钥（用于测试）
 * @param {number} length - 密钥长度（字节）
 * @returns {string} 随机密钥（hex格式）
 */
function generateKey(length = 32) {
  return crypto.randomBytes(length).toString('hex');
}

module.exports = {
  encrypt,
  decrypt,
  encryptObject,
  decryptObject,
  generateKey
};


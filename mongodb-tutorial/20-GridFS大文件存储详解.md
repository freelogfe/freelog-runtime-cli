# 第二十章：GridFS 大文件存储详解

## 20.1 GridFS 基础

### 什么是 GridFS？

GridFS 是 MongoDB 用于存储和检索超过 16MB BSON 文档大小限制的文件系统。它将大文件分割成多个块（chunks）存储。

### GridFS 特性

- ✅ **大文件支持**：可以存储超过 16MB 的文件
- ✅ **流式处理**：支持流式上传和下载
- ✅ **元数据存储**：可以存储文件元数据
- ✅ **分块存储**：自动将文件分割成块

### GridFS 结构

```
fs.files 集合：存储文件元数据
{
  _id: ObjectId(...),
  filename: "document.pdf",
  length: 1024000,
  chunkSize: 261120,
  uploadDate: ISODate(...),
  md5: "...",
  metadata: { ... },
  contentType: "application/pdf"
}

fs.chunks 集合：存储文件块
{
  _id: ObjectId(...),
  files_id: ObjectId(...),  // 关联 files 文档
  n: 0,                     // 块序号
  data: BinData(...)        // 块数据
}
```

## 20.2 基本操作

### 上传文件

```javascript
const { MongoClient, GridFSBucket } = require('mongodb');
const fs = require('fs');

async function uploadFile(filePath, filename) {
  const client = new MongoClient(uri);
  await client.connect();
  
  const db = client.db('mydb');
  const bucket = new GridFSBucket(db, { bucketName: 'files' });
  
  // 创建上传流
  const uploadStream = bucket.openUploadStream(filename, {
    metadata: { uploadedBy: 'user123' },
    contentType: 'application/pdf'
  });
  
  // 读取文件并上传
  fs.createReadStream(filePath)
    .pipe(uploadStream)
    .on('error', (error) => {
      console.error('上传失败:', error);
    })
    .on('finish', () => {
      console.log('上传成功，文件ID:', uploadStream.id);
      client.close();
    });
}
```

### 下载文件

```javascript
async function downloadFile(fileId, outputPath) {
  const client = new MongoClient(uri);
  await client.connect();
  
  const db = client.db('mydb');
  const bucket = new GridFSBucket(db, { bucketName: 'files' });
  
  // 创建下载流
  const downloadStream = bucket.openDownloadStream(fileId);
  
  // 写入文件
  downloadStream
    .pipe(fs.createWriteStream(outputPath))
    .on('error', (error) => {
      console.error('下载失败:', error);
    })
    .on('finish', () => {
      console.log('下载成功');
      client.close();
    });
}
```

### 按文件名下载

```javascript
async function downloadFileByName(filename, outputPath) {
  const client = new MongoClient(uri);
  await client.connect();
  
  const db = client.db('mydb');
  const bucket = new GridFSBucket(db, { bucketName: 'files' });
  
  const downloadStream = bucket.openDownloadStreamByName(filename);
  
  downloadStream
    .pipe(fs.createWriteStream(outputPath))
    .on('finish', () => {
      console.log('下载成功');
      client.close();
    });
}
```

## 20.3 文件查询

### 查找文件

```javascript
async function findFiles() {
  const client = new MongoClient(uri);
  await client.connect();
  
  const db = client.db('mydb');
  const bucket = new GridFSBucket(db, { bucketName: 'files' });
  
  // 查找所有文件
  const files = await bucket.find().toArray();
  console.log('文件列表:', files);
  
  // 按条件查找
  const pdfFiles = await bucket.find({
    contentType: 'application/pdf'
  }).toArray();
  
  // 按文件名查找
  const file = await bucket.find({
    filename: 'document.pdf'
  }).toArray();
  
  client.close();
}
```

### 获取文件信息

```javascript
async function getFileInfo(fileId) {
  const client = new MongoClient(uri);
  await client.connect();
  
  const db = client.db('mydb');
  const bucket = new GridFSBucket(db, { bucketName: 'files' });
  
  const files = await bucket.find({ _id: fileId }).toArray();
  
  if (files.length > 0) {
    const file = files[0];
    console.log('文件名:', file.filename);
    console.log('大小:', file.length);
    console.log('上传时间:', file.uploadDate);
    console.log('内容类型:', file.contentType);
    console.log('元数据:', file.metadata);
  }
  
  client.close();
}
```

## 20.4 文件删除

### 删除文件

```javascript
async function deleteFile(fileId) {
  const client = new MongoClient(uri);
  await client.connect();
  
  const db = client.db('mydb');
  const bucket = new GridFSBucket(db, { bucketName: 'files' });
  
  await bucket.delete(fileId);
  console.log('文件已删除');
  
  client.close();
}
```

### 删除文件（按文件名）

```javascript
async function deleteFileByName(filename) {
  const client = new MongoClient(uri);
  await client.connect();
  
  const db = client.db('mydb');
  const bucket = new GridFSBucket(db, { bucketName: 'files' });
  
  // 先查找文件
  const files = await bucket.find({ filename }).toArray();
  
  // 删除所有匹配的文件
  for (const file of files) {
    await bucket.delete(file._id);
  }
  
  client.close();
}
```

## 20.5 流式处理

### 流式上传

```javascript
const { Readable } = require('stream');

async function uploadStream(data, filename) {
  const client = new MongoClient(uri);
  await client.connect();
  
  const db = client.db('mydb');
  const bucket = new GridFSBucket(db, { bucketName: 'files' });
  
  const uploadStream = bucket.openUploadStream(filename);
  
  // 创建可读流
  const readable = new Readable();
  readable.push(data);
  readable.push(null);  // 结束流
  
  readable.pipe(uploadStream);
  
  return new Promise((resolve, reject) => {
    uploadStream.on('finish', () => {
      resolve(uploadStream.id);
      client.close();
    });
    uploadStream.on('error', reject);
  });
}
```

### 流式下载

```javascript
async function downloadStream(fileId) {
  const client = new MongoClient(uri);
  await client.connect();
  
  const db = client.db('mydb');
  const bucket = new GridFSBucket(db, { bucketName: 'files' });
  
  const downloadStream = bucket.openDownloadStream(fileId);
  
  return downloadStream;  // 返回可读流
}

// 使用
const stream = await downloadStream(fileId);
stream.pipe(response);  // 直接流式传输到 HTTP 响应
```

## 20.6 实际应用场景

### 场景 1：文件上传服务

```typescript
import { GridFSBucket } from 'mongodb';
import multer from 'multer';

@Controller('files')
export class FileController {
  @Post('upload')
  async uploadFile(@UploadedFile() file: Express.Multer.File) {
    const bucket = new GridFSBucket(this.db, { bucketName: 'files' });
    const uploadStream = bucket.openUploadStream(file.originalname, {
      metadata: {
        uploadedBy: this.currentUser.id,
        originalName: file.originalname
      },
      contentType: file.mimetype
    });
    
    return new Promise((resolve, reject) => {
      uploadStream.end(file.buffer);
      uploadStream.on('finish', () => {
        resolve({ fileId: uploadStream.id });
      });
      uploadStream.on('error', reject);
    });
  }
}
```

### 场景 2：文件下载服务

```typescript
@Get('download/:fileId')
async downloadFile(@Param('fileId') fileId: string, @Res() res: Response) {
  const bucket = new GridFSBucket(this.db, { bucketName: 'files' });
  
  // 获取文件信息
  const files = await bucket.find({ _id: new ObjectId(fileId) }).toArray();
  if (files.length === 0) {
    throw new NotFoundException('文件不存在');
  }
  
  const file = files[0];
  
  // 设置响应头
  res.setHeader('Content-Type', file.contentType || 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
  res.setHeader('Content-Length', file.length);
  
  // 流式下载
  const downloadStream = bucket.openDownloadStream(new ObjectId(fileId));
  downloadStream.pipe(res);
}
```

### 场景 3：图片存储

```typescript
// 存储用户头像
async function uploadAvatar(userId: string, imageBuffer: Buffer) {
  const bucket = new GridFSBucket(this.db, { bucketName: 'avatars' });
  
  const uploadStream = bucket.openUploadStream(`avatar_${userId}.jpg`, {
    metadata: { userId },
    contentType: 'image/jpeg'
  });
  
  uploadStream.end(imageBuffer);
  
  return new Promise((resolve, reject) => {
    uploadStream.on('finish', () => {
      // 更新用户头像引用
      User.updateOne(
        { _id: userId },
        { $set: { avatarFileId: uploadStream.id } }
      );
      resolve(uploadStream.id);
    });
    uploadStream.on('error', reject);
  });
}
```

### 场景 4：视频存储

```typescript
// 存储视频文件
async function uploadVideo(videoPath: string, metadata: any) {
  const bucket = new GridFSBucket(this.db, { bucketName: 'videos' });
  
  const uploadStream = bucket.openUploadStream(path.basename(videoPath), {
    metadata: {
      ...metadata,
      uploadedAt: new Date()
    },
    contentType: 'video/mp4'
  });
  
  fs.createReadStream(videoPath).pipe(uploadStream);
  
  return new Promise((resolve, reject) => {
    uploadStream.on('finish', () => {
      resolve(uploadStream.id);
    });
    uploadStream.on('error', reject);
  });
}
```

## 20.7 性能优化

### 1. 块大小优化

```javascript
// 默认块大小：255KB
// 可以根据文件类型调整
const bucket = new GridFSBucket(db, {
  bucketName: 'files',
  chunkSizeBytes: 1024 * 1024  // 1MB 块大小（适合大文件）
});
```

### 2. 索引优化

```javascript
// GridFS 自动创建索引，但可以优化
// files 集合索引
db.files.createIndex({ filename: 1, uploadDate: 1 });
db.files.createIndex({ 'metadata.userId': 1 });

// chunks 集合索引（已自动创建）
// { files_id: 1, n: 1 }
```

### 3. 流式处理

```typescript
// ✅ 好：使用流式处理，避免内存溢出
const stream = bucket.openDownloadStream(fileId);
stream.pipe(response);

// ❌ 差：一次性加载到内存
const file = await bucket.find({ _id: fileId }).toArray();
// 然后处理整个文件
```

## 20.8 最佳实践

### 1. 使用合适的桶名

```typescript
// ✅ 好：按文件类型使用不同的桶
const avatarBucket = new GridFSBucket(db, { bucketName: 'avatars' });
const documentBucket = new GridFSBucket(db, { bucketName: 'documents' });
const videoBucket = new GridFSBucket(db, { bucketName: 'videos' });
```

### 2. 存储元数据

```typescript
// ✅ 好：存储有用的元数据
const uploadStream = bucket.openUploadStream(filename, {
  metadata: {
    userId: currentUser.id,
    category: 'document',
    tags: ['important', 'contract'],
    uploadedAt: new Date()
  }
});
```

### 3. 文件验证

```typescript
// ✅ 好：验证文件类型和大小
function validateFile(file: Express.Multer.File) {
  const maxSize = 100 * 1024 * 1024; // 100MB
  const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
  
  if (file.size > maxSize) {
    throw new Error('文件太大');
  }
  
  if (!allowedTypes.includes(file.mimetype)) {
    throw new Error('不支持的文件类型');
  }
}
```

### 4. 清理孤立块

```typescript
// 清理没有对应 files 文档的 chunks
async function cleanupOrphanedChunks() {
  const files = await db.collection('files.files').find({}).toArray();
  const fileIds = files.map(f => f._id);
  
  await db.collection('files.chunks').deleteMany({
    files_id: { $nin: fileIds }
  });
}
```

查看 `examples/20-gridfs.js` 了解完整的 GridFS 示例。


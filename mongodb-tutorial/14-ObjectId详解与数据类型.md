# 第十四章：ObjectId 详解与数据类型

## 14.1 ObjectId 基础

### 什么是 ObjectId？

ObjectId 是 MongoDB 文档的默认主键（`_id`），是一个 12 字节的 BSON 类型，由以下部分组成：

```
[时间戳(4字节)][机器标识(3字节)][进程ID(2字节)][计数器(3字节)]
```

### ObjectId 结构

ObjectId 是 12 字节，用 24 个十六进制字符表示：

```
507f1f77 bcf86c  d799 439011
└───┬───┘└──┬──┘└─┬─┘└──┬──┘
    │       │     │     └─ 计数器（3字节，随机数）
    │       │     └─────── 进程ID（2字节）
    │       └───────────── 机器标识（3字节）
    └───────────────────── 时间戳（4字节，Unix时间戳）
```

**详细说明**：
- **时间戳**（4字节）：`507f1f77` = 8 个十六进制字符
- **机器标识**（3字节）：`bcf86c` = 6 个十六进制字符
- **进程ID**（2字节）：`d799` = 4 个十六进制字符
- **计数器**（3字节）：`439011` = 6 个十六进制字符

**总计**：8 + 6 + 4 + 6 = 24 个十六进制字符 = 12 字节

### ObjectId 特性

- ✅ **唯一性**：在集合内保证唯一
- ✅ **时间信息**：包含创建时间戳
- ✅ **可排序**：按创建时间排序
- ✅ **分布式友好**：无需中央协调即可生成唯一ID

## 14.2 ObjectId 生成

### MongoDB Shell 中生成

```javascript
// 自动生成（插入文档时）
db.users.insertOne({ name: "张三" })
// 结果：{ _id: ObjectId("507f1f77bcf86cd799439011"), name: "张三" }

// 手动生成
const id = ObjectId()
// 或
const id = new ObjectId()

// 从字符串创建
const id = ObjectId("507f1f77bcf86cd799439011")

// 从时间戳创建
const id = ObjectId.createFromTime(Date.now() / 1000)
```

### Node.js 中生成

```javascript
const { ObjectId } = require('mongodb');

// 生成新的 ObjectId
const id = new ObjectId();

// 从字符串创建
const id = new ObjectId("507f1f77bcf86cd799439011");

// 从时间戳创建
const timestamp = Math.floor(Date.now() / 1000);
const id = ObjectId.createFromTime(timestamp);

// 检查是否有效
ObjectId.isValid("507f1f77bcf86cd799439011"); // true
ObjectId.isValid("invalid"); // false
```

### TypeScript/Mongoose 中生成

```typescript
import mongoose from 'mongoose';

// 自动生成（定义模型时）
const userSchema = new mongoose.Schema({
  _id: { type: mongoose.Schema.Types.ObjectId, auto: true },
  name: String
});

// 手动生成
const id = new mongoose.Types.ObjectId();

// 从字符串创建
const id = new mongoose.Types.ObjectId("507f1f77bcf86cd799439011");

// 检查有效性
mongoose.Types.ObjectId.isValid("507f1f77bcf86cd799439011"); // true
```

## 14.3 ObjectId 操作

### 提取时间戳

```javascript
// MongoDB Shell
const id = ObjectId("507f1f77bcf86cd799439011");
const timestamp = id.getTimestamp();
// ISODate("2012-10-17T20:46:17Z")

// Node.js
const { ObjectId } = require('mongodb');
const id = new ObjectId("507f1f77bcf86cd799439011");
const timestamp = id.getTimestamp();
// Date 对象

// 转换为 Unix 时间戳（秒）
const unixTimestamp = Math.floor(id.getTimestamp().getTime() / 1000);
```

### 比较 ObjectId

```javascript
const id1 = ObjectId("507f1f77bcf86cd799439011");
const id2 = ObjectId("507f1f77bcf86cd799439012");

// 比较（按时间戳）
id1 < id2  // true（id1 创建时间更早）

// 相等比较
id1.equals(id2)  // false

// 转换为字符串比较
id1.toString() === id2.toString()  // false
```

### ObjectId 查询

```javascript
// 精确匹配
db.users.find({ _id: ObjectId("507f1f77bcf86cd799439011") })

// 范围查询（基于时间戳）
const startId = ObjectId.createFromTime(Math.floor(startDate.getTime() / 1000));
const endId = ObjectId.createFromTime(Math.floor(endDate.getTime() / 1000));
db.users.find({
  _id: { $gte: startId, $lte: endId }
})

// 转换为字符串查询
db.users.find({ _id: { $regex: /^507f1f77/ } })
```

## 14.4 自定义 _id

### 使用字符串作为 _id

```javascript
// 插入时指定 _id
db.users.insertOne({
  _id: "user123",
  name: "张三"
})

// 使用 UUID
const { v4: uuidv4 } = require('uuid');
db.users.insertOne({
  _id: uuidv4(),
  name: "张三"
})
```

### 使用数字作为 _id

```javascript
// 使用自增数字
db.counters.insertOne({ _id: "userid", seq: 0 });

function getNextSequence(name) {
  const ret = db.counters.findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { returnDocument: "after" }
  );
  return ret.seq;
}

db.users.insertOne({
  _id: getNextSequence("userid"),
  name: "张三"
})
```

### Mongoose 中自定义 _id

```typescript
import mongoose from 'mongoose';

// 禁用自动 _id
const userSchema = new mongoose.Schema({
  _id: false,
  userId: { type: String, required: true, unique: true },
  name: String
});

// 使用自定义字段作为主键
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true }, // 作为主键
  name: String
}, { _id: false });
```

## 14.5 BSON 数据类型详解

### 基本类型

```javascript
{
  // 字符串
  name: "张三",
  
  // 整数（32位）
  age: 25,
  
  // 长整数（64位）
  bigNumber: NumberLong("9223372036854775807"),
  
  // 双精度浮点数
  price: 99.99,
  
  // 高精度小数（Decimal128）
  precisePrice: NumberDecimal("99.99999999999999"),
  
  // 布尔值
  isActive: true,
  
  // 日期
  createdAt: new Date(),
  
  // ObjectId
  userId: ObjectId("507f1f77bcf86cd799439011"),
  
  // null
  deletedAt: null,
  
  // 未定义（不推荐）
  optionalField: undefined
}
```

### 数组类型

```javascript
{
  // 字符串数组
  tags: ["MongoDB", "数据库", "NoSQL"],
  
  // 数字数组
  scores: [95, 87, 92],
  
  // 混合数组（不推荐）
  mixed: ["字符串", 123, true],
  
  // 嵌套数组
  matrix: [[1, 2], [3, 4]],
  
  // 对象数组
  addresses: [
    { type: "home", city: "北京" },
    { type: "work", city: "上海" }
  ]
}
```

### 对象/文档类型

```javascript
{
  // 嵌套对象
  address: {
    city: "北京",
    district: "朝阳区",
    street: "中关村大街"
  },
  
  // 深层嵌套
  company: {
    name: "公司名",
    address: {
      city: "上海",
      building: {
        name: "大厦名",
        floor: 10
      }
    }
  }
}
```

### 特殊类型

```javascript
{
  // 二进制数据
  avatar: BinData(0, "base64encodeddata"),
  
  // UUID
  uuid: UUID("550e8400-e29b-41d4-a716-446655440000"),
  
  // 正则表达式
  pattern: /^[a-z]+$/i,
  
  // JavaScript 代码（不推荐）
  code: Code("function() { return this.age > 18; }"),
  
  // 时间戳
  timestamp: Timestamp(1234567890, 1),
  
  // 符号（已废弃）
  symbol: Symbol("symbol")
}
```

## 14.6 数据类型转换

### 字符串转换

```javascript
// 转换为字符串
db.users.find({}, { name: { $toString: "$age" } })

// 使用 $convert
db.users.aggregate([
  {
    $project: {
      ageString: {
        $convert: {
          input: "$age",
          to: "string",
          onError: "转换失败",
          onNull: "空值"
        }
      }
    }
  }
])
```

### 数字转换

```javascript
// 字符串转数字
db.users.aggregate([
  {
    $project: {
      ageNumber: {
        $toInt: "$ageString"
      }
    }
  }
])

// 使用 $convert
db.users.aggregate([
  {
    $project: {
      ageNumber: {
        $convert: {
          input: "$ageString",
          to: "int",
          onError: 0,
          onNull: 0
        }
      }
    }
  }
])
```

### 日期转换

```javascript
// 字符串转日期
db.users.aggregate([
  {
    $project: {
      createdAt: {
        $dateFromString: {
          dateString: "$dateString",
          format: "%Y-%m-%d",
          onError: new Date(),
          onNull: new Date()
        }
      }
    }
  }
])

// 日期转字符串
db.users.aggregate([
  {
    $project: {
      dateString: {
        $dateToString: {
          date: "$createdAt",
          format: "%Y-%m-%d %H:%M:%S"
        }
      }
    }
  }
])
```

### 类型检查

```javascript
// 检查字段类型
db.users.aggregate([
  {
    $project: {
      ageType: { $type: "$age" },
      nameType: { $type: "$name" }
    }
  }
])

// 类型匹配查询
db.users.find({ age: { $type: "int" } })
db.users.find({ age: { $type: ["int", "long"] } })  // 多种类型
```

## 14.7 日期时间处理

### Date 对象

```javascript
// 创建日期
const now = new Date();
const specificDate = new Date("2024-01-01");
const timestamp = new Date(1704067200000);  // Unix 时间戳（毫秒）
const isoDate = new Date("2024-01-01T00:00:00Z");

// ISODate（MongoDB Shell）
const isoDate = ISODate("2024-01-01T00:00:00Z");
```

### 日期查询

```javascript
// 范围查询
db.users.find({
  createdAt: {
    $gte: new Date("2024-01-01"),
    $lt: new Date("2024-12-31")
  }
})

// 今天的数据
const today = new Date();
today.setHours(0, 0, 0, 0);
const tomorrow = new Date(today);
tomorrow.setDate(tomorrow.getDate() + 1);

db.users.find({
  createdAt: {
    $gte: today,
    $lt: tomorrow
  }
})
```

### 日期聚合操作

```javascript
// 提取日期部分
db.users.aggregate([
  {
    $project: {
      year: { $year: "$createdAt" },
      month: { $month: "$createdAt" },
      day: { $dayOfMonth: "$createdAt" },
      hour: { $hour: "$createdAt" },
      minute: { $minute: "$createdAt" },
      second: { $second: "$createdAt" },
      dayOfWeek: { $dayOfWeek: "$createdAt" },
      dayOfYear: { $dayOfYear: "$createdAt" },
      week: { $week: "$createdAt" }
    }
  }
])

// 日期运算
db.users.aggregate([
  {
    $project: {
      daysSinceCreated: {
        $divide: [
          { $subtract: [new Date(), "$createdAt"] },
          1000 * 60 * 60 * 24  // 毫秒转天数
        ]
      }
    }
  }
])
```

### 时区处理

```javascript
// 使用 $dateToString 处理时区
db.users.aggregate([
  {
    $project: {
      beijingTime: {
        $dateToString: {
          date: "$createdAt",
          format: "%Y-%m-%d %H:%M:%S",
          timezone: "Asia/Shanghai"
        }
      }
    }
  }
])
```

## 14.8 实际应用场景

### 场景 1：基于 ObjectId 的时间范围查询

```typescript
// 查询最近 24 小时创建的文档
function findRecentDocuments(collection: Collection, hours: number = 24) {
  const cutoffTime = Math.floor((Date.now() - hours * 60 * 60 * 1000) / 1000);
  const cutoffId = ObjectId.createFromTime(cutoffTime);
  
  return collection.find({
    _id: { $gte: cutoffId }
  }).toArray();
}
```

### 场景 2：ObjectId 排序

```javascript
// 按创建时间排序（ObjectId 包含时间戳）
db.users.find().sort({ _id: 1 })  // 按创建时间升序
db.users.find().sort({ _id: -1 }) // 按创建时间降序
```

### 场景 3：类型安全的 ObjectId 处理

```typescript
// TypeScript 类型定义
type UserId = string & { readonly __brand: unique symbol };
type PostId = string & { readonly __brand: unique symbol };

function createUserId(id: string): UserId {
  if (!ObjectId.isValid(id)) {
    throw new Error('Invalid ObjectId');
  }
  return id as UserId;
}

function findUser(id: UserId) {
  return db.users.findOne({ _id: id });
}

// 使用
const userId = createUserId("507f1f77bcf86cd799439011");
const user = await findUser(userId);
```

### 场景 4：数据类型验证

```typescript
// Mongoose 模式验证
const userSchema = new mongoose.Schema({
  age: {
    type: Number,
    validate: {
      validator: (v: number) => v >= 0 && v <= 150,
      message: '年龄必须在 0-150 之间'
    }
  },
  email: {
    type: String,
    validate: {
      validator: (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
      message: '邮箱格式不正确'
    }
  }
});
```

## 14.9 常见问题和注意事项

### 问题 1：ObjectId vs 字符串

```javascript
// ❌ 错误：字符串比较
db.users.find({ _id: "507f1f77bcf86cd799439011" })  // 不会匹配

// ✅ 正确：ObjectId 比较
db.users.find({ _id: ObjectId("507f1f77bcf86cd799439011") })
```

### 问题 2：时区问题

```javascript
// ❌ 注意：Date 对象使用本地时区
const date = new Date("2024-01-01");  // 可能不是 UTC

// ✅ 好：明确指定 UTC
const date = new Date("2024-01-01T00:00:00Z");
```

### 问题 3：类型不一致

```javascript
// ❌ 问题：同一字段类型不一致
{ age: 25 }
{ age: "25" }  // 字符串

// ✅ 好：保持类型一致
{ age: 25 }
{ age: 25 }
```

### 问题 4：大数字精度

```javascript
// ❌ 问题：JavaScript 数字精度限制
{ bigNumber: 9007199254740992 }  // 超出安全整数范围

// ✅ 好：使用 NumberLong 或 NumberDecimal
{ bigNumber: NumberLong("9007199254740992") }
{ preciseNumber: NumberDecimal("99.99999999999999") }
```

## 14.10 最佳实践

### 1. 使用 ObjectId 作为主键

```typescript
// ✅ 好：使用默认 ObjectId
const userSchema = new mongoose.Schema({
  // _id 自动生成 ObjectId
  name: String
});
```

### 2. 类型一致性

```typescript
// ✅ 好：定义明确的类型
const userSchema = new mongoose.Schema({
  age: { type: Number, required: true },
  email: { type: String, required: true }
});
```

### 3. 日期处理

```typescript
// ✅ 好：统一使用 UTC
const userSchema = new mongoose.Schema({
  createdAt: { type: Date, default: Date.now }  // 自动使用 UTC
});
```

### 4. ObjectId 验证

```typescript
// ✅ 好：验证 ObjectId
function isValidObjectId(id: string): boolean {
  return ObjectId.isValid(id) && String(new ObjectId(id)) === id;
}
```

查看 `examples/14-objectid-types.js` 了解完整的 ObjectId 和数据类型示例。


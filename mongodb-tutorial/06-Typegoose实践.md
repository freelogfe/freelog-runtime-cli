# 第六章：Typegoose/Mongoose 实践

## 6.1 Typegoose 简介

Typegoose 是 TypeScript 的 Mongoose 包装器，提供类型安全的模型定义。

### 为什么使用 Typegoose？

- ✅ 完整的 TypeScript 类型支持
- ✅ 装饰器语法，代码更简洁
- ✅ 与 MidwayJS 框架完美集成
- ✅ 编译时类型检查

## 6.2 模型定义

### 基础模型

```typescript
import { EntityModel } from "@midwayjs/typegoose";
import { Prop, getModelForClass } from "@typegoose/typegoose";

@EntityModel()
export class User {
  @Prop({ required: true, type: () => String })
  public name: string;

  @Prop({ required: true, unique: true, type: () => String })
  public email: string;

  @Prop({ type: () => Number, min: 0, max: 150 })
  public age?: number;

  @Prop({ type: () => Date, default: Date.now })
  public createdAt: Date;

  @Prop({ type: () => Date, default: Date.now })
  public updatedAt: Date;
}
```

### 字段类型

```typescript
@EntityModel()
export class Product {
  // 字符串
  @Prop({ type: () => String, required: true })
  public name: string;

  // 数字
  @Prop({ type: () => Number, required: true })
  public price: number;

  // 布尔值
  @Prop({ type: () => Boolean, default: false })
  public isActive: boolean;

  // 日期
  @Prop({ type: () => Date, default: Date.now })
  public createdAt: Date;

  // 数组
  @Prop({ type: () => [String] })
  public tags: string[];

  // 嵌套对象
  @Prop({ type: () => Object })
  public metadata: {
    description?: string;
    category?: string;
  };

  // 混合类型（any）
  @Prop({ required: true })
  public data: any;
}
```

### 字段选项

```typescript
@EntityModel()
export class User {
  // 必填字段
  @Prop({ required: true })
  public name: string;

  // 唯一索引
  @Prop({ unique: true })
  public email: string;

  // 默认值
  @Prop({ default: "user" })
  public role: string;

  // 枚举值
  @Prop({ enum: ["active", "inactive", "pending"] })
  public status: string;

  // 最小值/最大值
  @Prop({ min: 0, max: 100 })
  public score: number;

  // 自定义验证
  @Prop({
    validate: {
      validator: (v: string) => v.length >= 6,
      message: "密码长度至少 6 位"
    }
  })
  public password: string;

  // 索引
  @Prop({ index: true })
  public username: string;

  // 稀疏索引
  @Prop({ sparse: true })
  public phone?: string;
}
```

## 6.3 嵌套文档和引用

### 嵌套文档

```typescript
class Address {
  @Prop({ type: () => String })
  public city: string;

  @Prop({ type: () => String })
  public district: string;

  @Prop({ type: () => String })
  public street: string;
}

@EntityModel()
export class User {
  @Prop({ type: () => String })
  public name: string;

  @Prop({ type: () => Address })
  public address: Address;
}
```

### 引用其他模型

```typescript
import { Ref } from "@typegoose/typegoose";

@EntityModel()
export class Post {
  @Prop({ required: true })
  public title: string;

  @Prop({ ref: () => User, required: true })
  public author: Ref<User>;

  @Prop({ ref: () => User })
  public likes: Ref<User>[];
}

// 使用时填充引用
const post = await PostModel.findById(postId).populate('author');
```

## 6.4 在 Service 中使用

### 注入模型

```typescript
import { Provide, Inject } from "@midwayjs/decorator";
import { InjectEntityModel } from "@midwayjs/typegoose";
import { ReturnModelType } from "@typegoose/typegoose";
import { User } from "../model/user";

@Provide()
export class UserService {
  @InjectEntityModel(User)
  userModel: ReturnModelType<typeof User>;

  // 创建用户
  async createUser(userData: Partial<User>) {
    return await this.userModel.create(userData);
  }

  // 查找用户
  async findUserById(id: string) {
    return await this.userModel.findById(id);
  }

  // 查找多个用户
  async findUsers(condition: any) {
    return await this.userModel.find(condition);
  }

  // 更新用户
  async updateUser(id: string, updateData: Partial<User>) {
    return await this.userModel.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true }
    );
  }

  // 删除用户
  async deleteUser(id: string) {
    return await this.userModel.findByIdAndDelete(id);
  }
}
```

## 6.5 CRUD 操作示例

### Create - 创建

```typescript
// 创建单个文档
async createUser(userData: Partial<User>) {
  const user = new this.userModel(userData);
  return await user.save();
}

// 或使用 create
async createUser(userData: Partial<User>) {
  return await this.userModel.create(userData);
}

// 创建多个文档
async createUsers(usersData: Partial<User>[]) {
  return await this.userModel.insertMany(usersData);
}
```

### Read - 读取

```typescript
// 查找所有
async findAllUsers() {
  return await this.userModel.find();
}

// 根据 ID 查找
async findUserById(id: string) {
  return await this.userModel.findById(id);
}

// 条件查询
async findUsersByAge(minAge: number) {
  return await this.userModel.find({ age: { $gte: minAge } });
}

// 查找单个
async findUserByEmail(email: string) {
  return await this.userModel.findOne({ email });
}

// 分页查询
async findUsersPaginated(page: number, limit: number) {
  const skip = (page - 1) * limit;
  const [users, total] = await Promise.all([
    this.userModel.find().skip(skip).limit(limit),
    this.userModel.countDocuments()
  ]);
  
  return {
    users,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit)
  };
}
```

### Update - 更新

```typescript
// 更新单个文档
async updateUser(id: string, updateData: Partial<User>) {
  return await this.userModel.findByIdAndUpdate(
    id,
    { $set: updateData },
    { new: true, runValidators: true }
  );
}

// 更新多个文档
async updateUsersByStatus(oldStatus: string, newStatus: string) {
  return await this.userModel.updateMany(
    { status: oldStatus },
    { $set: { status: newStatus } }
  );
}

// 使用更新操作符
async incrementUserScore(id: string, points: number) {
  return await this.userModel.findByIdAndUpdate(
    id,
    { $inc: { score: points } },
    { new: true }
  );
}
```

### Delete - 删除

```typescript
// 删除单个文档
async deleteUser(id: string) {
  return await this.userModel.findByIdAndDelete(id);
}

// 删除多个文档
async deleteInactiveUsers() {
  return await this.userModel.deleteMany({ status: "inactive" });
}
```

## 6.6 高级查询

### 复杂查询

```typescript
// 组合条件
async findActiveUsers(minAge: number) {
  return await this.userModel.find({
    $and: [
      { status: "active" },
      { age: { $gte: minAge } }
    ]
  });
}

// 排序和限制
async findTopUsers(limit: number) {
  return await this.userModel
    .find()
    .sort({ score: -1 })
    .limit(limit);
}

// 字段投影
async findUserNames() {
  return await this.userModel.find({}, { name: 1, email: 1, _id: 0 });
}

// 聚合查询
async getUserStatistics() {
  return await this.userModel.aggregate([
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
        avgAge: { $avg: "$age" }
      }
    }
  ]);
}
```

### 实际项目案例

基于您的 `lottery-resource-service.ts`：

```typescript
@Provide()
export class LotteryResourceService {
  @InjectEntityModel(LotteryResource)
  lotteryResourceDao: ReturnModelType<typeof LotteryResource>;

  // 资源随机筛选
  async draw(params: {
    startDate: Date;
    limitDate: Date;
    num: number;
    resourceTagName: string;
  }) {
    // 构建查询条件
    const condition = {
      $and: [
        { resourceCreateDate: { $gte: params.startDate } },
        { resourceCreateDate: { $lte: params.limitDate } },
        { resourceTagName: params.resourceTagName }
      ]
    };

    // 查询已筛选的资源
    const excludeResources = await this.lotteryResourceDao.find(
      condition,
      { resourceId: true }
    );
    const excludeResourceIds = excludeResources.map(r => r.resourceId);

    // ... 其他业务逻辑 ...

    // 批量创建
    return await this.lotteryResourceDao.create(lotteryResources);
  }

  // 分页列表
  async list(
    startDate: Date,
    limitDate: Date,
    skipSize: number,
    pageSize: number,
    resourceTagName: string
  ) {
    const condition = {
      $and: [
        { resourceCreateDate: { $gte: startDate } },
        { resourceCreateDate: { $lte: limitDate } },
        { resourceTagName: resourceTagName }
      ]
    };

    const [lotteryResources, total] = await Promise.all([
      this.lotteryResourceDao
        .find(condition)
        .sort({ resourceCreateDate: 1 })
        .skip(skipSize)
        .limit(pageSize),
      this.lotteryResourceDao.countDocuments(condition)
    ]);

    return {
      num: total,
      lotteryResources
    };
  }

  // 批量更新
  async updateTag(params: { ids: string[]; tag: number }) {
    return await this.lotteryResourceDao.updateMany(
      { _id: { $in: params.ids } },
      { $set: { tag: params.tag } }
    );
  }
}
```

## 6.7 中间件（Hooks）

### 保存前/后钩子

```typescript
import { pre, post } from "@typegoose/typegoose";

@EntityModel()
export class User {
  @Prop({ type: () => String })
  public name: string;

  @Prop({ type: () => String })
  public password: string;

  @Prop({ type: () => Date })
  public updatedAt: Date;

  // 保存前钩子
  @pre<User>("save", function() {
    this.updatedAt = new Date();
  })

  // 保存后钩子
  @post<User>("save", function(doc) {
    console.log("用户已保存:", doc.name);
  })
}
```

### 查询钩子

```typescript
// 查询前钩子
@pre<User>("find", function() {
  this.where({ isDeleted: false });
})

// 查询后钩子
@post<User>("find", function(docs) {
  console.log(`找到 ${docs.length} 个用户`);
})
```

## 6.8 虚拟字段和方法

### 虚拟字段

```typescript
import { getModelForClass, prop, modelOptions } from "@typegoose/typegoose";

@modelOptions({ schemaOptions: { toJSON: { virtuals: true } } })
@EntityModel()
export class User {
  @Prop({ type: () => String })
  public firstName: string;

  @Prop({ type: () => String })
  public lastName: string;

  // 虚拟字段
  public get fullName() {
    return `${this.firstName} ${this.lastName}`;
  }
}
```

### 实例方法

```typescript
@EntityModel()
export class User {
  @Prop({ type: () => String })
  public name: string;

  @Prop({ type: () => Number })
  public age: number;

  // 实例方法
  public isAdult() {
    return this.age >= 18;
  }

  public getAgeGroup() {
    if (this.age < 18) return "minor";
    if (this.age < 65) return "adult";
    return "senior";
  }
}

// 使用
const user = await userModel.findById(id);
if (user.isAdult()) {
  console.log("成年人");
}
```

### 静态方法

```typescript
import { staticMethod } from "@typegoose/typegoose";

@EntityModel()
export class User {
  @Prop({ type: () => String })
  public name: string;

  @Prop({ type: () => Number })
  public age: number;

  // 静态方法
  @staticMethod
  static async findByAgeRange(min: number, max: number) {
    return this.find({ age: { $gte: min, $lte: max } });
  }
}

// 使用
const users = await UserModel.findByAgeRange(18, 65);
```

## 6.9 错误处理

```typescript
async createUser(userData: Partial<User>) {
  try {
    return await this.userModel.create(userData);
  } catch (error) {
    if (error.code === 11000) {
      // 唯一索引冲突
      throw new Error("邮箱已存在");
    }
    if (error.name === "ValidationError") {
      // 验证错误
      const messages = Object.values(error.errors).map((e: any) => e.message);
      throw new Error(messages.join(", "));
    }
    throw error;
  }
}
```

## 6.10 最佳实践

1. **使用类型定义**：充分利用 TypeScript 的类型系统
2. **合理使用索引**：为常用查询字段创建索引
3. **字段验证**：在模型层面进行数据验证
4. **错误处理**：妥善处理数据库错误
5. **使用事务**：需要原子性操作时使用事务
6. **避免 N+1 查询**：使用 populate 或聚合管道
7. **使用 lean()**：只读查询使用 lean() 提高性能

查看 `examples/06-typegoose-practice.ts` 了解完整的 Typegoose 示例。


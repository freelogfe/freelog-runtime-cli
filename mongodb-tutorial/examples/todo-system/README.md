# Todo 管理系统 - MongoDB 示例

这是一个完整的 Todo 管理系统示例，展示了如何使用 MongoDB 构建一个功能完整的待办事项应用。

## 📁 文件结构

```
todo-system/
├── todo.model.ts          # 数据模型定义（Typegoose）
├── todo.service.ts        # 业务逻辑层（Service）
├── todo.controller.ts     # 控制器层（Controller）
├── init-database.js       # 数据库初始化脚本
├── example-usage.js       # 使用示例
└── README.md             # 本文件
```

## 🚀 快速开始

### 1. 初始化数据库

首先运行初始化脚本创建示例数据和索引：

```bash
node docs/mongodb-tutorial/examples/todo-system/init-database.js
```

这将：
- ✅ 创建必要的索引
- ✅ 插入示例数据（2个用户，多个 Todo 项和列表）
- ✅ 验证数据完整性
- ✅ 显示统计信息

### 2. 运行使用示例

查看各种 MongoDB 操作的示例：

```bash
node docs/mongodb-tutorial/examples/todo-system/example-usage.js
```

## 📊 数据模型

### Todo 模型

```typescript
{
  title: string;           // 标题（必填）
  description?: string;      // 描述
  completed: boolean;       // 是否完成（默认 false）
  priority: string;         // 优先级：low/medium/high（默认 medium）
  tags: string[];          // 标签数组
  userId?: string;          // 用户 ID
  dueDate?: Date;           // 到期日期
  createdAt: Date;         // 创建时间
  updatedAt: Date;         // 更新时间
  isDeleted: boolean;       // 软删除标记（默认 false）
  deletedAt?: Date;        // 删除时间
}
```

### TodoList 模型

```typescript
{
  name: string;            // 列表名称（必填）
  description?: string;     // 描述
  userId?: string;         // 用户 ID
  category: string;        // 分类：personal/work/shopping/other
  color: string;          // 颜色代码（默认 #3498db）
  createdAt: Date;        // 创建时间
  updatedAt: Date;        // 更新时间
}
```

## 🔍 功能特性

### Todo 功能

- ✅ 创建、查询、更新、删除 Todo
- ✅ 切换完成状态
- ✅ 标签管理（添加/删除）
- ✅ 软删除和恢复
- ✅ 按用户、状态、优先级、标签筛选
- ✅ 搜索功能（标题、描述、标签）
- ✅ 查找即将到期的 Todo
- ✅ 统计信息（完成率、优先级分布等）

### TodoList 功能

- ✅ 创建、查询、更新、删除列表
- ✅ 按用户查询列表
- ✅ 按分类筛选

## 📝 API 接口示例

### Todo 接口

```bash
# 创建 Todo
POST /api/todos
Body: {
  "title": "完成项目报告",
  "description": "编写项目进度报告",
  "priority": "high",
  "tags": ["工作", "重要"],
  "userId": "user001",
  "dueDate": "2024-12-31"
}

# 获取用户的 Todos
GET /api/todos?userId=user001&completed=false&priority=high

# 更新 Todo
PUT /api/todos/:id
Body: {
  "completed": true,
  "priority": "medium"
}

# 切换完成状态
PUT /api/todos/:id/toggle

# 添加标签
PUT /api/todos/:id/tags
Body: { "tag": "紧急" }

# 删除标签
DEL /api/todos/:id/tags/:tag

# 获取统计信息
GET /api/todos/statistics/user001

# 查找即将到期的 Todos
GET /api/todos/upcoming/user001?days=7

# 搜索 Todos
GET /api/todos/search/user001?keyword=MongoDB
```

### TodoList 接口

```bash
# 创建列表
POST /api/todo-lists
Body: {
  "name": "工作待办",
  "description": "工作中的重要任务",
  "userId": "user001",
  "category": "work",
  "color": "#e74c3c"
}

# 获取用户的所有列表
GET /api/todo-lists?userId=user001

# 更新列表
PUT /api/todo-lists/:id
Body: {
  "name": "工作待办（更新）",
  "color": "#c0392b"
}

# 删除列表
DEL /api/todo-lists/:id
```

## 🗄️ 数据库索引

系统自动创建以下索引以提高查询性能：

### Todos 集合索引

- `{ userId: 1, createdAt: -1 }` - 用户 Todos 按时间排序
- `{ userId: 1, completed: 1 }` - 用户按完成状态查询
- `{ userId: 1, priority: 1 }` - 用户按优先级查询
- `{ userId: 1, tags: 1 }` - 用户按标签查询
- `{ userId: 1, dueDate: 1 }` - 用户按到期日期查询
- `{ userId: 1, isDeleted: 1 }` - 用户软删除查询
- `{ title: 'text', description: 'text' }` - 全文搜索

### TodoLists 集合索引

- `{ userId: 1, createdAt: -1 }` - 用户列表按时间排序
- `{ userId: 1, category: 1 }` - 用户按分类查询

## 💡 使用示例

### 在 TypeScript 项目中使用

```typescript
import { TodoService } from './todo.service';
import { Inject } from '@midwayjs/decorator';

@Provide()
export class MyService {
  @Inject()
  todoService: TodoService;

  async createMyTodo() {
    const todo = await this.todoService.createTodo({
      title: '学习 MongoDB',
      description: '完成 MongoDB 教程',
      priority: 'high',
      tags: ['学习'],
      userId: 'user001',
      dueDate: new Date('2024-12-31')
    });
    return todo;
  }

  async getMyTodos() {
    const todos = await this.todoService.findTodosByUser('user001', {
      completed: false,
      priority: 'high'
    });
    return todos;
  }
}
```

### 使用原生 MongoDB 驱动

参考 `example-usage.js` 文件中的示例代码。

## 📈 查询示例

### 1. 查找用户的待办事项

```javascript
const todos = await todosCollection.find({
  userId: 'user001',
  completed: false,
  isDeleted: false
}).sort({ priority: -1, createdAt: -1 }).toArray();
```

### 2. 统计信息（聚合管道）

```javascript
const stats = await todosCollection.aggregate([
  {
    $match: {
      userId: 'user001',
      isDeleted: false
    }
  },
  {
    $group: {
      _id: null,
      total: { $sum: 1 },
      completed: {
        $sum: { $cond: [{ $eq: ['$completed', true] }, 1, 0] }
      },
      pending: {
        $sum: { $cond: [{ $eq: ['$completed', false] }, 1, 0] }
      }
    }
  }
]).toArray();
```

### 3. 查找即将到期的 Todo

```javascript
const today = new Date();
const sevenDaysLater = new Date();
sevenDaysLater.setDate(today.getDate() + 7);

const upcomingTodos = await todosCollection.find({
  userId: 'user001',
  isDeleted: false,
  completed: false,
  dueDate: {
    $gte: today,
    $lte: sevenDaysLater
  }
}).sort({ dueDate: 1 }).toArray();
```

### 4. 文本搜索

```javascript
const results = await todosCollection.find({
  userId: 'user001',
  isDeleted: false,
  $text: { $search: 'MongoDB' }
}).toArray();
```

## 🔧 自定义和扩展

### 添加新字段

在 `todo.model.ts` 中添加新字段：

```typescript
@Prop({ type: () => String })
public assignee?: string;  // 分配给谁

@Prop({ type: () => Number })
public estimatedHours?: number;  // 预计小时数
```

### 添加新功能

在 `todo.service.ts` 中添加新方法：

```typescript
async findTodosByAssignee(userId: string, assignee: string) {
  return await this.todoModel.find({
    userId,
    assignee,
    isDeleted: false
  }).lean();
}
```

## 📚 相关文档

- [MongoDB 基础入门](../../01-基础入门.md)
- [查询操作详解](../../02-查询操作.md)
- [聚合管道](../../04-聚合管道.md)
- [Typegoose 实践](../../06-Typegoose实践.md)
- [最佳实践](../../07-最佳实践.md)

## 🎯 学习要点

通过这个示例，您可以学习到：

1. ✅ MongoDB 数据模型设计
2. ✅ Typegoose 模型定义
3. ✅ CRUD 操作
4. ✅ 复杂查询和筛选
5. ✅ 聚合管道统计
6. ✅ 索引优化
7. ✅ 软删除实现
8. ✅ 文本搜索
9. ✅ 批量操作
10. ✅ 实际项目结构

## ⚠️ 注意事项

1. **数据库连接**：确保 MongoDB 服务已启动
2. **数据清理**：初始化脚本会清空现有数据
3. **索引创建**：索引创建可能需要一些时间
4. **文本搜索**：需要创建文本索引才能使用 `$text` 查询

## 🚀 下一步

1. 运行初始化脚本创建数据
2. 查看示例代码了解各种操作
3. 尝试修改和扩展功能
4. 集成到您的项目中

祝学习愉快！🎉


# 前端页面使用指南

## ✅ 前端页面已创建完成！

已创建一个功能完整的 Todo 管理前端页面，支持所有 CRUD 操作。

## 📁 文件位置

前端文件位于 `public/` 目录：

```
public/
├── index.html    # 主页面
├── style.css     # 样式文件
└── app.js        # JavaScript 逻辑
```

## 🚀 快速开始

### 1. 启动后端服务

```bash
cd docs/mongodb-tutorial/examples/todo-nestjs-prisma
npm run start:dev
```

### 2. 访问前端页面

在浏览器中打开：
```
http://localhost:3000
```

**注意**：静态文件服务已配置在 `main.ts` 中，无需额外安装依赖。

## ✨ 功能特性

### 📋 Todo 列表
- ✅ 显示所有 Todo 项
- ✅ 实时统计信息（总数、已完成、待完成、完成率）
- ✅ 筛选功能（全部/待完成/已完成）
- ✅ 按优先级筛选
- ✅ 搜索功能

### ➕ 创建 Todo
- ✅ 标题（必填）
- ✅ 描述（可选）
- ✅ 优先级选择（低/中/高）
- ✅ 到期日期选择
- ✅ 标签输入（用逗号分隔）

### ✏️ 编辑 Todo
- ✅ 修改所有字段
- ✅ 切换完成状态
- ✅ 更新标签

### 🗑️ 删除 Todo
- ✅ 软删除（可恢复）
- ✅ 确认对话框

### 📊 统计信息
- ✅ 实时显示总数、已完成、待完成
- ✅ 自动计算完成率

## 🎨 界面特点

- 🎨 现代化渐变背景设计
- 📱 响应式布局（支持移动端、平板、桌面）
- ⚡ 实时数据更新
- 🎯 友好的用户交互
- 🏷️ 优先级颜色标识
- 📅 日期格式化显示

## 🔧 配置说明

### API 地址配置

如果后端运行在不同端口，编辑 `public/app.js`：

```javascript
const API_BASE_URL = 'http://localhost:3000/api';
```

### 默认用户 ID

编辑 `public/index.html`：

```html
<input type="text" id="userId" value="user001" placeholder="输入用户 ID">
```

## 📱 响应式设计

页面完全响应式，支持：
- 📱 移动端（< 768px）
- 📱 平板端（768px）
- 💻 桌面端（> 768px）

## 🎯 使用流程

1. **输入用户 ID**：在页面顶部输入用户 ID（默认 user001）
2. **点击"加载 Todos"**：加载该用户的所有 Todos
3. **创建 Todo**：填写表单并点击"创建 Todo"
4. **编辑 Todo**：点击"编辑"按钮修改 Todo
5. **切换状态**：点击"标记完成/未完成"切换状态
6. **删除 Todo**：点击"删除"按钮删除 Todo
7. **筛选和搜索**：使用筛选按钮和搜索框查找 Todos

## 🐛 故障排除

### 1. 页面无法加载

**问题**：打开 `http://localhost:3000` 显示 404

**解决方案**：
- 确认后端服务已启动
- 检查端口是否正确（默认 3000）
- 检查 `public/` 目录是否存在

### 2. API 请求失败

**问题**：页面显示"加载失败"

**解决方案**：
- 确认后端 API 正常运行
- 检查浏览器控制台的错误信息
- 确认 CORS 已启用
- 检查 API_BASE_URL 配置

### 3. 样式显示异常

**问题**：页面样式错乱

**解决方案**：
- 清除浏览器缓存
- 检查 CSS 文件是否正确加载
- 检查浏览器控制台是否有错误

## 📝 API 端点使用

前端页面使用以下 API：

- `GET /api/todos?userId=xxx` - 获取 Todos
- `POST /api/todos` - 创建 Todo
- `PATCH /api/todos/:id` - 更新 Todo
- `PATCH /api/todos/:id/toggle` - 切换完成状态
- `DELETE /api/todos/:id` - 删除 Todo
- `GET /api/todos/statistics/:userId` - 获取统计信息
- `GET /api/todos/search/:userId?keyword=xxx` - 搜索 Todos

## 🎉 完成！

现在您可以：
1. 启动后端服务
2. 在浏览器中打开 `http://localhost:3000`
3. 开始使用 Todo 管理系统！

## 📚 更多信息

查看 [FRONTEND.md](./FRONTEND.md) 了解详细的前端开发说明。


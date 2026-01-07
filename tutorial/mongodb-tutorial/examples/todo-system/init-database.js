/**
 * Todo 管理系统数据库初始化脚本
 * 
 * 运行方式：node docs/mongodb-tutorial/examples/todo-system/init-database.js
 * 
 * 功能：
 * 1. 创建示例数据
 * 2. 创建索引
 * 3. 验证数据
 */

const { MongoClient } = require('mongodb');

const uri = 'mongodb://localhost:27017';
const client = new MongoClient(uri);

const DB_NAME = 'todo_management';
const COLLECTIONS = {
  todos: 'todos',
  todolists: 'todolists'
};

async function initDatabase() {
  try {
    await client.connect();
    console.log('✅ MongoDB 连接成功\n');

    const db = client.db(DB_NAME);

    // 1. 创建索引
    console.log('📊 创建索引...');
    await createIndexes(db);
    console.log('✅ 索引创建完成\n');

    // 2. 清空现有数据（可选）
    console.log('🧹 清空现有数据...');
    await db.collection(COLLECTIONS.todos).deleteMany({});
    await db.collection(COLLECTIONS.todolists).deleteMany({});
    console.log('✅ 数据清空完成\n');

    // 3. 创建示例数据
    console.log('📝 创建示例数据...');
    await createSampleData(db);
    console.log('✅ 示例数据创建完成\n');

    // 4. 验证数据
    console.log('🔍 验证数据...');
    await validateData(db);
    console.log('✅ 数据验证完成\n');

    // 5. 显示统计信息
    console.log('📈 数据统计:');
    await showStatistics(db);

  } catch (error) {
    console.error('❌ 错误:', error);
  } finally {
    await client.close();
    console.log('\n👋 连接已关闭');
  }
}

/**
 * 创建索引
 */
async function createIndexes(db) {
  const todosCollection = db.collection(COLLECTIONS.todos);
  const listsCollection = db.collection(COLLECTIONS.todolists);

  // Todos 索引
  await todosCollection.createIndex({ userId: 1, createdAt: -1 });
  await todosCollection.createIndex({ userId: 1, completed: 1 });
  await todosCollection.createIndex({ userId: 1, priority: 1 });
  await todosCollection.createIndex({ userId: 1, tags: 1 });
  await todosCollection.createIndex({ userId: 1, dueDate: 1 });
  await todosCollection.createIndex({ userId: 1, isDeleted: 1 });
  await todosCollection.createIndex({ title: 'text', description: 'text' }); // 文本索引

  // TodoLists 索引
  await listsCollection.createIndex({ userId: 1, createdAt: -1 });
  await listsCollection.createIndex({ userId: 1, category: 1 });

  console.log('  - Todos 集合索引已创建');
  console.log('  - TodoLists 集合索引已创建');
}

/**
 * 创建示例数据
 */
async function createSampleData(db) {
  const todosCollection = db.collection(COLLECTIONS.todos);
  const listsCollection = db.collection(COLLECTIONS.todolists);

  // 创建示例用户 ID
  const userId1 = 'user001';
  const userId2 = 'user002';

  // 创建 Todo 列表
  const lists = [
    {
      name: '工作待办',
      description: '工作中的重要任务',
      userId: userId1,
      category: 'work',
      color: '#e74c3c',
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      name: '个人事务',
      description: '个人生活相关',
      userId: userId1,
      category: 'personal',
      color: '#3498db',
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      name: '购物清单',
      description: '需要购买的物品',
      userId: userId1,
      category: 'shopping',
      color: '#2ecc71',
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      name: '学习计划',
      description: '学习 MongoDB',
      userId: userId2,
      category: 'personal',
      color: '#9b59b6',
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ];

  const listResult = await listsCollection.insertMany(lists);
  console.log(`  - 创建了 ${listResult.insertedCount} 个 Todo 列表`);

  // 创建 Todos
  const todos = [
    // 用户1的待办事项
    {
      title: '完成项目报告',
      description: '编写项目进度报告并提交给经理',
      completed: false,
      priority: 'high',
      tags: ['工作', '重要'],
      userId: userId1,
      dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // 2天后
      createdAt: new Date(),
      updatedAt: new Date(),
      isDeleted: false
    },
    {
      title: '参加团队会议',
      description: '每周例会，讨论项目进展',
      completed: true,
      priority: 'medium',
      tags: ['工作', '会议'],
      userId: userId1,
      dueDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // 昨天
      createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      updatedAt: new Date(),
      isDeleted: false
    },
    {
      title: '学习 MongoDB 聚合管道',
      description: '深入学习 MongoDB 的聚合管道功能',
      completed: false,
      priority: 'high',
      tags: ['学习', 'MongoDB'],
      userId: userId1,
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7天后
      createdAt: new Date(),
      updatedAt: new Date(),
      isDeleted: false
    },
    {
      title: '购买 groceries',
      description: '牛奶、面包、鸡蛋、水果',
      completed: false,
      priority: 'medium',
      tags: ['购物', '生活'],
      userId: userId1,
      dueDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000), // 明天
      createdAt: new Date(),
      updatedAt: new Date(),
      isDeleted: false
    },
    {
      title: '锻炼身体',
      description: '去健身房锻炼1小时',
      completed: false,
      priority: 'low',
      tags: ['健康', '运动'],
      userId: userId1,
      createdAt: new Date(),
      updatedAt: new Date(),
      isDeleted: false
    },
    // 用户2的待办事项
    {
      title: '完成 MongoDB 教程学习',
      description: '学习完所有章节并完成练习',
      completed: false,
      priority: 'high',
      tags: ['学习', 'MongoDB'],
      userId: userId2,
      dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14天后
      createdAt: new Date(),
      updatedAt: new Date(),
      isDeleted: false
    },
    {
      title: '创建 Todo 管理系统',
      description: '使用 MongoDB 构建一个完整的 Todo 管理系统',
      completed: true,
      priority: 'high',
      tags: ['项目', 'MongoDB'],
      userId: userId2,
      dueDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      updatedAt: new Date(),
      isDeleted: false
    },
    {
      title: '阅读技术文档',
      description: '阅读 Typegoose 官方文档',
      completed: false,
      priority: 'medium',
      tags: ['学习', '文档'],
      userId: userId2,
      createdAt: new Date(),
      updatedAt: new Date(),
      isDeleted: false
    }
  ];

  const todoResult = await todosCollection.insertMany(todos);
  console.log(`  - 创建了 ${todoResult.insertedCount} 个 Todo 项`);
}

/**
 * 验证数据
 */
async function validateData(db) {
  const todosCollection = db.collection(COLLECTIONS.todos);
  const listsCollection = db.collection(COLLECTIONS.todolists);

  // 验证 Todos
  const todoCount = await todosCollection.countDocuments({});
  const completedCount = await todosCollection.countDocuments({ completed: true });
  const pendingCount = await todosCollection.countDocuments({ completed: false });

  console.log(`  - Todos 总数: ${todoCount}`);
  console.log(`  - 已完成: ${completedCount}`);
  console.log(`  - 待完成: ${pendingCount}`);

  // 验证 Lists
  const listCount = await listsCollection.countDocuments({});
  console.log(`  - Todo 列表总数: ${listCount}`);

  // 验证索引
  const todoIndexes = await todosCollection.indexes();
  const listIndexes = await listsCollection.indexes();
  console.log(`  - Todos 索引数: ${todoIndexes.length}`);
  console.log(`  - Lists 索引数: ${listIndexes.length}`);
}

/**
 * 显示统计信息
 */
async function showStatistics(db) {
  const todosCollection = db.collection(COLLECTIONS.todos);

  // 按用户统计
  const userStats = await todosCollection.aggregate([
    {
      $group: {
        _id: '$userId',
        total: { $sum: 1 },
        completed: {
          $sum: { $cond: [{ $eq: ['$completed', true] }, 1, 0] }
        },
        pending: {
          $sum: { $cond: [{ $eq: ['$completed', false] }, 1, 0] }
        }
      }
    },
    { $sort: { _id: 1 } }
  ]).toArray();

  console.log('\n按用户统计:');
  userStats.forEach(stat => {
    console.log(`  用户 ${stat._id}:`);
    console.log(`    总数: ${stat.total}`);
    console.log(`    已完成: ${stat.completed}`);
    console.log(`    待完成: ${stat.pending}`);
    console.log(`    完成率: ${((stat.completed / stat.total) * 100).toFixed(1)}%`);
  });

  // 按优先级统计
  const priorityStats = await todosCollection.aggregate([
    {
      $group: {
        _id: '$priority',
        count: { $sum: 1 }
      }
    },
    { $sort: { count: -1 } }
  ]).toArray();

  console.log('\n按优先级统计:');
  priorityStats.forEach(stat => {
    console.log(`  ${stat._id}: ${stat.count} 个`);
  });

  // 按标签统计
  const tagStats = await todosCollection.aggregate([
    { $unwind: '$tags' },
    {
      $group: {
        _id: '$tags',
        count: { $sum: 1 }
      }
    },
    { $sort: { count: -1 } },
    { $limit: 5 }
  ]).toArray();

  console.log('\n热门标签（前5）:');
  tagStats.forEach(stat => {
    console.log(`  ${stat._id}: ${stat.count} 次`);
  });
}

// 运行初始化
if (require.main === module) {
  initDatabase().catch(console.error);
}

module.exports = { initDatabase };


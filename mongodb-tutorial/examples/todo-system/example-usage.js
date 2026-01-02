/**
 * Todo 管理系统使用示例
 * 
 * 运行方式：node docs/mongodb-tutorial/examples/todo-system/example-usage.js
 * 
 * 演示如何使用 MongoDB 操作 Todo 数据
 */

const { MongoClient } = require('mongodb');

const uri = 'mongodb://localhost:27017';
const client = new MongoClient(uri);

const DB_NAME = 'todo_management';
const COLLECTIONS = {
  todos: 'todos',
  todolists: 'todolists'
};

async function main() {
  try {
    await client.connect();
    console.log('✅ MongoDB 连接成功\n');

    const db = client.db(DB_NAME);
    const todosCollection = db.collection(COLLECTIONS.todos);
    const userId = 'user001';

    // ==================== 示例 1: 查询操作 ====================
    console.log('1️⃣ 查询用户的待办事项');
    const pendingTodos = await todosCollection.find({
      userId,
      completed: false,
      isDeleted: false
    }).sort({ priority: -1, createdAt: -1 }).toArray();
    
    console.log(`找到 ${pendingTodos.length} 个待办事项:`);
    pendingTodos.forEach((todo, index) => {
      console.log(`  ${index + 1}. [${todo.priority}] ${todo.title}`);
      if (todo.dueDate) {
        console.log(`     到期: ${todo.dueDate.toLocaleDateString()}`);
      }
    });
    console.log();

    // ==================== 示例 2: 更新操作 ====================
    console.log('2️⃣ 标记 Todo 为已完成');
    if (pendingTodos.length > 0) {
      const todoId = pendingTodos[0]._id;
      const result = await todosCollection.updateOne(
        { _id: todoId },
        {
          $set: {
            completed: true,
            updatedAt: new Date()
          }
        }
      );
      console.log(`✅ 更新了 ${result.modifiedCount} 个 Todo\n`);
    }

    // ==================== 示例 3: 添加标签 ====================
    console.log('3️⃣ 为 Todo 添加标签');
    const todoToTag = await todosCollection.findOne({
      userId,
      isDeleted: false
    });
    
    if (todoToTag) {
      await todosCollection.updateOne(
        { _id: todoToTag._id },
        {
          $addToSet: { tags: '紧急' },
          $set: { updatedAt: new Date() }
        }
      );
      console.log(`✅ 为 "${todoToTag.title}" 添加了标签\n`);
    }

    // ==================== 示例 4: 聚合查询 ====================
    console.log('4️⃣ 统计信息（使用聚合管道）');
    const stats = await todosCollection.aggregate([
      {
        $match: {
          userId,
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
          },
          highPriority: {
            $sum: { $cond: [{ $eq: ['$priority', 'high'] }, 1, 0] }
          },
          avgTags: {
            $avg: { $size: '$tags' }
          }
        }
      },
      {
        $project: {
          _id: 0,
          total: 1,
          completed: 1,
          pending: 1,
          highPriority: 1,
          completionRate: {
            $multiply: [
              { $divide: ['$completed', '$total'] },
              100
            ]
          },
          avgTags: { $round: ['$avgTags', 2] }
        }
      }
    ]).toArray();

    if (stats.length > 0) {
      const stat = stats[0];
      console.log(`  总数: ${stat.total}`);
      console.log(`  已完成: ${stat.completed}`);
      console.log(`  待完成: ${stat.pending}`);
      console.log(`  高优先级: ${stat.highPriority}`);
      console.log(`  完成率: ${stat.completionRate.toFixed(1)}%`);
      console.log(`  平均标签数: ${stat.avgTags}\n`);
    }

    // ==================== 示例 5: 查找即将到期的 Todo ====================
    console.log('5️⃣ 查找即将到期的 Todo（7天内）');
    const today = new Date();
    const sevenDaysLater = new Date();
    sevenDaysLater.setDate(today.getDate() + 7);

    const upcomingTodos = await todosCollection.find({
      userId,
      isDeleted: false,
      completed: false,
      dueDate: {
        $gte: today,
        $lte: sevenDaysLater
      }
    }).sort({ dueDate: 1 }).toArray();

    console.log(`找到 ${upcomingTodos.length} 个即将到期的 Todo:`);
    upcomingTodos.forEach((todo, index) => {
      const daysLeft = Math.ceil((todo.dueDate - today) / (1000 * 60 * 60 * 24));
      console.log(`  ${index + 1}. ${todo.title} (还有 ${daysLeft} 天)`);
    });
    console.log();

    // ==================== 示例 6: 文本搜索 ====================
    console.log('6️⃣ 文本搜索');
    const searchResults = await todosCollection.find({
      userId,
      isDeleted: false,
      $text: { $search: 'MongoDB' }
    }).toArray();

    console.log(`找到 ${searchResults.length} 个相关 Todo:`);
    searchResults.forEach((todo, index) => {
      console.log(`  ${index + 1}. ${todo.title}`);
    });
    console.log();

    // ==================== 示例 7: 按标签分组 ====================
    console.log('7️⃣ 按标签分组统计');
    const tagGroups = await todosCollection.aggregate([
      {
        $match: {
          userId,
          isDeleted: false
        }
      },
      { $unwind: '$tags' },
      {
        $group: {
          _id: '$tags',
          count: { $sum: 1 },
          todos: { $push: '$title' }
        }
      },
      { $sort: { count: -1 } }
    ]).toArray();

    tagGroups.forEach(group => {
      console.log(`  ${group._id}: ${group.count} 个`);
      console.log(`    ${group.todos.slice(0, 3).join(', ')}${group.todos.length > 3 ? '...' : ''}`);
    });
    console.log();

    // ==================== 示例 8: 软删除 ====================
    console.log('8️⃣ 软删除 Todo');
    const todoToDelete = await todosCollection.findOne({
      userId,
      isDeleted: false,
      completed: true
    });

    if (todoToDelete) {
      await todosCollection.updateOne(
        { _id: todoToDelete._id },
        {
          $set: {
            isDeleted: true,
            deletedAt: new Date(),
            updatedAt: new Date()
          }
        }
      );
      console.log(`✅ 已软删除: "${todoToDelete.title}"\n`);
    }

    // ==================== 示例 9: 恢复软删除的 Todo ====================
    console.log('9️⃣ 恢复软删除的 Todo');
    const deletedTodo = await todosCollection.findOne({
      userId,
      isDeleted: true
    });

    if (deletedTodo) {
      await todosCollection.updateOne(
        { _id: deletedTodo._id },
        {
          $set: {
            isDeleted: false,
            deletedAt: null,
            updatedAt: new Date()
          }
        }
      );
      console.log(`✅ 已恢复: "${deletedTodo.title}"\n`);
    }

    // ==================== 示例 10: 批量操作 ====================
    console.log('🔟 批量更新优先级');
    const bulkResult = await todosCollection.bulkWrite([
      {
        updateMany: {
          filter: {
            userId,
            isDeleted: false,
            completed: false,
            priority: 'low'
          },
          update: {
            $set: {
              priority: 'medium',
              updatedAt: new Date()
            }
          }
        }
      }
    ]);

    console.log(`✅ 批量更新了 ${bulkResult.modifiedCount} 个 Todo\n`);

  } catch (error) {
    console.error('❌ 错误:', error);
  } finally {
    await client.close();
    console.log('👋 连接已关闭');
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main };


/**
 * MongoDB 聚合管道示例
 * 
 * 运行方式：node examples/04-aggregation-pipeline.js
 */

const { MongoClient } = require('mongodb');

const uri = 'mongodb://localhost:27017';
const client = new MongoClient(uri);

async function main() {
  try {
    await client.connect();
    console.log('✅ MongoDB 连接成功');

    const db = client.db('mongodb_tutorial');
    const ordersCollection = db.collection('orders');
    const usersCollection = db.collection('users');

    // 准备测试数据
    console.log('\n📊 准备测试数据...');
    
    // 用户数据
    await usersCollection.insertMany([
      { _id: 1, name: '张三', age: 25, city: '北京', score: 85 },
      { _id: 2, name: '李四', age: 30, city: '上海', score: 92 },
      { _id: 3, name: '王五', age: 28, city: '北京', score: 78 },
      { _id: 4, name: '赵六', age: 35, city: '广州', score: 95 },
      { _id: 5, name: '孙七', age: 22, city: '北京', score: 65 }
    ]);

    // 订单数据
    const orders = [];
    for (let i = 0; i < 100; i++) {
      orders.push({
        userId: Math.floor(Math.random() * 5) + 1,
        amount: Math.floor(Math.random() * 1000) + 100,
        status: ['completed', 'pending', 'cancelled'][Math.floor(Math.random() * 3)],
        createdAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000)
      });
    }
    await ordersCollection.insertMany(orders);
    console.log('✅ 测试数据准备完成\n');

    // 1. $match - 过滤
    console.log('1️⃣ $match - 过滤文档');
    const activeUsers = await usersCollection.aggregate([
      { $match: { age: { $gte: 25 } } }
    ]).toArray();
    console.log(`年龄 >= 25 的用户: ${activeUsers.length} 个\n`);

    // 2. $group - 分组聚合
    console.log('2️⃣ $group - 分组聚合');
    const ageGroups = await usersCollection.aggregate([
      {
        $group: {
          _id: {
            $switch: {
              branches: [
                { case: { $lt: ['$age', 25] }, then: '18-24' },
                { case: { $lt: ['$age', 30] }, then: '25-29' },
                { case: { $lt: ['$age', 35] }, then: '30-34' }
              ],
              default: '35+'
            }
          },
          count: { $sum: 1 },
          avgScore: { $avg: '$score' },
          maxScore: { $max: '$score' },
          minScore: { $min: '$score' }
        }
      },
      { $sort: { _id: 1 } }
    ]).toArray();
    console.log('按年龄分组统计:');
    ageGroups.forEach(group => {
      console.log(`  ${group._id}: ${group.count}人, 平均分: ${group.avgScore.toFixed(2)}`);
    });
    console.log();

    // 3. $project - 字段投影和转换
    console.log('3️⃣ $project - 字段投影');
    const userInfo = await usersCollection.aggregate([
      {
        $project: {
          _id: 0,
          fullName: { $concat: ['$name', ' (', { $toString: '$age' }, '岁)'] },
          score: 1,
          scoreLevel: {
            $switch: {
              branches: [
                { case: { $lt: ['$score', 60] }, then: '不及格' },
                { case: { $lt: ['$score', 80] }, then: '良好' },
                { case: { $lt: ['$score', 90] }, then: '优秀' }
              ],
              default: '卓越'
            }
          }
        }
      }
    ]).toArray();
    console.log('用户信息转换:');
    userInfo.forEach(user => {
      console.log(`  ${user.fullName} - ${user.scoreLevel} (${user.score}分)`);
    });
    console.log();

    // 4. $lookup - 关联查询
    console.log('4️⃣ $lookup - 关联查询');
    const usersWithOrders = await usersCollection.aggregate([
      {
        $lookup: {
          from: 'orders',
          localField: '_id',
          foreignField: 'userId',
          as: 'orders'
        }
      },
      {
        $addFields: {
          orderCount: { $size: '$orders' },
          totalAmount: { $sum: '$orders.amount' }
        }
      },
      { $sort: { totalAmount: -1 } }
    ]).toArray();
    console.log('用户订单统计:');
    usersWithOrders.forEach(user => {
      console.log(`  ${user.name}: ${user.orderCount}个订单, 总金额: ¥${user.totalAmount || 0}`);
    });
    console.log();

    // 5. $unwind - 展开数组
    console.log('5️⃣ $unwind - 展开数组');
    const ordersByUser = await ordersCollection.aggregate([
      {
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: '_id',
          as: 'user'
        }
      },
      { $unwind: '$user' },
      {
        $group: {
          _id: '$user.name',
          orders: { $push: { amount: '$amount', status: '$status' } }
        }
      }
    ]).toArray();
    console.log('每个用户的订单详情:');
    ordersByUser.forEach(item => {
      console.log(`  ${item._id}: ${item.orders.length}个订单`);
    });
    console.log();

    // 6. $facet - 多管道处理
    console.log('6️⃣ $facet - 多管道处理');
    const statistics = await usersCollection.aggregate([
      {
        $facet: {
          'byCity': [
            { $group: { _id: '$city', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
          ],
          'topScores': [
            { $sort: { score: -1 } },
            { $limit: 3 },
            { $project: { name: 1, score: 1, _id: 0 } }
          ],
          'averageAge': [
            { $group: { _id: null, avgAge: { $avg: '$age' } } }
          ]
        }
      }
    ]).toArray();
    
    console.log('统计信息:');
    console.log('按城市分组:');
    statistics[0].byCity.forEach(item => {
      console.log(`  ${item._id}: ${item.count}人`);
    });
    console.log('分数最高的3人:');
    statistics[0].topScores.forEach((user, index) => {
      console.log(`  ${index + 1}. ${user.name} - ${user.score}分`);
    });
    console.log(`平均年龄: ${statistics[0].averageAge[0].avgAge.toFixed(2)}岁\n`);

    // 7. 时间序列分析
    console.log('7️⃣ 时间序列分析');
    const dailyOrders = await ordersCollection.aggregate([
      {
        $match: { status: 'completed' }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' }
          },
          totalAmount: { $sum: '$amount' },
          orderCount: { $sum: 1 },
          avgAmount: { $avg: '$amount' }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } },
      { $limit: 5 }
    ]).toArray();
    console.log('每日订单统计（前5天）:');
    dailyOrders.forEach(item => {
      const date = `${item._id.year}-${item._id.month}-${item._id.day}`;
      console.log(`  ${date}: ${item.orderCount}单, 总金额: ¥${item.totalAmount}, 平均: ¥${item.avgAmount.toFixed(2)}`);
    });

    // 清理
    console.log('\n🧹 清理测试数据...');
    await usersCollection.deleteMany({});
    await ordersCollection.deleteMany({});
    console.log('✅ 清理完成');

  } catch (error) {
    console.error('❌ 错误:', error);
  } finally {
    await client.close();
    console.log('\n👋 连接已关闭');
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main };


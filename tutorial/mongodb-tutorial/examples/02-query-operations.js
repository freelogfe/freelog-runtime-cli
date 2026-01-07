/**
 * MongoDB 查询操作示例
 * 
 * 运行方式：node examples/02-query-operations.js
 */

const { MongoClient } = require('mongodb');

const uri = 'mongodb://localhost:27017';
const client = new MongoClient(uri);

async function main() {
  try {
    await client.connect();
    console.log('✅ MongoDB 连接成功');

    const db = client.db('mongodb_tutorial');
    const usersCollection = db.collection('users');

    // 准备测试数据
    await usersCollection.insertMany([
      { name: '张三', age: 25, email: 'zhangsan@example.com', score: 85, status: 'active', hobbies: ['读书', '游泳'] },
      { name: '李四', age: 30, email: 'lisi@example.com', score: 92, status: 'active', hobbies: ['编程', '音乐'] },
      { name: '王五', age: 28, email: 'wangwu@example.com', score: 78, status: 'inactive', hobbies: ['旅游'] },
      { name: '赵六', age: 35, email: 'zhaoliu@example.com', score: 95, status: 'active', hobbies: ['读书', '编程', '音乐'] },
      { name: '孙七', age: 22, email: 'sunqi@example.com', score: 65, status: 'pending', hobbies: ['游泳'] }
    ]);

    console.log('\n📊 测试数据已准备\n');

    // 1. 比较操作符
    console.log('1️⃣ 比较操作符');
    const age25Plus = await usersCollection.find({ age: { $gte: 25 } }).toArray();
    console.log(`年龄 >= 25 的用户: ${age25Plus.length} 个`);

    const highScore = await usersCollection.find({ score: { $gt: 80 } }).toArray();
    console.log(`分数 > 80 的用户: ${highScore.length} 个`);

    const ageRange = await usersCollection.find({ age: { $in: [25, 30, 35] } }).toArray();
    console.log(`年龄在 [25, 30, 35] 的用户: ${ageRange.length} 个\n`);

    // 2. 逻辑操作符
    console.log('2️⃣ 逻辑操作符');
    const andQuery = await usersCollection.find({
      $and: [
        { age: { $gte: 25 } },
        { status: 'active' }
      ]
    }).toArray();
    console.log(`年龄 >= 25 且状态为 active: ${andQuery.length} 个`);

    const orQuery = await usersCollection.find({
      $or: [
        { age: { $lt: 25 } },
        { score: { $gt: 90 } }
      ]
    }).toArray();
    console.log(`年龄 < 25 或分数 > 90: ${orQuery.length} 个\n`);

    // 3. 数组查询
    console.log('3️⃣ 数组查询');
    const hasReading = await usersCollection.find({ hobbies: '读书' }).toArray();
    console.log(`爱好包含"读书"的用户: ${hasReading.length} 个`);

    const hasBoth = await usersCollection.find({
      hobbies: { $all: ['读书', '编程'] }
    }).toArray();
    console.log(`爱好同时包含"读书"和"编程": ${hasBoth.length} 个`);

    const hobbyCount = await usersCollection.find({
      hobbies: { $size: 3 }
    }).toArray();
    console.log(`有 3 个爱好的用户: ${hobbyCount.length} 个\n`);

    // 4. 正则表达式查询
    console.log('4️⃣ 正则表达式查询');
    const zhangUsers = await usersCollection.find({
      name: /张/
    }).toArray();
    console.log(`姓名包含"张"的用户: ${zhangUsers.length} 个`);

    const gmailUsers = await usersCollection.find({
      email: /@example\.com$/
    }).toArray();
    console.log(`邮箱以 @example.com 结尾: ${gmailUsers.length} 个\n`);

    // 5. 字段存在性查询
    console.log('5️⃣ 字段存在性查询');
    const hasEmail = await usersCollection.find({
      email: { $exists: true }
    }).toArray();
    console.log(`有 email 字段的用户: ${hasEmail.length} 个\n`);

    // 6. 排序和限制
    console.log('6️⃣ 排序和限制');
    const topUsers = await usersCollection
      .find({})
      .sort({ score: -1 })
      .limit(3)
      .toArray();
    console.log('分数最高的 3 个用户:');
    topUsers.forEach((user, index) => {
      console.log(`  ${index + 1}. ${user.name} - ${user.score}分`);
    });

    // 7. 分页查询
    console.log('\n7️⃣ 分页查询');
    const page = 1;
    const pageSize = 2;
    const skip = (page - 1) * pageSize;
    
    const pageUsers = await usersCollection
      .find({})
      .sort({ age: 1 })
      .skip(skip)
      .limit(pageSize)
      .toArray();
    console.log(`第 ${page} 页（每页 ${pageSize} 条）:`);
    pageUsers.forEach(user => {
      console.log(`  - ${user.name}, ${user.age}岁`);
    });

    // 8. 字段投影
    console.log('\n8️⃣ 字段投影');
    const namesOnly = await usersCollection.find(
      {},
      { projection: { name: 1, age: 1, _id: 0 } }
    ).toArray();
    console.log('只返回姓名和年龄:');
    namesOnly.forEach(user => {
      console.log(`  - ${user.name}, ${user.age}岁`);
    });

    // 9. 计数
    console.log('\n9️⃣ 计数');
    const activeCount = await usersCollection.countDocuments({ status: 'active' });
    console.log(`状态为 active 的用户数: ${activeCount}`);

    // 10. 去重
    console.log('\n🔟 去重');
    const distinctAges = await usersCollection.distinct('age');
    console.log('所有不同的年龄:', distinctAges.sort((a, b) => a - b));

    // 清理
    await usersCollection.deleteMany({});
    console.log('\n🧹 清理测试数据完成');

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


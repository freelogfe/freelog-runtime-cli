/**
 * MongoDB 基础操作示例
 * 
 * 运行前确保 MongoDB 已启动
 * 运行方式：node examples/01-basic-operations.js
 */

const { MongoClient } = require('mongodb');

const uri = 'mongodb://localhost:27017';
const client = new MongoClient(uri);

async function main() {
  try {
    // 连接数据库
    await client.connect();
    console.log('✅ MongoDB 连接成功');

    const db = client.db('mongodb_tutorial');
    const usersCollection = db.collection('users');

    // 1. 插入文档
    console.log('\n📝 1. 插入文档');
    const insertResult = await usersCollection.insertMany([
      {
        name: '张三',
        age: 25,
        email: 'zhangsan@example.com',
        hobbies: ['读书', '游泳'],
        address: {
          city: '北京',
          district: '朝阳区'
        },
        createdAt: new Date()
      },
      {
        name: '李四',
        age: 30,
        email: 'lisi@example.com',
        hobbies: ['编程', '音乐'],
        address: {
          city: '上海',
          district: '浦东新区'
        },
        createdAt: new Date()
      },
      {
        name: '王五',
        age: 28,
        email: 'wangwu@example.com',
        hobbies: ['旅游', '摄影'],
        address: {
          city: '广州',
          district: '天河区'
        },
        createdAt: new Date()
      }
    ]);
    console.log(`插入了 ${insertResult.insertedCount} 个文档`);

    // 2. 查询文档
    console.log('\n🔍 2. 查询文档');
    
    // 查询所有
    const allUsers = await usersCollection.find({}).toArray();
    console.log('所有用户:', allUsers.length, '个');

    // 条件查询
    const beijingUsers = await usersCollection.find({
      'address.city': '北京'
    }).toArray();
    console.log('北京用户:', beijingUsers.length, '个');

    // 查询单个
    const user = await usersCollection.findOne({ name: '张三' });
    console.log('找到用户:', user?.name);

    // 3. 更新文档
    console.log('\n✏️ 3. 更新文档');
    const updateResult = await usersCollection.updateOne(
      { name: '张三' },
      { $set: { age: 26 } }
    );
    console.log(`更新了 ${updateResult.modifiedCount} 个文档`);

    // 使用更新操作符
    await usersCollection.updateOne(
      { name: '张三' },
      {
        $inc: { age: 1 },  // 年龄加 1
        $push: { hobbies: '编程' }  // 添加爱好
      }
    );
    console.log('使用操作符更新完成');

    // 4. 删除文档
    console.log('\n🗑️ 4. 删除文档');
    const deleteResult = await usersCollection.deleteOne({ name: '王五' });
    console.log(`删除了 ${deleteResult.deletedCount} 个文档`);

    // 5. 查询更新后的数据
    console.log('\n📊 5. 最终数据');
    const finalUsers = await usersCollection.find({}).toArray();
    finalUsers.forEach(user => {
      console.log(`- ${user.name}, ${user.age}岁, 爱好: ${user.hobbies.join(', ')}`);
    });

    // 清理：删除测试数据
    await usersCollection.deleteMany({});
    console.log('\n🧹 清理测试数据完成');

  } catch (error) {
    console.error('❌ 错误:', error);
  } finally {
    await client.close();
    console.log('\n👋 连接已关闭');
  }
}

// 运行示例
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main };


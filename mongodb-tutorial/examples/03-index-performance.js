/**
 * MongoDB 索引与性能优化示例
 * 
 * 运行方式：node examples/03-index-performance.js
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

    // 准备大量测试数据
    console.log('\n📊 准备测试数据...');
    const testData = [];
    for (let i = 0; i < 10000; i++) {
      testData.push({
        name: `用户${i}`,
        email: `user${i}@example.com`,
        age: Math.floor(Math.random() * 50) + 18,
        score: Math.floor(Math.random() * 100),
        status: ['active', 'inactive', 'pending'][Math.floor(Math.random() * 3)],
        createdAt: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000)
      });
    }
    await usersCollection.insertMany(testData);
    console.log('✅ 插入了 10000 条测试数据\n');

    // 1. 无索引查询（慢）
    console.log('1️⃣ 无索引查询性能测试');
    const start1 = Date.now();
    const result1 = await usersCollection.find({ email: 'user5000@example.com' }).toArray();
    const time1 = Date.now() - start1;
    console.log(`查询时间: ${time1}ms`);
    console.log(`执行计划:`, await usersCollection.find({ email: 'user5000@example.com' }).explain('executionStats'));

    // 2. 创建索引
    console.log('\n2️⃣ 创建索引');
    await usersCollection.createIndex({ email: 1 });
    console.log('✅ 为 email 字段创建了索引');

    // 3. 有索引查询（快）
    console.log('\n3️⃣ 有索引查询性能测试');
    const start2 = Date.now();
    const result2 = await usersCollection.find({ email: 'user5000@example.com' }).toArray();
    const time2 = Date.now() - start2;
    console.log(`查询时间: ${time2}ms`);
    console.log(`性能提升: ${((time1 - time2) / time1 * 100).toFixed(2)}%`);

    const explain2 = await usersCollection.find({ email: 'user5000@example.com' }).explain('executionStats');
    console.log(`执行阶段: ${explain2.executionStats.executionStages.stage}`);
    console.log(`检查的文档数: ${explain2.executionStats.totalDocsExamined}`);

    // 4. 复合索引
    console.log('\n4️⃣ 创建复合索引');
    await usersCollection.createIndex({ status: 1, createdAt: -1 });
    console.log('✅ 创建了复合索引: { status: 1, createdAt: -1 }');

    const start3 = Date.now();
    const result3 = await usersCollection
      .find({ status: 'active' })
      .sort({ createdAt: -1 })
      .limit(10)
      .toArray();
    const time3 = Date.now() - start3;
    console.log(`使用复合索引查询时间: ${time3}ms`);

    // 5. 查看所有索引
    console.log('\n5️⃣ 查看所有索引');
    const indexes = await usersCollection.indexes();
    console.log('当前索引:');
    indexes.forEach(index => {
      console.log(`  - ${index.name}:`, JSON.stringify(index.key));
    });

    // 6. 索引统计
    console.log('\n6️⃣ 索引使用统计');
    const stats = await usersCollection.aggregate([{ $indexStats: {} }]).toArray();
    stats.forEach(stat => {
      console.log(`索引 ${stat.name}:`);
      console.log(`  访问次数: ${stat.accesses.ops}`);
    });

    // 7. 唯一索引
    console.log('\n7️⃣ 创建唯一索引');
    try {
      await usersCollection.createIndex({ email: 1 }, { unique: true });
      console.log('✅ 创建唯一索引成功（如果已存在会报错）');
    } catch (error) {
      if (error.code === 85) {
        console.log('ℹ️ 唯一索引已存在');
      }
    }

    // 8. 文本索引
    console.log('\n8️⃣ 创建文本索引');
    await usersCollection.createIndex({ name: 'text' });
    console.log('✅ 创建文本索引成功');

    const textResults = await usersCollection.find({
      $text: { $search: '用户5000' }
    }).toArray();
    console.log(`文本搜索找到 ${textResults.length} 个结果`);

    // 9. 性能分析
    console.log('\n9️⃣ 性能分析');
    await db.setProfilingLevel(1, { slowms: 100 });
    console.log('✅ 启用性能分析（慢查询阈值: 100ms）');

    // 执行一些查询
    await usersCollection.find({ age: { $gte: 25 } }).toArray();
    await usersCollection.find({ score: { $gt: 80 } }).toArray();

    // 查看慢查询
    const slowQueries = await db.collection('system.profile')
      .find({})
      .sort({ ts: -1 })
      .limit(5)
      .toArray();
    
    if (slowQueries.length > 0) {
      console.log('慢查询:');
      slowQueries.forEach(query => {
        console.log(`  - ${query.command.find || query.command.aggregate}: ${query.duration}ms`);
      });
    }

    await db.setProfilingLevel(0);
    console.log('✅ 关闭性能分析');

    // 清理
    console.log('\n🧹 清理测试数据...');
    await usersCollection.drop();
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


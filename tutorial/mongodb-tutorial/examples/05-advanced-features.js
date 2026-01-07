/**
 * MongoDB 高级特性示例（事务、变更流、批量操作）
 * 
 * 注意：事务需要副本集或分片集群
 * 单机 MongoDB 可以使用内存存储引擎测试事务
 * 
 * 运行方式：node examples/05-advanced-features.js
 */

const { MongoClient } = require('mongodb');

const uri = 'mongodb://localhost:27017';
const client = new MongoClient(uri);

async function main() {
  try {
    await client.connect();
    console.log('✅ MongoDB 连接成功');

    const db = client.db('mongodb_tutorial');
    const accountsCollection = db.collection('accounts');
    const transactionsCollection = db.collection('transactions');

    // 准备测试数据
    console.log('\n📊 准备测试数据...');
    await accountsCollection.insertMany([
      { _id: 1, userId: 'user1', balance: 1000, name: '账户1' },
      { _id: 2, userId: 'user2', balance: 500, name: '账户2' }
    ]);
    console.log('✅ 测试数据准备完成\n');

    // 1. 批量操作
    console.log('1️⃣ 批量操作示例');
    const bulkResult = await accountsCollection.bulkWrite([
      { insertOne: { document: { userId: 'user3', balance: 800, name: '账户3' } } },
      { updateOne: { filter: { userId: 'user1' }, update: { $inc: { balance: 100 } } } },
      { updateOne: { filter: { userId: 'user2' }, update: { $set: { name: '账户2-更新' } } } }
    ]);
    console.log(`批量操作结果:`);
    console.log(`  插入: ${bulkResult.insertedCount} 条`);
    console.log(`  更新: ${bulkResult.modifiedCount} 条\n`);

    // 2. 事务示例（需要副本集）
    console.log('2️⃣ 事务示例');
    console.log('⚠️  注意：事务需要副本集或分片集群');
    console.log('   单机 MongoDB 无法测试事务，这里仅展示代码结构\n');

    async function transferMoney(fromUserId, toUserId, amount) {
      const session = client.startSession();
      
      try {
        await session.withTransaction(async () => {
          // 扣除转出账户
          const fromResult = await accountsCollection.updateOne(
            { userId: fromUserId },
            { $inc: { balance: -amount } },
            { session }
          );
          
          if (fromResult.modifiedCount === 0) {
            throw new Error('转出账户不存在');
          }
          
          // 检查余额（在实际应用中）
          const fromAccount = await accountsCollection.findOne(
            { userId: fromUserId },
            { session }
          );
          
          if (fromAccount.balance < 0) {
            throw new Error('余额不足');
          }
          
          // 增加转入账户
          await accountsCollection.updateOne(
            { userId: toUserId },
            { $inc: { balance: amount } },
            { session }
          );
          
          // 记录交易
          await transactionsCollection.insertOne({
            fromUserId,
            toUserId,
            amount,
            type: 'transfer',
            createdAt: new Date()
          }, { session });
        });
        
        console.log('✅ 转账成功');
      } catch (error) {
        console.error('❌ 转账失败:', error.message);
        throw error;
      } finally {
        await session.endSession();
      }
    }

    // 注意：单机 MongoDB 无法执行事务，这里注释掉
    // await transferMoney('user1', 'user2', 200);

    // 3. 变更流（Change Streams）
    console.log('3️⃣ 变更流示例');
    console.log('监听账户集合的变化...\n');
    
    const changeStream = accountsCollection.watch();
    
    // 设置超时，避免无限等待
    const timeout = setTimeout(() => {
      changeStream.close();
      console.log('⏰ 变更流监听超时（5秒）\n');
    }, 5000);
    
    changeStream.on('change', (change) => {
      console.log('📢 检测到变化:');
      console.log(`  操作类型: ${change.operationType}`);
      
      switch (change.operationType) {
        case 'insert':
          console.log(`  插入文档:`, change.fullDocument);
          break;
        case 'update':
          console.log(`  更新文档 ID:`, change.documentKey._id);
          console.log(`  更新内容:`, change.updateDescription);
          break;
        case 'delete':
          console.log(`  删除文档 ID:`, change.documentKey._id);
          break;
      }
      console.log();
    });
    
    changeStream.on('error', (error) => {
      console.error('❌ 变更流错误:', error);
    });
    
    // 触发一些变化
    setTimeout(async () => {
      await accountsCollection.insertOne({
        userId: 'user4',
        balance: 1200,
        name: '账户4'
      });
      
      await accountsCollection.updateOne(
        { userId: 'user1' },
        { $set: { name: '账户1-更新' } }
      );
    }, 1000);
    
    // 等待变更流处理
    await new Promise(resolve => setTimeout(resolve, 2000));
    clearTimeout(timeout);
    changeStream.close();
    console.log('✅ 变更流监听结束\n');

    // 4. 数据验证（需要在创建集合时设置）
    console.log('4️⃣ 数据验证示例');
    console.log('创建带验证规则的集合...');
    
    try {
      await db.createCollection('validatedUsers', {
        validator: {
          $jsonSchema: {
            bsonType: 'object',
            required: ['name', 'email', 'age'],
            properties: {
              name: {
                bsonType: 'string',
                description: '姓名必须是字符串'
              },
              email: {
                bsonType: 'string',
                pattern: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$',
                description: '邮箱格式不正确'
              },
              age: {
                bsonType: 'int',
                minimum: 0,
                maximum: 150,
                description: '年龄必须在 0-150 之间'
              }
            }
          }
        },
        validationLevel: 'strict',
        validationAction: 'error'
      });
      
      console.log('✅ 验证集合创建成功');
      
      // 测试有效数据
      try {
        await db.collection('validatedUsers').insertOne({
          name: '测试用户',
          email: 'test@example.com',
          age: 25
        });
        console.log('✅ 有效数据插入成功');
      } catch (error) {
        console.error('❌ 有效数据插入失败:', error.message);
      }
      
      // 测试无效数据（应该失败）
      try {
        await db.collection('validatedUsers').insertOne({
          name: '测试用户2',
          email: 'invalid-email',  // 无效邮箱
          age: 25
        });
        console.log('❌ 无效数据应该被拒绝');
      } catch (error) {
        console.log('✅ 无效数据被正确拒绝:', error.message);
      }
      
      await db.collection('validatedUsers').drop();
    } catch (error) {
      if (error.codeName === 'NamespaceExists') {
        console.log('ℹ️  集合已存在，跳过创建');
      } else {
        console.error('❌ 创建验证集合失败:', error.message);
      }
    }
    console.log();

    // 5. 性能监控
    console.log('5️⃣ 性能监控示例');
    
    // 启用性能分析
    await db.setProfilingLevel(1, { slowms: 100 });
    console.log('✅ 启用性能分析（慢查询阈值: 100ms）');
    
    // 执行一些查询
    await accountsCollection.find({ balance: { $gt: 500 } }).toArray();
    await accountsCollection.find({ userId: 'user1' }).toArray();
    
    // 查看慢查询
    const slowQueries = await db.collection('system.profile')
      .find({})
      .sort({ ts: -1 })
      .limit(3)
      .toArray();
    
    if (slowQueries.length > 0) {
      console.log('慢查询记录:');
      slowQueries.forEach(query => {
        const command = query.command.find || query.command.aggregate || 'unknown';
        console.log(`  - ${command}: ${query.duration}ms`);
      });
    } else {
      console.log('ℹ️  没有慢查询记录');
    }
    
    await db.setProfilingLevel(0);
    console.log('✅ 关闭性能分析\n');

    // 清理
    console.log('🧹 清理测试数据...');
    await accountsCollection.deleteMany({});
    await transactionsCollection.deleteMany({});
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


/**
 * MongoDB 副本集初始化脚本
 * 使用方法: node init-replica-set.js
 */

const { MongoClient } = require('mongodb');

async function initReplicaSet() {
  const client = new MongoClient('mongodb://localhost:27017');
  
  try {
    console.log('🔌 正在连接到 MongoDB...');
    await client.connect();
    console.log('✅ 连接成功');
    
    const admin = client.db().admin();
    
    try {
      console.log('🔄 正在初始化副本集...');
      const result = await admin.command({
        replSetInitiate: {
          _id: "rs0",
          members: [
            { _id: 0, host: "localhost:27017" }
          ]
        }
      });
      console.log('✅ 副本集初始化成功!');
      console.log('结果:', JSON.stringify(result, null, 2));
      
      // 等待几秒让副本集稳定
      console.log('⏳ 等待副本集稳定...');
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // 检查状态
      const status = await admin.command({ replSetGetStatus: 1 });
      console.log('\n📊 副本集状态:');
      console.log('名称:', status.set);
      console.log('成员数:', status.members.length);
      console.log('主节点:', status.members.find(m => m.stateStr === 'PRIMARY')?.name);
      
    } catch (error) {
      if (error.codeName === 'AlreadyInitialized') {
        console.log('ℹ️  副本集已经初始化');
        const status = await admin.command({ replSetGetStatus: 1 });
        console.log('当前副本集名称:', status.set);
        console.log('成员状态:', status.members.map(m => `${m.name}: ${m.stateStr}`).join(', '));
      } else {
        throw error;
      }
    }
  } catch (error) {
    console.error('❌ 错误:', error.message);
    if (error.codeName) {
      console.error('错误代码:', error.codeName);
    }
    process.exit(1);
  } finally {
    await client.close();
    console.log('\n✅ 完成！现在可以重启您的 NestJS 应用了。');
  }
}

initReplicaSet();


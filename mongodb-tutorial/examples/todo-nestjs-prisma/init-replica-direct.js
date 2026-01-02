/**
 * 直接初始化 MongoDB 副本集（绕过连接超时）
 */

const { MongoClient } = require('mongodb');

async function initReplicaSetDirect() {
  // 直接连接到 admin 数据库，不指定数据库名
  const client = new MongoClient('mongodb://localhost:27017/?directConnection=true', {
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 10000,
  });
  
  try {
    console.log('🔌 正在连接到 MongoDB（直接连接模式）...');
    await client.connect();
    console.log('✅ 连接成功');
    
    const admin = client.db('admin').admin();
    
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
      
      // 等待副本集稳定
      console.log('⏳ 等待副本集稳定（这可能需要10-30秒）...');
      for (let i = 0; i < 30; i++) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        try {
          const status = await admin.command({ replSetGetStatus: 1 });
          const primary = status.members.find(m => m.stateStr === 'PRIMARY');
          if (primary) {
            console.log(`\n✅ 副本集已就绪！`);
            console.log(`   名称: ${status.set}`);
            console.log(`   主节点: ${primary.name}`);
            console.log(`   状态: ${primary.stateStr}`);
            break;
          }
        } catch (e) {
          // 继续等待
          process.stdout.write('.');
        }
      }
      
    } catch (error) {
      if (error.codeName === 'AlreadyInitialized') {
        console.log('ℹ️  副本集已经初始化');
        try {
          const status = await admin.command({ replSetGetStatus: 1 });
          console.log('当前副本集名称:', status.set);
          const primary = status.members.find(m => m.stateStr === 'PRIMARY');
          if (primary) {
            console.log('主节点:', primary.name);
            console.log('✅ 副本集运行正常！');
          } else {
            console.log('⚠️  没有主节点，等待中...');
            console.log('成员状态:', status.members.map(m => `${m.name}: ${m.stateStr}`).join(', '));
          }
        } catch (e) {
          console.log('⚠️  无法获取状态:', e.message);
        }
      } else {
        throw error;
      }
    }
  } catch (error) {
    console.error('\n❌ 错误:', error.message);
    if (error.codeName) {
      console.error('错误代码:', error.codeName);
    }
    
    console.log('\n💡 可能的解决方案:');
    console.log('1. 检查 MongoDB 服务是否正在运行');
    console.log('2. 检查配置文件是否正确（需要 replSetName: rs0）');
    console.log('3. 尝试重启 MongoDB 服务');
    console.log('4. 查看 MongoDB 日志文件');
    
    process.exit(1);
  } finally {
    await client.close();
    console.log('\n✅ 完成！现在可以重启您的 NestJS 应用了。');
  }
}

initReplicaSetDirect();


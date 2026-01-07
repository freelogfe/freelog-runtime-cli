/**
 * 检查 MongoDB 连接和副本集状态
 */

const { MongoClient } = require('mongodb');

async function checkMongoDBStatus() {
  const connectionUrl = process.env.DATABASE_URL || 'mongodb://localhost:27017/todo';
  console.log(`🔌 正在连接到: ${connectionUrl.replace(/\/\/.*@/, '//***:***@')}`);
  
  const client = new MongoClient(connectionUrl, {
    serverSelectionTimeoutMS: 5000, // 5秒超时
    connectTimeoutMS: 5000,
  });
  
  try {
    console.log('⏳ 正在连接...');
    await client.connect();
    console.log('✅ 连接成功！');
    
    const admin = client.db().admin();
    
    // 检查服务器信息
    try {
      const serverStatus = await admin.command({ serverStatus: 1 });
      console.log('\n📊 MongoDB 服务器信息:');
      console.log(`   版本: ${serverStatus.version}`);
      console.log(`   运行时间: ${Math.floor(serverStatus.uptime / 3600)} 小时`);
    } catch (error) {
      console.log('⚠️  无法获取服务器状态:', error.message);
    }
    
    // 检查副本集状态
    try {
      const replSetStatus = await admin.command({ replSetGetStatus: 1 });
      console.log('\n✅ 副本集已配置:');
      console.log(`   名称: ${replSetStatus.set}`);
      console.log(`   成员数: ${replSetStatus.members.length}`);
      const primary = replSetStatus.members.find(m => m.stateStr === 'PRIMARY');
      if (primary) {
        console.log(`   主节点: ${primary.name}`);
      }
      console.log('\n✅ 副本集已初始化，可以正常使用 Prisma！');
    } catch (error) {
      if (error.codeName === 'NotYetInitialized') {
        console.log('\n⚠️  副本集未初始化');
        console.log('   请运行: node init-replica-set.js');
      } else if (error.codeName === 'NoReplicationEnabled') {
        console.log('\n❌ MongoDB 未启用副本集');
        console.log('   请先配置 MongoDB 启用副本集：');
        console.log('   1. 编辑 mongod.cfg，添加:');
        console.log('      replication:');
        console.log('        replSetName: rs0');
        console.log('   2. 重启 MongoDB 服务');
        console.log('   3. 运行: node init-replica-set.js');
      } else {
        console.log('\n⚠️  无法获取副本集状态:', error.message);
        console.log('   错误代码:', error.codeName);
      }
    }
    
    // 测试基本操作
    try {
      const db = client.db('todo');
      const collections = await db.listCollections().toArray();
      console.log('\n📁 数据库集合:');
      if (collections.length > 0) {
        collections.forEach(col => {
          console.log(`   - ${col.name}`);
        });
      } else {
        console.log('   (暂无集合)');
      }
    } catch (error) {
      console.log('\n⚠️  无法列出集合:', error.message);
    }
    
  } catch (error) {
    console.error('\n❌ 连接失败:', error.message);
    console.error('   错误代码:', error.codeName || error.code);
    
    if (error.message.includes('timeout')) {
      console.log('\n💡 可能的解决方案:');
      console.log('   1. 检查 MongoDB 服务是否正在运行');
      console.log('   2. 检查端口 27017 是否被占用');
      console.log('   3. 检查防火墙设置');
      console.log('   4. 检查连接字符串是否正确');
    }
    
    process.exit(1);
  } finally {
    await client.close();
    console.log('\n✅ 检查完成');
  }
}

checkMongoDBStatus();


import { PrismaClient, Priority, Category } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 开始播种数据...\n');

  await prisma.todo.deleteMany({});
  await prisma.todoList.deleteMany({});
  console.log('✅ 数据清空完成\n');

  const userId1 = 'user001';
  const userId2 = 'user002';

  console.log('📋 创建 Todo 列表...');
  const lists = await Promise.all([
    prisma.todoList.create({
      data: {
        name: '工作待办',
        description: '工作中的重要任务',
        userId: userId1,
        category: Category.WORK,
        color: '#e74c3c',
      },
    }),
    prisma.todoList.create({
      data: {
        name: '个人事务',
        description: '个人生活相关',
        userId: userId1,
        category: Category.PERSONAL,
        color: '#3498db',
      },
    }),
    prisma.todoList.create({
      data: {
        name: '购物清单',
        description: '需要购买的物品',
        userId: userId1,
        category: Category.SHOPPING,
        color: '#2ecc71',
      },
    }),
    prisma.todoList.create({
      data: {
        name: '学习计划',
        description: '学习 MongoDB',
        userId: userId2,
        category: Category.PERSONAL,
        color: '#9b59b6',
      },
    }),
  ]);
  console.log(`✅ 创建了 ${lists.length} 个 Todo 列表\n`);

  console.log('📝 创建 Todos...');
  const todos = await Promise.all([
    prisma.todo.create({
      data: {
        title: '完成项目报告',
        description: '编写项目进度报告并提交给经理',
        completed: false,
        priority: Priority.HIGH,
        tags: ['工作', '重要'],
        userId: userId1,
        dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      },
    }),
    prisma.todo.create({
      data: {
        title: '参加团队会议',
        description: '每周例会，讨论项目进展',
        completed: true,
        priority: Priority.MEDIUM,
        tags: ['工作', '会议'],
        userId: userId1,
        dueDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      },
    }),
    prisma.todo.create({
      data: {
        title: '学习 MongoDB 聚合管道',
        description: '深入学习 MongoDB 的聚合管道功能',
        completed: false,
        priority: Priority.HIGH,
        tags: ['学习', 'MongoDB'],
        userId: userId1,
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    }),
    prisma.todo.create({
      data: {
        title: '购买 groceries',
        description: '牛奶、面包、鸡蛋、水果',
        completed: false,
        priority: Priority.MEDIUM,
        tags: ['购物', '生活'],
        userId: userId1,
        dueDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
      },
    }),
    prisma.todo.create({
      data: {
        title: '锻炼身体',
        description: '去健身房锻炼1小时',
        completed: false,
        priority: Priority.LOW,
        tags: ['健康', '运动'],
        userId: userId1,
      },
    }),
    prisma.todo.create({
      data: {
        title: '完成 MongoDB 教程学习',
        description: '学习完所有章节并完成练习',
        completed: false,
        priority: Priority.HIGH,
        tags: ['学习', 'MongoDB'],
        userId: userId2,
        dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      },
    }),
    prisma.todo.create({
      data: {
        title: '创建 Todo 管理系统',
        description: '使用 NestJS + Prisma + MongoDB 构建',
        completed: true,
        priority: Priority.HIGH,
        tags: ['项目', 'MongoDB', 'NestJS'],
        userId: userId2,
        dueDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      },
    }),
    prisma.todo.create({
      data: {
        title: '阅读技术文档',
        description: '阅读 Prisma 官方文档',
        completed: false,
        priority: Priority.MEDIUM,
        tags: ['学习', '文档'],
        userId: userId2,
      },
    }),
  ]);
  console.log(`✅ 创建了 ${todos.length} 个 Todo 项\n`);

  console.log('📊 数据统计:');
  const todoCount = await prisma.todo.count();
  const completedCount = await prisma.todo.count({ where: { completed: true } });
  const pendingCount = await prisma.todo.count({ where: { completed: false } });
  const listCount = await prisma.todoList.count();

  console.log(`  - Todos 总数: ${todoCount}`);
  console.log(`  - 已完成: ${completedCount}`);
  console.log(`  - 待完成: ${pendingCount}`);
  console.log(`  - Todo 列表总数: ${listCount}\n`);

  console.log('✅ 数据播种完成！');
}

main()
  .catch((e) => {
    console.error('❌ 播种失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


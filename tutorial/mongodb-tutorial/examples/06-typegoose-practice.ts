/**
 * Typegoose 实践示例
 * 
 * 这个示例展示了如何在 TypeScript 项目中使用 Typegoose
 * 基于您的项目结构（MidwayJS + Typegoose）
 * 
 * 运行方式：需要配置 TypeScript 环境
 */

import { Provide, Inject } from "@midwayjs/decorator";
import { InjectEntityModel } from "@midwayjs/typegoose";
import { ReturnModelType, Prop, Ref } from "@typegoose/typegoose";
import { EntityModel } from "@midwayjs/typegoose";

// ==================== 模型定义 ====================

/**
 * 用户模型
 */
@EntityModel()
export class User {
  @Prop({ required: true, type: () => String })
  public name: string;

  @Prop({ required: true, unique: true, type: () => String })
  public email: string;

  @Prop({ type: () => Number, min: 0, max: 150 })
  public age?: number;

  @Prop({ type: () => String, enum: ["active", "inactive", "pending"], default: "active" })
  public status: string;

  @Prop({ type: () => Number, default: 0 })
  public score: number;

  @Prop({ type: () => [String] })
  public hobbies: string[];

  @Prop({ type: () => Date, default: Date.now })
  public createdAt: Date;

  @Prop({ type: () => Date, default: Date.now })
  public updatedAt: Date;
}

/**
 * 订单模型（引用用户）
 */
@EntityModel()
export class Order {
  @Prop({ ref: () => User, required: true })
  public userId: Ref<User>;

  @Prop({ type: () => Number, required: true })
  public amount: number;

  @Prop({ type: () => String, enum: ["completed", "pending", "cancelled"], default: "pending" })
  public status: string;

  @Prop({ type: () => Date, default: Date.now })
  public createdAt: Date;
}

// ==================== Service 示例 ====================

@Provide()
export class UserService {
  @InjectEntityModel(User)
  userModel: ReturnModelType<typeof User>;

  /**
   * 创建用户
   */
  async createUser(userData: Partial<User>): Promise<User> {
    try {
      const user = await this.userModel.create(userData);
      return user;
    } catch (error: any) {
      if (error.code === 11000) {
        throw new Error("邮箱已存在");
      }
      throw error;
    }
  }

  /**
   * 根据 ID 查找用户
   */
  async findUserById(id: string): Promise<User | null> {
    return await this.userModel.findById(id);
  }

  /**
   * 根据邮箱查找用户
   */
  async findUserByEmail(email: string): Promise<User | null> {
    return await this.userModel.findOne({ email });
  }

  /**
   * 查找所有活跃用户
   */
  async findActiveUsers(): Promise<User[]> {
    return await this.userModel.find({ status: "active" });
  }

  /**
   * 分页查询用户
   */
  async findUsersPaginated(page: number, limit: number) {
    const skip = (page - 1) * limit;
    const [users, total] = await Promise.all([
      this.userModel.find().skip(skip).limit(limit),
      this.userModel.countDocuments()
    ]);

    return {
      users,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  /**
   * 更新用户
   */
  async updateUser(id: string, updateData: Partial<User>): Promise<User | null> {
    return await this.userModel.findByIdAndUpdate(
      id,
      { $set: { ...updateData, updatedAt: new Date() } },
      { new: true, runValidators: true }
    );
  }

  /**
   * 增加用户分数
   */
  async incrementScore(id: string, points: number): Promise<User | null> {
    return await this.userModel.findByIdAndUpdate(
      id,
      { $inc: { score: points } },
      { new: true }
    );
  }

  /**
   * 添加爱好
   */
  async addHobby(id: string, hobby: string): Promise<User | null> {
    return await this.userModel.findByIdAndUpdate(
      id,
      { $addToSet: { hobbies: hobby } },  // $addToSet 避免重复
      { new: true }
    );
  }

  /**
   * 删除用户
   */
  async deleteUser(id: string): Promise<User | null> {
    return await this.userModel.findByIdAndDelete(id);
  }

  /**
   * 统计用户数据
   */
  async getUserStatistics() {
    return await this.userModel.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          avgAge: { $avg: "$age" },
          avgScore: { $avg: "$score" },
          maxScore: { $max: "$score" },
          minScore: { $min: "$score" }
        }
      },
      { $sort: { count: -1 } }
    ]);
  }
}

@Provide()
export class OrderService {
  @InjectEntityModel(Order)
  orderModel: ReturnModelType<typeof Order>;

  @InjectEntityModel(User)
  userModel: ReturnModelType<typeof User>;

  /**
   * 创建订单
   */
  async createOrder(orderData: Partial<Order>): Promise<Order> {
    return await this.orderModel.create(orderData);
  }

  /**
   * 查找用户的订单（带用户信息）
   */
  async findUserOrders(userId: string) {
    return await this.orderModel
      .find({ userId })
      .populate("userId")
      .sort({ createdAt: -1 });
  }

  /**
   * 统计用户订单
   */
  async getUserOrderStats(userId: string) {
    return await this.orderModel.aggregate([
      { $match: { userId: userId as any } },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          totalAmount: { $sum: "$amount" },
          avgAmount: { $avg: "$amount" }
        }
      }
    ]);
  }
}

// ==================== 使用示例 ====================

/**
 * 使用示例（在 Controller 或其他 Service 中）
 */
export class ExampleUsage {
  @Inject()
  userService: UserService;

  @Inject()
  orderService: OrderService;

  async example() {
    // 1. 创建用户
    const user = await this.userService.createUser({
      name: "张三",
      email: "zhangsan@example.com",
      age: 25,
      hobbies: ["读书", "游泳"]
    });

    // 2. 查找用户
    const foundUser = await this.userService.findUserById(user._id.toString());

    // 3. 更新用户
    await this.userService.updateUser(user._id.toString(), {
      age: 26,
      score: 85
    });

    // 4. 增加分数
    await this.userService.incrementScore(user._id.toString(), 10);

    // 5. 添加爱好
    await this.userService.addHobby(user._id.toString(), "编程");

    // 6. 创建订单
    const order = await this.orderService.createOrder({
      userId: user._id,
      amount: 1000,
      status: "completed"
    });

    // 7. 查找用户订单
    const orders = await this.orderService.findUserOrders(user._id.toString());

    // 8. 统计
    const stats = await this.userService.getUserStatistics();
    console.log("用户统计:", stats);
  }
}

// ==================== 基于项目的实际案例 ====================

/**
 * 基于您的 lottery-resource-service.ts 的改进示例
 */
@Provide()
export class ImprovedLotteryResourceService {
  @InjectEntityModel(LotteryResource)
  lotteryResourceDao: ReturnModelType<typeof LotteryResource>;

  /**
   * 资源随机筛选（改进版）
   */
  async draw(params: {
    startDate: Date;
    limitDate: Date;
    num: number;
    resourceTagName: string;
  }) {
    // 构建查询条件
    const condition = {
      $and: [
        { resourceCreateDate: { $gte: params.startDate } },
        { resourceCreateDate: { $lte: params.limitDate } },
        { resourceTagName: params.resourceTagName }
      ]
    };

    // 查询已筛选的资源
    const excludeResources = await this.lotteryResourceDao.find(
      condition,
      { resourceId: 1, _id: 0 }
    ).lean();  // 使用 lean() 提高性能

    const excludeResourceIds = excludeResources.map(r => r.resourceId);

    // ... 其他业务逻辑 ...

    // 批量创建（使用 insertMany 提高性能）
    if (lotteryResources.length > 0) {
      return await this.lotteryResourceDao.insertMany(lotteryResources);
    }
    return [];
  }

  /**
   * 分页列表（改进版）
   */
  async list(
    startDate: Date,
    limitDate: Date,
    skipSize: number,
    pageSize: number,
    resourceTagName: string
  ) {
    const condition = {
      $and: [
        { resourceCreateDate: { $gte: startDate } },
        { resourceCreateDate: { $lte: limitDate } },
        { resourceTagName: resourceTagName }
      ]
    };

    // 使用 Promise.all 并行查询
    const [lotteryResources, total] = await Promise.all([
      this.lotteryResourceDao
        .find(condition)
        .sort({ resourceCreateDate: 1 })
        .skip(skipSize)
        .limit(pageSize)
        .lean(),  // 只读查询使用 lean()
      this.lotteryResourceDao.countDocuments(condition)
    ]);

    return {
      num: total,
      lotteryResources,
      page: Math.floor(skipSize / pageSize) + 1,
      pageSize,
      totalPages: Math.ceil(total / pageSize)
    };
  }

  /**
   * 批量更新（改进版）
   */
  async updateTag(params: { ids: string[]; tag: number }) {
    if (params.ids.length === 0) {
      return { modifiedCount: 0 };
    }

    return await this.lotteryResourceDao.updateMany(
      { _id: { $in: params.ids } },
      { $set: { tag: params.tag } }
    );
  }

  /**
   * 统计查询（新增）
   */
  async getStatistics(resourceTagName: string, startDate: Date, limitDate: Date) {
    return await this.lotteryResourceDao.aggregate([
      {
        $match: {
          $and: [
            { resourceCreateDate: { $gte: startDate } },
            { resourceCreateDate: { $lte: limitDate } },
            { resourceTagName: resourceTagName }
          ]
        }
      },
      {
        $group: {
          _id: "$tag",
          count: { $sum: 1 },
          resourceIds: { $push: "$resourceId" }
        }
      },
      { $sort: { _id: 1 } }
    ]);
  }
}


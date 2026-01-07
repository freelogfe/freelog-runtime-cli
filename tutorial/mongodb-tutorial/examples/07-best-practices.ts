/**
 * MongoDB 最佳实践示例
 * 
 * 展示实际项目中的最佳实践和常见问题的解决方案
 */

import { Provide, Inject } from "@midwayjs/decorator";
import { InjectEntityModel } from "@midwayjs/typegoose";
import { ReturnModelType, Prop } from "@typegoose/typegoose";
import { EntityModel } from "@midwayjs/typegoose";
import { Types } from "mongoose";
import moment from "moment";

// ==================== 最佳实践模型 ====================

/**
 * 基础模型（包含通用字段）
 */
@EntityModel()
export class BaseModel {
  @Prop({ type: () => Date, default: Date.now })
  public createdAt: Date;

  @Prop({ type: () => Date, default: Date.now })
  public updatedAt: Date;

  @Prop({ type: () => Boolean, default: false })
  public isDeleted: boolean;

  @Prop({ type: () => Date })
  public deletedAt?: Date;
}

/**
 * 用户模型（带软删除）
 */
@EntityModel()
export class User extends BaseModel {
  @Prop({ required: true, type: () => String, index: true })
  public name: string;

  @Prop({
    required: true,
    unique: true,
    type: () => String,
    validate: {
      validator: (v: string) => {
        return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(v);
      },
      message: "邮箱格式不正确"
    }
  })
  public email: string;

  @Prop({ type: () => Number, min: 0, max: 150 })
  public age?: number;

  @Prop({ type: () => String, enum: ["active", "inactive"], default: "active", index: true })
  public status: string;
}

// ==================== Service 最佳实践 ====================

@Provide()
export class UserServiceBestPractices {
  @InjectEntityModel(User)
  userModel: ReturnModelType<typeof User>;

  /**
   * 1. 统一错误处理
   */
  async createUser(userData: Partial<User>): Promise<User> {
    try {
      return await this.userModel.create(userData);
    } catch (error: any) {
      this.handleDatabaseError(error);
      throw error;  // 重新抛出以便上层处理
    }
  }

  /**
   * 统一错误处理方法
   */
  private handleDatabaseError(error: any): void {
    if (error.code === 11000) {
      // 唯一索引冲突
      const field = Object.keys(error.keyPattern || {})[0] || "字段";
      throw new Error(`${field} 已存在`);
    }

    if (error.name === "ValidationError") {
      // 验证错误
      const messages = Object.values(error.errors || {}).map(
        (e: any) => e.message
      );
      throw new Error(messages.join(", "));
    }

    if (error.name === "CastError") {
      throw new Error("无效的 ID 格式");
    }
  }

  /**
   * 2. 软删除查询（自动排除已删除）
   */
  async findActiveUsers(): Promise<User[]> {
    return await this.userModel.find({
      isDeleted: false,
      status: "active"
    });
  }

  /**
   * 3. 软删除
   */
  async softDeleteUser(id: string): Promise<User | null> {
    return await this.userModel.findByIdAndUpdate(
      id,
      {
        $set: {
          isDeleted: true,
          deletedAt: new Date(),
          updatedAt: new Date()
        }
      },
      { new: true }
    );
  }

  /**
   * 4. 使用投影减少数据传输
   */
  async findUserNames(): Promise<Array<{ name: string; email: string }>> {
    return await this.userModel.find(
      { isDeleted: false },
      { name: 1, email: 1, _id: 0 }
    ).lean();
  }

  /**
   * 5. 使用 lean() 提高只读查询性能
   */
  async findUsersForList(): Promise<User[]> {
    return await this.userModel
      .find({ isDeleted: false })
      .lean();  // 返回纯 JavaScript 对象，性能更好
  }

  /**
   * 6. 基于游标的分页（大数据集推荐）
   */
  async findUsersCursor(lastId?: string, limit: number = 10) {
    const query: any = { isDeleted: false };
    
    if (lastId && Types.ObjectId.isValid(lastId)) {
      query._id = { $gt: new Types.ObjectId(lastId) };
    }

    const users = await this.userModel
      .find(query)
      .sort({ _id: 1 })
      .limit(limit)
      .lean();

    return {
      users,
      lastId: users.length > 0 ? users[users.length - 1]._id.toString() : null,
      hasMore: users.length === limit
    };
  }

  /**
   * 7. 基于 skip/limit 的分页（小数据集）
   */
  async findUsersPaginated(page: number, pageSize: number) {
    const skip = (page - 1) * pageSize;
    
    const [users, total] = await Promise.all([
      this.userModel
        .find({ isDeleted: false })
        .skip(skip)
        .limit(pageSize)
        .lean(),
      this.userModel.countDocuments({ isDeleted: false })
    ]);

    return {
      users,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize)
      }
    };
  }

  /**
   * 8. 日期范围查询（使用 moment）
   */
  async findUsersByDateRange(startDate: string, endDate: string) {
    const start = moment(startDate).startOf("day").toDate();
    const end = moment(endDate).endOf("day").toDate();

    return await this.userModel.find({
      createdAt: {
        $gte: start,
        $lte: end
      },
      isDeleted: false
    }).lean();
  }

  /**
   * 9. 批量操作
   */
  async batchUpdateStatus(userIds: string[], status: string) {
    if (userIds.length === 0) {
      return { modifiedCount: 0 };
    }

    // 验证所有 ID 格式
    const validIds = userIds.filter(id => Types.ObjectId.isValid(id));
    
    if (validIds.length === 0) {
      throw new Error("没有有效的用户 ID");
    }

    return await this.userModel.updateMany(
      {
        _id: { $in: validIds.map(id => new Types.ObjectId(id)) },
        isDeleted: false
      },
      {
        $set: {
          status,
          updatedAt: new Date()
        }
      }
    );
  }

  /**
   * 10. 使用聚合管道代替多次查询
   */
  async getUserStatistics() {
    return await this.userModel.aggregate([
      { $match: { isDeleted: false } },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          avgAge: { $avg: "$age" }
        }
      },
      { $sort: { count: -1 } }
    ]);
  }

  /**
   * 11. 防止 NoSQL 注入
   */
  async findUserByName(name: string): Promise<User[]> {
    // 验证和清理输入
    const cleanName = String(name || "").trim();
    
    if (cleanName.length === 0) {
      throw new Error("名称不能为空");
    }

    // 使用精确匹配或参数化查询
    return await this.userModel.find({
      name: cleanName,
      isDeleted: false
    }).lean();
  }

  /**
   * 12. 字段级别权限控制
   */
  async findUserForPublic(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new Error("无效的用户 ID");
    }

    return await this.userModel.findById(
      id,
      {
        password: 0,  // 排除敏感字段
        email: 0,
        _id: 0
      }
    ).lean();
  }

  /**
   * 13. 数组操作
   */
  async addUserTag(userId: string, tag: string): Promise<User | null> {
    return await this.userModel.findByIdAndUpdate(
      userId,
      {
        $addToSet: { tags: tag },  // 避免重复
        $set: { updatedAt: new Date() }
      },
      { new: true }
    );
  }

  async removeUserTag(userId: string, tag: string): Promise<User | null> {
    return await this.userModel.findByIdAndUpdate(
      userId,
      {
        $pull: { tags: tag },
        $set: { updatedAt: new Date() }
      },
      { new: true }
    );
  }

  /**
   * 14. 条件更新（原子操作）
   */
  async incrementScoreIfActive(userId: string, points: number): Promise<User | null> {
    return await this.userModel.findOneAndUpdate(
      {
        _id: userId,
        status: "active",
        isDeleted: false
      },
      {
        $inc: { score: points },
        $set: { updatedAt: new Date() }
      },
      { new: true }
    );
  }

  /**
   * 15. 使用索引提示
   */
  async findUsersWithIndexHint() {
    // 注意：Mongoose/Typegoose 不直接支持 hint，需要在原生查询中使用
    // 这里展示概念
    return await this.userModel
      .find({ status: "active" })
      .hint({ status: 1, createdAt: -1 })  // 提示使用特定索引
      .lean();
  }
}

// ==================== 性能优化示例 ====================

@Provide()
export class PerformanceOptimization {
  @InjectEntityModel(User)
  userModel: ReturnModelType<typeof User>;

  /**
   * 优化前：N+1 查询问题
   */
  async findUsersWithOrdersBad(userIds: string[]) {
    const users = await this.userModel.find({ _id: { $in: userIds } });
    
    // ❌ 差：循环查询（N+1 问题）
    for (const user of users) {
      // const orders = await orderModel.find({ userId: user._id });
      // user.orders = orders;
    }
    
    return users;
  }

  /**
   * 优化后：使用聚合管道
   */
  async findUsersWithOrdersGood(userIds: string[]) {
    // ✅ 好：一次查询获取所有数据
    return await this.userModel.aggregate([
      { $match: { _id: { $in: userIds.map(id => new Types.ObjectId(id)) } } },
      {
        $lookup: {
          from: "orders",
          localField: "_id",
          foreignField: "userId",
          as: "orders"
        }
      }
    ]);
  }

  /**
   * 批量插入优化
   */
  async batchCreateUsers(usersData: Partial<User>[]) {
    // ✅ 使用 insertMany 而不是循环 create
    if (usersData.length === 0) {
      return [];
    }

    // 分批插入（避免单次插入过多）
    const batchSize = 1000;
    const results = [];

    for (let i = 0; i < usersData.length; i += batchSize) {
      const batch = usersData.slice(i, i + batchSize);
      const result = await this.userModel.insertMany(batch);
      results.push(...result);
    }

    return results;
  }
}


/**
 * Todo Service
 * 提供 Todo 相关的业务逻辑
 */

import { Provide, Inject } from "@midwayjs/decorator";
import { InjectEntityModel } from "@midwayjs/typegoose";
import { ReturnModelType } from "@typegoose/typegoose";
import { Todo, TodoList } from "./todo.model";
import { Types } from "mongoose";

@Provide()
export class TodoService {
  @InjectEntityModel(Todo)
  todoModel: ReturnModelType<typeof Todo>;

  /**
   * 创建 Todo
   */
  async createTodo(todoData: Partial<Todo>): Promise<Todo> {
    const todo = await this.todoModel.create({
      ...todoData,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    return todo;
  }

  /**
   * 根据 ID 查找 Todo
   */
  async findTodoById(id: string): Promise<Todo | null> {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }
    return await this.todoModel.findOne({
      _id: id,
      isDeleted: false
    });
  }

  /**
   * 查找用户的 Todos
   */
  async findTodosByUser(userId: string, filters?: {
    completed?: boolean;
    priority?: string;
    tag?: string;
  }): Promise<Todo[]> {
    const query: any = {
      userId,
      isDeleted: false
    };

    if (filters?.completed !== undefined) {
      query.completed = filters.completed;
    }

    if (filters?.priority) {
      query.priority = filters.priority;
    }

    if (filters?.tag) {
      query.tags = filters.tag;
    }

    return await this.todoModel
      .find(query)
      .sort({ createdAt: -1 })
      .lean();
  }

  /**
   * 更新 Todo
   */
  async updateTodo(id: string, updateData: Partial<Todo>): Promise<Todo | null> {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }

    return await this.todoModel.findByIdAndUpdate(
      id,
      {
        $set: {
          ...updateData,
          updatedAt: new Date()
        }
      },
      { new: true, runValidators: true }
    );
  }

  /**
   * 切换完成状态
   */
  async toggleComplete(id: string): Promise<Todo | null> {
    const todo = await this.findTodoById(id);
    if (!todo) {
      return null;
    }

    return await this.updateTodo(id, { completed: !todo.completed });
  }

  /**
   * 添加标签
   */
  async addTag(id: string, tag: string): Promise<Todo | null> {
    return await this.todoModel.findByIdAndUpdate(
      id,
      {
        $addToSet: { tags: tag },
        $set: { updatedAt: new Date() }
      },
      { new: true }
    );
  }

  /**
   * 移除标签
   */
  async removeTag(id: string, tag: string): Promise<Todo | null> {
    return await this.todoModel.findByIdAndUpdate(
      id,
      {
        $pull: { tags: tag },
        $set: { updatedAt: new Date() }
      },
      { new: true }
    );
  }

  /**
   * 软删除 Todo
   */
  async deleteTodo(id: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(id)) {
      return false;
    }

    const result = await this.todoModel.findByIdAndUpdate(
      id,
      {
        $set: {
          isDeleted: true,
          deletedAt: new Date(),
          updatedAt: new Date()
        }
      }
    );

    return !!result;
  }

  /**
   * 永久删除 Todo
   */
  async permanentDelete(id: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(id)) {
      return false;
    }

    const result = await this.todoModel.findByIdAndDelete(id);
    return !!result;
  }

  /**
   * 统计用户的 Todo
   */
  async getTodoStatistics(userId: string) {
    return await this.todoModel.aggregate([
      {
        $match: {
          userId,
          isDeleted: false
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          completed: {
            $sum: { $cond: [{ $eq: ["$completed", true] }, 1, 0] }
          },
          pending: {
            $sum: { $cond: [{ $eq: ["$completed", false] }, 1, 0] }
          },
          highPriority: {
            $sum: { $cond: [{ $eq: ["$priority", "high"] }, 1, 0] }
          },
          byPriority: {
            $push: "$priority"
          }
        }
      },
      {
        $project: {
          _id: 0,
          total: 1,
          completed: 1,
          pending: 1,
          highPriority: 1,
          completionRate: {
            $multiply: [
              { $divide: ["$completed", "$total"] },
              100
            ]
          }
        }
      }
    ]);
  }

  /**
   * 查找即将到期的 Todos
   */
  async findUpcomingTodos(userId: string, days: number = 7): Promise<Todo[]> {
    const today = new Date();
    const futureDate = new Date();
    futureDate.setDate(today.getDate() + days);

    return await this.todoModel
      .find({
        userId,
        isDeleted: false,
        completed: false,
        dueDate: {
          $gte: today,
          $lte: futureDate
        }
      })
      .sort({ dueDate: 1 })
      .lean();
  }

  /**
   * 搜索 Todos
   */
  async searchTodos(userId: string, keyword: string): Promise<Todo[]> {
    return await this.todoModel
      .find({
        userId,
        isDeleted: false,
        $or: [
          { title: { $regex: keyword, $options: "i" } },
          { description: { $regex: keyword, $options: "i" } },
          { tags: { $in: [new RegExp(keyword, "i")] } }
        ]
      })
      .sort({ createdAt: -1 })
      .lean();
  }
}

@Provide()
export class TodoListService {
  @InjectEntityModel(TodoList)
  todoListModel: ReturnModelType<typeof TodoList>;

  /**
   * 创建 Todo 列表
   */
  async createList(listData: Partial<TodoList>): Promise<TodoList> {
    return await this.todoListModel.create({
      ...listData,
      createdAt: new Date(),
      updatedAt: new Date()
    });
  }

  /**
   * 查找用户的所有列表
   */
  async findListsByUser(userId: string): Promise<TodoList[]> {
    return await this.todoListModel
      .find({ userId })
      .sort({ createdAt: -1 })
      .lean();
  }

  /**
   * 更新列表
   */
  async updateList(id: string, updateData: Partial<TodoList>): Promise<TodoList | null> {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }

    return await this.todoListModel.findByIdAndUpdate(
      id,
      {
        $set: {
          ...updateData,
          updatedAt: new Date()
        }
      },
      { new: true }
    );
  }

  /**
   * 删除列表
   */
  async deleteList(id: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(id)) {
      return false;
    }

    const result = await this.todoListModel.findByIdAndDelete(id);
    return !!result;
  }
}


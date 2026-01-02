/**
 * Todo 模型定义
 * 小型 Todo 管理系统的数据模型
 */

import { EntityModel } from "@midwayjs/typegoose";
import { Prop } from "@typegoose/typegoose";

/**
 * Todo 项模型
 */
@EntityModel()
export class Todo {
  @Prop({ required: true, type: () => String })
  public title: string;

  @Prop({ type: () => String })
  public description?: string;

  @Prop({ type: () => Boolean, default: false })
  public completed: boolean;

  @Prop({ type: () => String, enum: ["low", "medium", "high"], default: "medium" })
  public priority: string;

  @Prop({ type: () => [String], default: [] })
  public tags: string[];

  @Prop({ type: () => String })
  public userId?: string;

  @Prop({ type: () => Date })
  public dueDate?: Date;

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
 * Todo 列表模型（用于分组）
 */
@EntityModel()
export class TodoList {
  @Prop({ required: true, type: () => String })
  public name: string;

  @Prop({ type: () => String })
  public description?: string;

  @Prop({ type: () => String })
  public userId?: string;

  @Prop({ type: () => String, enum: ["personal", "work", "shopping", "other"], default: "personal" })
  public category: string;

  @Prop({ type: () => String, default: "#3498db" })
  public color: string;

  @Prop({ type: () => Date, default: Date.now })
  public createdAt: Date;

  @Prop({ type: () => Date, default: Date.now })
  public updatedAt: Date;
}


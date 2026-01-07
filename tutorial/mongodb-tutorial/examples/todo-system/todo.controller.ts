/**
 * Todo Controller
 * 提供 Todo 相关的 HTTP 接口
 */

import { Controller, Get, Post, Put, Del, Body, Param, Query } from "@midwayjs/decorator";
import { Inject } from "@midwayjs/decorator";
import { TodoService, TodoListService } from "./todo.service";
import { Todo, TodoList } from "./todo.model";

@Controller("/api/todos")
export class TodoController {
  @Inject()
  todoService: TodoService;

  /**
   * 创建 Todo
   * POST /api/todos
   */
  @Post("/")
  async createTodo(@Body() todoData: Partial<Todo>) {
    const todo = await this.todoService.createTodo(todoData);
    return {
      success: true,
      data: todo
    };
  }

  /**
   * 获取用户的 Todos
   * GET /api/todos?userId=xxx&completed=true&priority=high
   */
  @Get("/")
  async getTodos(@Query("userId") userId: string, @Query() filters: any) {
    const todos = await this.todoService.findTodosByUser(userId, filters);
    return {
      success: true,
      data: todos,
      count: todos.length
    };
  }

  /**
   * 根据 ID 获取 Todo
   * GET /api/todos/:id
   */
  @Get("/:id")
  async getTodoById(@Param("id") id: string) {
    const todo = await this.todoService.findTodoById(id);
    if (!todo) {
      return {
        success: false,
        message: "Todo 不存在"
      };
    }
    return {
      success: true,
      data: todo
    };
  }

  /**
   * 更新 Todo
   * PUT /api/todos/:id
   */
  @Put("/:id")
  async updateTodo(@Param("id") id: string, @Body() updateData: Partial<Todo>) {
    const todo = await this.todoService.updateTodo(id, updateData);
    if (!todo) {
      return {
        success: false,
        message: "Todo 不存在"
      };
    }
    return {
      success: true,
      data: todo
    };
  }

  /**
   * 切换完成状态
   * PUT /api/todos/:id/toggle
   */
  @Put("/:id/toggle")
  async toggleComplete(@Param("id") id: string) {
    const todo = await this.todoService.toggleComplete(id);
    if (!todo) {
      return {
        success: false,
        message: "Todo 不存在"
      };
    }
    return {
      success: true,
      data: todo
    };
  }

  /**
   * 添加标签
   * PUT /api/todos/:id/tags
   */
  @Put("/:id/tags")
  async addTag(@Param("id") id: string, @Body() body: { tag: string }) {
    const todo = await this.todoService.addTag(id, body.tag);
    if (!todo) {
      return {
        success: false,
        message: "Todo 不存在"
      };
    }
    return {
      success: true,
      data: todo
    };
  }

  /**
   * 删除标签
   * DEL /api/todos/:id/tags/:tag
   */
  @Del("/:id/tags/:tag")
  async removeTag(@Param("id") id: string, @Param("tag") tag: string) {
    const todo = await this.todoService.removeTag(id, tag);
    if (!todo) {
      return {
        success: false,
        message: "Todo 不存在"
      };
    }
    return {
      success: true,
      data: todo
    };
  }

  /**
   * 删除 Todo（软删除）
   * DEL /api/todos/:id
   */
  @Del("/:id")
  async deleteTodo(@Param("id") id: string) {
    const success = await this.todoService.deleteTodo(id);
    return {
      success,
      message: success ? "删除成功" : "删除失败"
    };
  }

  /**
   * 获取统计信息
   * GET /api/todos/statistics/:userId
   */
  @Get("/statistics/:userId")
  async getStatistics(@Param("userId") userId: string) {
    const stats = await this.todoService.getTodoStatistics(userId);
    return {
      success: true,
      data: stats[0] || {
        total: 0,
        completed: 0,
        pending: 0,
        highPriority: 0,
        completionRate: 0
      }
    };
  }

  /**
   * 查找即将到期的 Todos
   * GET /api/todos/upcoming/:userId?days=7
   */
  @Get("/upcoming/:userId")
  async getUpcomingTodos(@Param("userId") userId: string, @Query("days") days: number = 7) {
    const todos = await this.todoService.findUpcomingTodos(userId, days);
    return {
      success: true,
      data: todos,
      count: todos.length
    };
  }

  /**
   * 搜索 Todos
   * GET /api/todos/search/:userId?keyword=xxx
   */
  @Get("/search/:userId")
  async searchTodos(@Param("userId") userId: string, @Query("keyword") keyword: string) {
    const todos = await this.todoService.searchTodos(userId, keyword);
    return {
      success: true,
      data: todos,
      count: todos.length
    };
  }
}

@Controller("/api/todo-lists")
export class TodoListController {
  @Inject()
  todoListService: TodoListService;

  /**
   * 创建列表
   * POST /api/todo-lists
   */
  @Post("/")
  async createList(@Body() listData: Partial<TodoList>) {
    const list = await this.todoListService.createList(listData);
    return {
      success: true,
      data: list
    };
  }

  /**
   * 获取用户的所有列表
   * GET /api/todo-lists?userId=xxx
   */
  @Get("/")
  async getLists(@Query("userId") userId: string) {
    const lists = await this.todoListService.findListsByUser(userId);
    return {
      success: true,
      data: lists,
      count: lists.length
    };
  }

  /**
   * 更新列表
   * PUT /api/todo-lists/:id
   */
  @Put("/:id")
  async updateList(@Param("id") id: string, @Body() updateData: Partial<TodoList>) {
    const list = await this.todoListService.updateList(id, updateData);
    if (!list) {
      return {
        success: false,
        message: "列表不存在"
      };
    }
    return {
      success: true,
      data: list
    };
  }

  /**
   * 删除列表
   * DEL /api/todo-lists/:id
   */
  @Del("/:id")
  async deleteList(@Param("id") id: string) {
    const success = await this.todoListService.deleteList(id);
    return {
      success,
      message: success ? "删除成功" : "删除失败"
    };
  }
}


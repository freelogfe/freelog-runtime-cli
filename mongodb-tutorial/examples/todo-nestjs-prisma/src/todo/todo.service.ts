import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTodoDto } from './dto/create-todo.dto';
import { UpdateTodoDto } from './dto/update-todo.dto';
import { TodoQueryDto } from './dto/todo-query.dto';
import { Priority, Prisma } from '@prisma/client';

@Injectable()
export class TodoService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createTodoDto: CreateTodoDto) {
    const data: Prisma.TodoCreateInput = {
      title: createTodoDto.title,
      description: createTodoDto.description,
      completed: createTodoDto.completed ?? false,
      priority: createTodoDto.priority ?? Priority.MEDIUM,
      tags: createTodoDto.tags ?? [],
      userId: createTodoDto.userId,
      dueDate: createTodoDto.dueDate ? new Date(createTodoDto.dueDate) : null,
    };

    return await this.prisma.todo.create({
      data,
    });
  }

  async findAll(query: TodoQueryDto) {
    const { userId, completed, priority, tag, keyword, page = 1, limit = 10 } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.TodoWhereInput = {
      isDeleted: false,
    };

    if (userId) {
      where.userId = userId;
    }

    if (completed !== undefined) {
      where.completed = completed;
    }

    if (priority) {
      where.priority = priority;
    }

    if (tag) {
      where.tags = {
        has: tag,
      };
    }

    if (keyword) {
      where.OR = [
        { title: { contains: keyword, mode: 'insensitive' } },
        { description: { contains: keyword, mode: 'insensitive' } },
      ];
    }

    const [todos, total] = await Promise.all([
      this.prisma.todo.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          createdAt: 'desc',
        },
      }),
      this.prisma.todo.count({ where }),
    ]);

    return {
      data: todos,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const todo = await this.prisma.todo.findFirst({
      where: {
        id,
        isDeleted: false,
      },
    });

    if (!todo) {
      throw new NotFoundException(`Todo with ID ${id} not found`);
    }

    return todo;
  }

  async update(id: string, updateTodoDto: UpdateTodoDto) {
    await this.findOne(id);

    const data: Prisma.TodoUpdateInput = {};

    if (updateTodoDto.title !== undefined) {
      data.title = updateTodoDto.title;
    }

    if (updateTodoDto.description !== undefined) {
      data.description = updateTodoDto.description;
    }

    if (updateTodoDto.completed !== undefined) {
      data.completed = updateTodoDto.completed;
    }

    if (updateTodoDto.priority !== undefined) {
      data.priority = updateTodoDto.priority;
    }

    if (updateTodoDto.tags !== undefined) {
      data.tags = updateTodoDto.tags;
    }

    if (updateTodoDto.dueDate !== undefined) {
      data.dueDate = updateTodoDto.dueDate ? new Date(updateTodoDto.dueDate) : null;
    }

    return await this.prisma.todo.update({
      where: { id },
      data,
    });
  }

  async toggleComplete(id: string) {
    const todo = await this.findOne(id);

    return await this.prisma.todo.update({
      where: { id },
      data: {
        completed: !todo.completed,
      },
    });
  }

  async addTag(id: string, tag: string) {
    await this.findOne(id);

    const todo = await this.prisma.todo.findUnique({
      where: { id },
      select: { tags: true },
    });

    if (!todo) {
      throw new NotFoundException(`Todo with ID ${id} not found`);
    }

    const updatedTags = todo.tags.includes(tag) ? todo.tags : [...todo.tags, tag];

    return await this.prisma.todo.update({
      where: { id },
      data: {
        tags: updatedTags,
      },
    });
  }

  async removeTag(id: string, tag: string) {
    await this.findOne(id);

    const todo = await this.prisma.todo.findUnique({
      where: { id },
      select: { tags: true },
    });

    if (!todo) {
      throw new NotFoundException(`Todo with ID ${id} not found`);
    }

    const updatedTags = todo.tags.filter((t) => t !== tag);

    return await this.prisma.todo.update({
      where: { id },
      data: {
        tags: updatedTags,
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);

    return await this.prisma.todo.update({
      where: { id },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
      },
    });
  }

  async permanentDelete(id: string) {
    await this.findOne(id);

    return await this.prisma.todo.delete({
      where: { id },
    });
  }

  async getStatistics(userId: string) {
    const where: Prisma.TodoWhereInput = {
      userId,
      isDeleted: false,
    };

    const [total, completed, pending, highPriority] = await Promise.all([
      this.prisma.todo.count({ where }),
      this.prisma.todo.count({ where: { ...where, completed: true } }),
      this.prisma.todo.count({ where: { ...where, completed: false } }),
      this.prisma.todo.count({ where: { ...where, priority: Priority.HIGH } }),
    ]);

    const completionRate = total > 0 ? (completed / total) * 100 : 0;

    const priorityStats = await this.prisma.todo.groupBy({
      by: ['priority'],
      where,
      _count: {
        priority: true,
      },
    });

    return {
      total,
      completed,
      pending,
      highPriority,
      completionRate: Math.round(completionRate * 100) / 100,
      byPriority: priorityStats.map((stat) => ({
        priority: stat.priority,
        count: stat._count.priority,
      })),
    };
  }

  async findUpcoming(userId: string, days: number = 7) {
    const today = new Date();
    const futureDate = new Date();
    futureDate.setDate(today.getDate() + days);

    return await this.prisma.todo.findMany({
      where: {
        userId,
        isDeleted: false,
        completed: false,
        dueDate: {
          gte: today,
          lte: futureDate,
        },
      },
      orderBy: {
        dueDate: 'asc',
      },
    });
  }

  async search(userId: string, keyword: string) {
    return await this.prisma.todo.findMany({
      where: {
        userId,
        isDeleted: false,
        OR: [
          { title: { contains: keyword, mode: 'insensitive' } },
          { description: { contains: keyword, mode: 'insensitive' } },
          { tags: { has: keyword } },
        ],
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }
}


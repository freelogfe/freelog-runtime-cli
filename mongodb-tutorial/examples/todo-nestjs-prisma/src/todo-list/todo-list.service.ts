import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTodoListDto } from './dto/create-todo-list.dto';
import { UpdateTodoListDto } from './dto/update-todo-list.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class TodoListService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createTodoListDto: CreateTodoListDto) {
    const data: Prisma.TodoListCreateInput = {
      name: createTodoListDto.name,
      description: createTodoListDto.description,
      userId: createTodoListDto.userId,
      category: createTodoListDto.category ?? 'PERSONAL',
      color: createTodoListDto.color ?? '#3498db',
    };

    return await this.prisma.todoList.create({
      data,
    });
  }

  async findAll(userId?: string) {
    const where: Prisma.TodoListWhereInput = {};

    if (userId) {
      where.userId = userId;
    }

    return await this.prisma.todoList.findMany({
      where,
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(id: string) {
    const todoList = await this.prisma.todoList.findUnique({
      where: { id },
    });

    if (!todoList) {
      throw new NotFoundException(`TodoList with ID ${id} not found`);
    }

    return todoList;
  }

  async update(id: string, updateTodoListDto: UpdateTodoListDto) {
    await this.findOne(id);

    const data: Prisma.TodoListUpdateInput = {};

    if (updateTodoListDto.name !== undefined) {
      data.name = updateTodoListDto.name;
    }

    if (updateTodoListDto.description !== undefined) {
      data.description = updateTodoListDto.description;
    }

    if (updateTodoListDto.category !== undefined) {
      data.category = updateTodoListDto.category;
    }

    if (updateTodoListDto.color !== undefined) {
      data.color = updateTodoListDto.color;
    }

    return await this.prisma.todoList.update({
      where: { id },
      data,
    });
  }

  async remove(id: string) {
    await this.findOne(id);

    return await this.prisma.todoList.delete({
      where: { id },
    });
  }
}


import { Module } from '@nestjs/common';
import { TodoListService } from './todo-list.service';
import { TodoListController } from './todo-list.controller';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [TodoListController],
  providers: [TodoListService, PrismaService],
  exports: [TodoListService],
})
export class TodoListModule {}


import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { TodoListService } from './todo-list.service';
import { CreateTodoListDto } from './dto/create-todo-list.dto';
import { UpdateTodoListDto } from './dto/update-todo-list.dto';

@Controller('todo-lists')
export class TodoListController {
  constructor(private readonly todoListService: TodoListService) {}

  @Post()
  create(@Body() createTodoListDto: CreateTodoListDto) {
    return this.todoListService.create(createTodoListDto);
  }

  @Get()
  findAll(@Query('userId') userId?: string) {
    return this.todoListService.findAll(userId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.todoListService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateTodoListDto: UpdateTodoListDto) {
    return this.todoListService.update(id, updateTodoListDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.todoListService.remove(id);
  }
}


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
import { TodoService } from './todo.service';
import { CreateTodoDto } from './dto/create-todo.dto';
import { UpdateTodoDto } from './dto/update-todo.dto';
import { TodoQueryDto } from './dto/todo-query.dto';

@Controller('todos')
export class TodoController {
  constructor(private readonly todoService: TodoService) {}

  @Post()
  create(@Body() createTodoDto: CreateTodoDto) {
    return this.todoService.create(createTodoDto);
  }

  @Get()
  findAll(@Query() query: TodoQueryDto) {
    return this.todoService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.todoService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateTodoDto: UpdateTodoDto) {
    return this.todoService.update(id, updateTodoDto);
  }

  @Patch(':id/toggle')
  toggleComplete(@Param('id') id: string) {
    return this.todoService.toggleComplete(id);
  }

  @Post(':id/tags')
  addTag(@Param('id') id: string, @Body() body: { tag: string }) {
    return this.todoService.addTag(id, body.tag);
  }

  @Delete(':id/tags/:tag')
  removeTag(@Param('id') id: string, @Param('tag') tag: string) {
    return this.todoService.removeTag(id, tag);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.todoService.remove(id);
  }

  @Delete(':id/permanent')
  @HttpCode(HttpStatus.NO_CONTENT)
  permanentDelete(@Param('id') id: string) {
    return this.todoService.permanentDelete(id);
  }

  @Get('statistics/:userId')
  getStatistics(@Param('userId') userId: string) {
    return this.todoService.getStatistics(userId);
  }

  @Get('upcoming/:userId')
  findUpcoming(@Param('userId') userId: string, @Query('days') days?: string) {
    const daysNumber = days ? parseInt(days, 10) : 7;
    return this.todoService.findUpcoming(userId, daysNumber);
  }

  @Get('search/:userId')
  search(@Param('userId') userId: string, @Query('keyword') keyword: string) {
    return this.todoService.search(userId, keyword);
  }
}


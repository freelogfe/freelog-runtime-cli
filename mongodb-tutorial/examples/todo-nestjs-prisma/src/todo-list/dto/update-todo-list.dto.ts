import { IsString, IsOptional, IsEnum } from 'class-validator';
import { Category } from '@prisma/client';

export class UpdateTodoListDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(Category)
  category?: Category;

  @IsOptional()
  @IsString()
  color?: string;
}


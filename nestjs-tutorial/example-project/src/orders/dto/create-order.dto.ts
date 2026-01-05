import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';

export class OrderItemDto {
  @ApiProperty({ example: 1, description: '产品 ID' })
  @IsInt()
  productId: number;

  @ApiProperty({ example: 'iPhone 15', description: '产品名称' })
  @IsString()
  productName: string;

  @ApiProperty({ example: 2, description: '数量' })
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiProperty({ example: 7999.00, description: '单价' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price: number;
}

export class CreateOrderDto {
  @ApiProperty({ type: [OrderItemDto], description: '订单项列表' })
  @IsArray()
  @ArrayMinSize(1, { message: '订单至少需要一个商品' })
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];

  @ApiPropertyOptional({ example: '请尽快发货', description: '备注' })
  @IsOptional()
  @IsString()
  remark?: string;
}


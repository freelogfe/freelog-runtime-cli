import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Request } from 'express';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { QueryOrderDto } from './dto/query-order.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, CurrentUserData } from '../auth/decorators/current-user.decorator';

@ApiTags('订单')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @ApiOperation({ summary: '创建订单' })
  @ApiResponse({ status: 201, description: '订单创建成功' })
  create(
    @Body() createOrderDto: CreateOrderDto,
    @CurrentUser() user: CurrentUserData,
    @Req() req: Request,
  ) {
    return this.ordersService.create(createOrderDto, user.id, {
      ip: req.ip || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
    });
  }

  @Get()
  @ApiOperation({ summary: '获取订单列表' })
  findAll(@Query() query: QueryOrderDto, @CurrentUser() user: CurrentUserData) {
    return this.ordersService.findAll(query, user);
  }

  @Get(':id')
  @ApiOperation({ summary: '获取订单详情' })
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.ordersService.findOne(id, user);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: '更新订单状态' })
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateStatusDto: UpdateOrderStatusDto,
    @CurrentUser() user: CurrentUserData,
    @Req() req: Request,
  ) {
    return this.ordersService.updateStatus(id, updateStatusDto, user, {
      ip: req.ip || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
    });
  }
}


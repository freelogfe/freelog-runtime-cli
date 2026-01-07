import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaMysqlService } from '../prisma/prisma-mysql.service';
import { LogsService } from '../logs/logs.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { QueryOrderDto } from './dto/query-order.dto';
import { CurrentUserData } from '../auth/decorators/current-user.decorator';
import { Prisma } from '../../generated/client-mysql';

interface RequestInfo {
  ip: string;
  userAgent: string;
}

@Injectable()
export class OrdersService {
  constructor(
    private prisma: PrismaMysqlService,
    private logsService: LogsService,
  ) {}

  async create(
    createOrderDto: CreateOrderDto,
    userId: number,
    requestInfo: RequestInfo,
  ) {
    // 计算总价
    const total = createOrderDto.items.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0,
    );

    // 生成订单号
    const orderNo = `ORD${Date.now()}${Math.random().toString(36).substr(2, 4).toUpperCase()}`;

    // 创建订单 (事务)
    const order = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const newOrder = await tx.order.create({
        data: {
          orderNo,
          userId,
          total,
          remark: createOrderDto.remark,
          items: {
            create: createOrderDto.items.map((item) => ({
              productId: item.productId,
              productName: item.productName,
              quantity: item.quantity,
              price: item.price,
            })),
          },
        },
        include: {
          items: true,
        },
      });

      return newOrder;
    });

    // 记录日志到 MongoDB
    await this.logsService.logActivity({
      userId,
      action: 'CREATE',
      resource: 'order',
      resourceId: String(order.id),
      metadata: {
        orderNo: order.orderNo,
        total: Number(order.total),
        itemCount: order.items.length,
      },
      ip: requestInfo.ip,
      userAgent: requestInfo.userAgent,
    });

    return order;
  }

  async findAll(query: QueryOrderDto, user: CurrentUserData) {
    const { page = 1, limit = 10, status } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.OrderWhereInput = {
      AND: [
        // 非管理员只能看自己的订单
        user.role !== 'ADMIN' ? { userId: user.id } : {},
        status ? { status } : {},
      ],
    };

    const [data, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          items: true,
          user: {
            select: { id: true, name: true, email: true },
          },
        },
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: number, user: CurrentUserData) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        items: true,
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (!order) {
      throw new NotFoundException(`订单 #${id} 不存在`);
    }

    // 非管理员只能查看自己的订单
    if (user.role !== 'ADMIN' && order.userId !== user.id) {
      throw new ForbiddenException('无权访问此订单');
    }

    return order;
  }

  async updateStatus(
    id: number,
    updateStatusDto: UpdateOrderStatusDto,
    user: CurrentUserData,
    requestInfo: RequestInfo,
  ) {
    const order = await this.findOne(id, user);

    const updatedOrder = await this.prisma.order.update({
      where: { id },
      data: { status: updateStatusDto.status },
      include: { items: true },
    });

    // 记录状态变更日志
    await this.logsService.logActivity({
      userId: user.id,
      action: 'UPDATE_STATUS',
      resource: 'order',
      resourceId: String(id),
      metadata: {
        orderNo: order.orderNo,
        oldStatus: order.status,
        newStatus: updateStatusDto.status,
      },
      ip: requestInfo.ip,
      userAgent: requestInfo.userAgent,
    });

    return updatedOrder;
  }
}

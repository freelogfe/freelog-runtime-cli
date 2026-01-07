import { Injectable } from '@nestjs/common';
import { PrismaMongoService } from '../prisma/prisma-mongo.service';
import { QueryLogsDto } from './dto/query-logs.dto';
import { CurrentUserData } from '../auth/decorators/current-user.decorator';
import { Prisma } from '../../generated/client-mongo';

interface LogActivityDto {
  userId: number;
  action: string;
  resource: string;
  resourceId?: string;
  metadata?: Record<string, any>;
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class LogsService {
  constructor(private prisma: PrismaMongoService) {}

  async logActivity(data: LogActivityDto) {
    return this.prisma.activityLog.create({
      data: {
        userId: data.userId,
        action: data.action,
        resource: data.resource,
        resourceId: data.resourceId,
        metadata: data.metadata as Prisma.InputJsonValue,
        ip: data.ip,
        userAgent: data.userAgent,
      },
    });
  }

  async findAll(query: QueryLogsDto, user: CurrentUserData) {
    const { page = 1, limit = 20, action, resource, userId } = query;
    const skip = (page - 1) * limit;

    // 构建查询条件
    const where: Prisma.ActivityLogWhereInput = {};

    // 非管理员只能看自己的日志
    if (user.role !== 'ADMIN') {
      where.userId = user.id;
    } else if (userId) {
      where.userId = userId;
    }

    if (action) {
      where.action = action;
    }

    if (resource) {
      where.resource = resource;
    }

    const [data, total] = await Promise.all([
      this.prisma.activityLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { timestamp: 'desc' },
      }),
      this.prisma.activityLog.count({ where }),
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

  async getStats(user: CurrentUserData) {
    const where: Prisma.ActivityLogWhereInput = 
      user.role !== 'ADMIN' ? { userId: user.id } : {};

    // 按操作类型统计
    const actionStats = await this.prisma.activityLog.groupBy({
      by: ['action'],
      where,
      _count: true,
    });

    // 按资源类型统计
    const resourceStats = await this.prisma.activityLog.groupBy({
      by: ['resource'],
      where,
      _count: true,
    });

    // 总数
    const total = await this.prisma.activityLog.count({ where });

    return {
      total,
      byAction: actionStats.map((item: { action: string; _count: number }) => ({
        action: item.action,
        count: item._count,
      })),
      byResource: resourceStats.map((item: { resource: string; _count: number }) => ({
        resource: item.resource,
        count: item._count,
      })),
    };
  }
}

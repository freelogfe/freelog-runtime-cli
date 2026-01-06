import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';
import { LogsService } from '../logs/logs.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

interface RequestInfo {
  ip: string;
  userAgent: string;
}

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private logsService: LogsService,
  ) {}

  async register(registerDto: RegisterDto, requestInfo: RequestInfo) {
    // 检查邮箱是否已存在
    const existingUser = await this.usersService.findByEmail(registerDto.email);
    if (existingUser) {
      throw new ConflictException('邮箱已被注册');
    }

    // 加密密码
    const hashedPassword = await bcrypt.hash(registerDto.password, 10);

    // 创建用户
    const user = await this.usersService.create({
      ...registerDto,
      password: hashedPassword,
    });

    // 记录日志
    await this.logsService.logActivity({
      userId: user.id,
      action: 'REGISTER',
      resource: 'user',
      resourceId: String(user.id),
      metadata: { email: user.email },
      ip: requestInfo.ip,
      userAgent: requestInfo.userAgent,
    });

    // 生成 token
    const token = this.generateToken(user);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      accessToken: token,
    };
  }

  async login(loginDto: LoginDto, requestInfo: RequestInfo) {
    const user = await this.usersService.findByEmail(loginDto.email);

    if (!user) {
      throw new UnauthorizedException('邮箱或密码错误');
    }

    const isPasswordValid = await bcrypt.compare(
      loginDto.password,
      user.password,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('邮箱或密码错误');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('账户已被禁用');
    }

    // 记录登录日志
    await this.logsService.logActivity({
      userId: user.id,
      action: 'LOGIN',
      resource: 'user',
      resourceId: String(user.id),
      ip: requestInfo.ip,
      userAgent: requestInfo.userAgent,
    });

    const token = this.generateToken(user);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      accessToken: token,
    };
  }

  private generateToken(user: { id: number; email: string; role: string }) {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
    return this.jwtService.sign(payload);
  }
}


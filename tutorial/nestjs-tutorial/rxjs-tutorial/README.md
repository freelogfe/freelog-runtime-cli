# RxJS 完全入门教程

从零开始学习 RxJS（Reactive Extensions for JavaScript）。

## 📚 教程目录

1. [什么是 RxJS](./01-what-is-rxjs.md) - 核心概念与思维方式
2. [Observable 基础](./02-observable.md) - 可观察对象
3. [Observer 与 Subscription](./03-observer-subscription.md) - 观察者与订阅
4. [Subject 详解](./04-subject.md) - 多播与热观察
5. [创建操作符](./05-creation-operators.md) - 创建 Observable 的方式
6. [转换操作符](./06-transformation-operators.md) - map、switchMap 等
7. [过滤操作符](./07-filtering-operators.md) - filter、take、debounce 等
8. [组合操作符](./08-combination-operators.md) - merge、concat、forkJoin 等
9. [错误处理](./09-error-handling.md) - catchError、retry 等
10. [实战案例](./10-practical-examples.md) - 真实场景应用

## 🎯 学习目标

- 理解响应式编程的思维方式
- 掌握 Observable 的创建和使用
- 熟练使用常用操作符
- 能够在实际项目中应用 RxJS

## 📋 前置要求

- JavaScript 基础
- 了解 Promise 和 async/await
- Node.js 环境（用于运行示例）

## 🚀 快速开始

```bash
# 创建练习项目
mkdir rxjs-practice
cd rxjs-practice
npm init -y
npm install rxjs typescript ts-node @types/node -D

# 创建 tsconfig.json
npx tsc --init
```

## 一句话理解 RxJS

> **RxJS 就是处理"随时间变化的数据流"的工具库。**

想象一下：
- 用户的点击事件 → 点击流
- HTTP 请求的响应 → 数据流
- WebSocket 消息 → 消息流
- 定时器 → 时间流

RxJS 让你可以像操作数组一样操作这些"流"。

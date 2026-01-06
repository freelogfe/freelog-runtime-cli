# 01. 什么是 RxJS

## 从一个问题开始

假设你要实现一个搜索框：
- 用户输入时实时搜索
- 但不能每按一个键就请求一次（太频繁）
- 要等用户停止输入 300ms 后再搜索
- 如果用户又开始输入，取消上一次搜索
- 搜索失败要重试

用传统方式实现会很复杂，但用 RxJS 只需要几行：

```typescript
import { fromEvent } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap, retry } from 'rxjs/operators';

fromEvent(input, 'input').pipe(
  debounceTime(300),           // 等待 300ms
  distinctUntilChanged(),       // 值没变就不触发
  switchMap(e => search(e)),    // 取消旧请求，发新请求
  retry(3)                      // 失败重试 3 次
).subscribe(results => {
  // 显示搜索结果
});
```

这就是 RxJS 的魅力！

## RxJS 是什么？

**RxJS = Reactive Extensions for JavaScript**

它是一个用于处理**异步数据流**的库。

### 什么是"数据流"？

生活中到处都是数据流：

```
鼠标点击：    --click----click--click------click-->
键盘输入：    --a--b--c----d--e--f-->
网络请求：    ----response1--------response2-->
定时器：      --tick--tick--tick--tick--tick-->
WebSocket：   --msg--msg----msg--msg-->
```

这些都是**随时间产生的一系列数据**，就是数据流。

### 传统方式 vs RxJS

**传统方式**（回调、Promise）：

```typescript
// 处理一个值
promise.then(value => console.log(value));

// 处理多个值？要写很多代码...
let timer = setInterval(() => {
  // 处理
}, 1000);
// 还要记得清理
clearInterval(timer);
```

**RxJS 方式**：

```typescript
// 处理一个值
observable.subscribe(value => console.log(value));

// 处理多个值，一样简单！
interval(1000).subscribe(value => console.log(value));
// 清理也很简单
subscription.unsubscribe();
```

## 核心概念预览

RxJS 只有 4 个核心概念：

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│   Observable ──────> Operators ──────> Observer         │
│   (数据源)           (处理数据)         (接收数据)        │
│                                                         │
│                    Subscription                         │
│                    (订阅关系)                            │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

| 概念 | 比喻 | 作用 |
|------|------|------|
| **Observable** | 水管/电视台 | 产生数据的源头 |
| **Observer** | 水龙头/电视机 | 接收并处理数据 |
| **Operators** | 过滤器/信号处理器 | 转换、过滤数据 |
| **Subscription** | 开关/订阅关系 | 控制数据流的开始和结束 |

## 第一个 RxJS 程序

```typescript
import { Observable } from 'rxjs';

// 1. 创建 Observable（数据源）
const observable = new Observable(subscriber => {
  subscriber.next('Hello');      // 发送数据
  subscriber.next('RxJS');       // 发送数据
  subscriber.next('World');      // 发送数据
  subscriber.complete();         // 完成
});

// 2. 创建 Observer（观察者）
const observer = {
  next: (value) => console.log('收到:', value),
  error: (err) => console.log('错误:', err),
  complete: () => console.log('完成!')
};

// 3. 订阅（连接数据源和观察者）
const subscription = observable.subscribe(observer);

// 输出:
// 收到: Hello
// 收到: RxJS
// 收到: World
// 完成!
```

## 简化写法

实际开发中，我们通常用简化写法：

```typescript
import { of } from 'rxjs';

// of() 是创建 Observable 的快捷方式
of('Hello', 'RxJS', 'World').subscribe({
  next: value => console.log(value),
  complete: () => console.log('Done!')
});

// 更简化：只关心数据
of('Hello', 'RxJS', 'World').subscribe(
  value => console.log(value)
);
```

## RxJS vs Promise 对比

| 特性 | Promise | Observable |
|------|---------|------------|
| 值的数量 | 单个值 | 多个值 |
| 执行时机 | 立即执行 | 订阅时执行（惰性） |
| 可取消 | ❌ 不可取消 | ✅ 可取消 |
| 操作符 | 有限（then、catch） | 丰富（100+ 操作符） |
| 多播 | 默认多播 | 默认单播，可配置 |

### 代码对比

```typescript
// Promise：只能处理一个值
const promise = new Promise(resolve => {
  resolve('只能返回一个值');
});

// Observable：可以处理多个值
const observable = new Observable(subscriber => {
  subscriber.next('第一个值');
  subscriber.next('第二个值');
  subscriber.next('第三个值');
  subscriber.complete();
});
```

```typescript
// Promise：无法取消
const promise = fetch('/api/data');
// 一旦发出，无法取消

// Observable：可以取消
const subscription = observable.subscribe(...);
subscription.unsubscribe(); // 取消订阅
```

## 什么时候用 RxJS？

✅ **适合用 RxJS 的场景**：
- 用户输入（搜索、表单验证）
- HTTP 请求（特别是需要取消、重试的）
- WebSocket 实时数据
- 定时任务
- 事件处理（点击、滚动、拖拽）
- 复杂的异步流程

❌ **不需要 RxJS 的场景**：
- 简单的一次性异步操作（用 Promise 就够了）
- 同步数据处理（用数组方法就够了）

## 小结

1. **RxJS 是处理异步数据流的库**
2. **核心概念**：Observable（数据源）、Observer（观察者）、Operators（操作符）、Subscription（订阅）
3. **优势**：统一的 API 处理各种异步场景，丰富的操作符，可取消

## 下一步

[👉 02. Observable 详解](./02-observable.md)


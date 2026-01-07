# 02. Observable 详解

## 什么是 Observable？

Observable 是**数据的生产者**，它可以：
- 发送多个值（0 个、1 个或多个）
- 发送错误
- 发送完成信号

```
Observable 的生命周期：

时间线 ─────────────────────────────────────────>

        next(1)   next(2)   next(3)   complete()
           │         │         │          │
           ▼         ▼         ▼          ▼
    ───────●─────────●─────────●──────────|───>
           1         2         3       完成

或者出错：

        next(1)   next(2)   error(X)
           │         │         │
           ▼         ▼         ▼
    ───────●─────────●─────────X───>
           1         2       错误
```

## 创建 Observable

### 方式 1：使用构造函数

```typescript
import { Observable } from 'rxjs';

const observable = new Observable(subscriber => {
  // subscriber 是用来发送数据的对象
  subscriber.next(1);        // 发送值 1
  subscriber.next(2);        // 发送值 2
  subscriber.next(3);        // 发送值 3
  subscriber.complete();     // 完成（之后不能再发送）
});
```

### 方式 2：使用创建函数（推荐）

```typescript
import { of, from, interval, fromEvent } from 'rxjs';

// of：从固定值创建
const obs1 = of(1, 2, 3);

// from：从数组/Promise/可迭代对象创建
const obs2 = from([1, 2, 3]);
const obs3 = from(Promise.resolve('hello'));

// interval：定时发送
const obs4 = interval(1000); // 每秒发送 0, 1, 2, 3...

// fromEvent：从事件创建
const obs5 = fromEvent(document, 'click');
```

## Observable 是惰性的

**重要概念**：Observable 在被订阅之前不会执行！

```typescript
const observable = new Observable(subscriber => {
  console.log('开始执行！');  // 这行代码什么时候执行？
  subscriber.next(1);
});

console.log('订阅之前');

// 只有调用 subscribe() 时，Observable 才会执行
observable.subscribe(value => console.log(value));

console.log('订阅之后');

// 输出顺序：
// 订阅之前
// 开始执行！
// 1
// 订阅之后
```

对比 Promise（立即执行）：

```typescript
const promise = new Promise(resolve => {
  console.log('Promise 立即执行！');
  resolve(1);
});

console.log('创建之后');

// 输出顺序：
// Promise 立即执行！
// 创建之后
```

## Observable 的三种通知

```typescript
const observable = new Observable(subscriber => {
  // 1. next：发送数据（可以多次）
  subscriber.next('数据1');
  subscriber.next('数据2');
  
  // 2. complete：完成（只能调用一次，之后不能再发送）
  subscriber.complete();
  
  // 或者
  // 3. error：错误（只能调用一次，之后不能再发送）
  // subscriber.error(new Error('出错了'));
});
```

**规则**：
- `next()` 可以调用 0 次或多次
- `complete()` 和 `error()` 只能调用其中一个，且只能调用一次
- 调用 `complete()` 或 `error()` 后，不能再调用任何方法

```typescript
// 错误示例
const bad = new Observable(subscriber => {
  subscriber.next(1);
  subscriber.complete();
  subscriber.next(2);  // ❌ 不会执行，因为已经 complete 了
});
```

## 同步 vs 异步

Observable 可以同步发送，也可以异步发送：

### 同步发送

```typescript
const syncObservable = new Observable(subscriber => {
  subscriber.next(1);
  subscriber.next(2);
  subscriber.next(3);
  subscriber.complete();
});

console.log('订阅前');
syncObservable.subscribe(v => console.log(v));
console.log('订阅后');

// 输出：
// 订阅前
// 1
// 2
// 3
// 订阅后
```

### 异步发送

```typescript
const asyncObservable = new Observable(subscriber => {
  subscriber.next(1);
  
  setTimeout(() => {
    subscriber.next(2);
    subscriber.complete();
  }, 1000);
});

console.log('订阅前');
asyncObservable.subscribe(v => console.log(v));
console.log('订阅后');

// 输出：
// 订阅前
// 1
// 订阅后
// (1秒后)
// 2
```

## 清理资源

当 Observable 完成或被取消订阅时，可以执行清理逻辑：

```typescript
const observable = new Observable(subscriber => {
  // 设置定时器
  const timer = setInterval(() => {
    subscriber.next('tick');
  }, 1000);

  // 返回清理函数
  return () => {
    console.log('清理资源！');
    clearInterval(timer);  // 清除定时器
  };
});

const subscription = observable.subscribe(v => console.log(v));

// 3 秒后取消订阅
setTimeout(() => {
  subscription.unsubscribe();  // 会调用清理函数
}, 3000);

// 输出：
// tick
// tick
// tick
// 清理资源！
```

## 冷 Observable vs 热 Observable

### 冷 Observable（Cold）

每个订阅者都会得到独立的数据流：

```typescript
import { interval } from 'rxjs';
import { take } from 'rxjs/operators';

const cold$ = interval(1000).pipe(take(3));

// 订阅者 A
cold$.subscribe(v => console.log('A:', v));

// 2 秒后，订阅者 B
setTimeout(() => {
  cold$.subscribe(v => console.log('B:', v));
}, 2000);

// 输出：
// A: 0
// A: 1
// B: 0  ← B 从头开始
// A: 2
// B: 1
// B: 2
```

### 热 Observable（Hot）

所有订阅者共享同一个数据流：

```typescript
import { Subject } from 'rxjs';

const hot$ = new Subject();

// 订阅者 A
hot$.subscribe(v => console.log('A:', v));

hot$.next(1);  // A 收到

// 订阅者 B
hot$.subscribe(v => console.log('B:', v));

hot$.next(2);  // A 和 B 都收到
hot$.next(3);  // A 和 B 都收到

// 输出：
// A: 1
// A: 2
// B: 2  ← B 没收到 1，因为那时还没订阅
// A: 3
// B: 3
```

## 实际例子

### 例1：模拟 HTTP 请求

```typescript
function fetchUser(id: number): Observable<User> {
  return new Observable(subscriber => {
    console.log(`请求用户 ${id}...`);
    
    // 模拟网络请求
    setTimeout(() => {
      if (id > 0) {
        subscriber.next({ id, name: `User ${id}` });
        subscriber.complete();
      } else {
        subscriber.error(new Error('无效的用户 ID'));
      }
    }, 1000);
  });
}

fetchUser(1).subscribe({
  next: user => console.log('用户:', user),
  error: err => console.log('错误:', err.message),
  complete: () => console.log('完成')
});
```

### 例2：监听窗口大小变化

```typescript
import { fromEvent } from 'rxjs';
import { map, debounceTime } from 'rxjs/operators';

const windowSize$ = fromEvent(window, 'resize').pipe(
  debounceTime(300),  // 防抖
  map(() => ({
    width: window.innerWidth,
    height: window.innerHeight
  }))
);

windowSize$.subscribe(size => {
  console.log(`窗口大小: ${size.width} x ${size.height}`);
});
```

## 小结

| 概念 | 说明 |
|------|------|
| Observable | 数据生产者，可发送多个值 |
| 惰性执行 | 只有订阅时才执行 |
| 三种通知 | next（数据）、error（错误）、complete（完成） |
| 清理函数 | 返回函数用于清理资源 |
| 冷/热 | 冷=独立流，热=共享流 |

## 下一步

[👉 03. Observer 与 Subscription](./03-observer-subscription.md)


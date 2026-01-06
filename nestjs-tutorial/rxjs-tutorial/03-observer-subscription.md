# 03. Observer 与 Subscription

## Observer（观察者）

Observer 是**数据的消费者**，它定义了如何处理 Observable 发送的数据。

### Observer 的结构

```typescript
interface Observer<T> {
  next: (value: T) => void;      // 处理数据
  error: (err: any) => void;     // 处理错误
  complete: () => void;          // 处理完成
}
```

### 完整写法

```typescript
import { of } from 'rxjs';

const observable = of(1, 2, 3);

// 完整的 Observer 对象
const observer = {
  next: (value) => console.log('收到:', value),
  error: (err) => console.log('错误:', err),
  complete: () => console.log('完成!')
};

observable.subscribe(observer);

// 输出：
// 收到: 1
// 收到: 2
// 收到: 3
// 完成!
```

### 简化写法

实际开发中，通常使用简化写法：

```typescript
// 只传 next 回调
observable.subscribe(value => console.log(value));

// 传 next 和 error
observable.subscribe({
  next: value => console.log(value),
  error: err => console.error(err)
});

// 传所有回调
observable.subscribe({
  next: value => console.log(value),
  error: err => console.error(err),
  complete: () => console.log('done')
});
```

### 部分 Observer

不需要处理所有通知时，可以只定义需要的回调：

```typescript
// 只关心数据
observable.subscribe({
  next: value => console.log(value)
});

// 只关心错误
observable.subscribe({
  error: err => console.error(err)
});

// 只关心完成
observable.subscribe({
  complete: () => console.log('done')
});
```

## Subscription（订阅）

Subscription 代表 Observable 的一次执行，主要用于**取消订阅**。

### 基本用法

```typescript
import { interval } from 'rxjs';

const observable = interval(1000);

// subscribe() 返回 Subscription
const subscription = observable.subscribe(v => console.log(v));

// 5 秒后取消订阅
setTimeout(() => {
  subscription.unsubscribe();
  console.log('已取消订阅');
}, 5000);

// 输出：
// 0
// 1
// 2
// 3
// 4
// 已取消订阅
```

### 为什么要取消订阅？

不取消订阅会导致**内存泄漏**：

```typescript
// ❌ 错误：组件销毁后，订阅还在执行
class MyComponent {
  ngOnInit() {
    interval(1000).subscribe(v => {
      this.updateUI(v);  // 组件销毁后还在更新，导致错误
    });
  }
}

// ✅ 正确：组件销毁时取消订阅
class MyComponent {
  private subscription: Subscription;

  ngOnInit() {
    this.subscription = interval(1000).subscribe(v => {
      this.updateUI(v);
    });
  }

  ngOnDestroy() {
    this.subscription.unsubscribe();
  }
}
```

### 合并多个 Subscription

```typescript
import { interval, Subscription } from 'rxjs';

const subscription = new Subscription();

// 添加子订阅
subscription.add(
  interval(1000).subscribe(v => console.log('A:', v))
);

subscription.add(
  interval(500).subscribe(v => console.log('B:', v))
);

// 一次性取消所有订阅
setTimeout(() => {
  subscription.unsubscribe();  // A 和 B 都会被取消
}, 3000);
```

### 检查订阅状态

```typescript
const subscription = interval(1000).subscribe(v => console.log(v));

console.log(subscription.closed);  // false

subscription.unsubscribe();

console.log(subscription.closed);  // true
```

## 自动完成的 Observable

有些 Observable 会自动完成，不需要手动取消：

```typescript
import { of, from, ajax } from 'rxjs';

// of：发送完所有值后自动完成
of(1, 2, 3).subscribe({
  next: v => console.log(v),
  complete: () => console.log('自动完成')
});

// from：遍历完数组后自动完成
from([1, 2, 3]).subscribe({
  next: v => console.log(v),
  complete: () => console.log('自动完成')
});

// HTTP 请求：响应后自动完成
ajax('/api/data').subscribe({
  next: response => console.log(response),
  complete: () => console.log('自动完成')
});
```

## 不会自动完成的 Observable

这些需要手动取消订阅：

```typescript
import { interval, fromEvent, Subject } from 'rxjs';

// interval：永远不会完成
const sub1 = interval(1000).subscribe(v => console.log(v));
// 必须手动取消
sub1.unsubscribe();

// fromEvent：永远不会完成
const sub2 = fromEvent(document, 'click').subscribe(e => console.log(e));
// 必须手动取消
sub2.unsubscribe();

// Subject：除非手动调用 complete()
const subject = new Subject();
const sub3 = subject.subscribe(v => console.log(v));
// 必须手动取消或调用 subject.complete()
```

## 使用 take 自动取消

```typescript
import { interval } from 'rxjs';
import { take } from 'rxjs/operators';

// 只取前 5 个值，然后自动完成
interval(1000).pipe(
  take(5)
).subscribe({
  next: v => console.log(v),
  complete: () => console.log('自动完成')
});

// 输出：0, 1, 2, 3, 4, 自动完成
```

## 使用 takeUntil 自动取消

```typescript
import { interval, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

const destroy$ = new Subject<void>();

interval(1000).pipe(
  takeUntil(destroy$)  // 当 destroy$ 发出值时，自动取消
).subscribe(v => console.log(v));

// 5 秒后触发取消
setTimeout(() => {
  destroy$.next();
  destroy$.complete();
}, 5000);
```

## 实际应用模式

### 模式 1：组件生命周期管理

```typescript
class UserComponent {
  private destroy$ = new Subject<void>();

  ngOnInit() {
    // 所有订阅都使用 takeUntil
    this.userService.getUser().pipe(
      takeUntil(this.destroy$)
    ).subscribe(user => this.user = user);

    interval(1000).pipe(
      takeUntil(this.destroy$)
    ).subscribe(v => this.tick = v);
  }

  ngOnDestroy() {
    // 一次性取消所有订阅
    this.destroy$.next();
    this.destroy$.complete();
  }
}
```

### 模式 2：使用 Subscription 数组

```typescript
class DataComponent {
  private subscriptions: Subscription[] = [];

  ngOnInit() {
    this.subscriptions.push(
      this.dataService.getData().subscribe(data => this.data = data)
    );
    
    this.subscriptions.push(
      interval(1000).subscribe(v => this.counter = v)
    );
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }
}
```

## 小结

| 概念 | 说明 |
|------|------|
| Observer | 定义如何处理 next、error、complete |
| Subscription | 代表一次订阅，用于取消 |
| unsubscribe() | 取消订阅，释放资源 |
| 自动完成 | of、from、HTTP 请求等会自动完成 |
| 需手动取消 | interval、fromEvent、Subject 等 |
| takeUntil | 优雅地自动取消订阅 |

## 下一步

[👉 04. Subject 详解](./04-subject.md)


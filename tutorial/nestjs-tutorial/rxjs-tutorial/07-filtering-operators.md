# 07. 过滤操作符

过滤操作符用于从 Observable 中选择性地发出值。

## 操作符概览

```
┌─────────────────────────────────────────────────────────────┐
│                      过滤操作符                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  条件过滤          数量限制          去重                    │
│  ┌─────────┐      ┌─────────┐      ┌────────────────┐      │
│  │ filter  │      │ take    │      │ distinct       │      │
│  │ first   │      │ takeLast│      │ distinctUntil- │      │
│  │ last    │      │ skip    │      │ Changed        │      │
│  │ single  │      │ skipLast│      └────────────────┘      │
│  └─────────┘      └─────────┘                              │
│                                                             │
│  时间过滤          采样                                      │
│  ┌──────────────┐  ┌─────────┐                             │
│  │ debounceTime │  │ sample  │                             │
│  │ throttleTime │  │ audit   │                             │
│  └──────────────┘  └─────────┘                             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## filter - 条件过滤

最基本的过滤操作符：

```typescript
import { of, from } from 'rxjs';
import { filter } from 'rxjs/operators';

// 过滤偶数
of(1, 2, 3, 4, 5, 6).pipe(
  filter(x => x % 2 === 0)
).subscribe(console.log);
// 输出: 2, 4, 6

// 过滤对象
const users = [
  { name: 'Tom', age: 25, active: true },
  { name: 'Jerry', age: 17, active: false },
  { name: 'Alice', age: 30, active: true },
];

from(users).pipe(
  filter(user => user.active && user.age >= 18)
).subscribe(console.log);
// 输出: { name: 'Tom', ... }, { name: 'Alice', ... }

// 带索引过滤
of('a', 'b', 'c', 'd', 'e').pipe(
  filter((value, index) => index % 2 === 0)
).subscribe(console.log);
// 输出: 'a', 'c', 'e'

// 类型守卫
interface Cat { meow(): void }
interface Dog { bark(): void }

function isCat(pet: Cat | Dog): pet is Cat {
  return (pet as Cat).meow !== undefined;
}

from([cat, dog, cat]).pipe(
  filter(isCat)  // TypeScript 知道结果是 Cat[]
).subscribe(cat => cat.meow());
```

**时间线：**
```
源:    ──1──2──3──4──5──6──|
         ↓     ↓     ↓
filter(x => x % 2 === 0)
              ↓     ↓
输出:  ─────2─────4─────6──|
```

## take - 只取前 N 个

```typescript
import { interval, of } from 'rxjs';
import { take } from 'rxjs/operators';

// 只取前 3 个
of(1, 2, 3, 4, 5).pipe(
  take(3)
).subscribe(console.log);
// 输出: 1, 2, 3

// 从无限流中取值
interval(1000).pipe(
  take(5)
).subscribe({
  next: console.log,
  complete: () => console.log('完成')
});
// 输出: 0, 1, 2, 3, 4, 完成
```

## takeLast - 只取最后 N 个

```typescript
import { of } from 'rxjs';
import { takeLast } from 'rxjs/operators';

of(1, 2, 3, 4, 5).pipe(
  takeLast(2)
).subscribe(console.log);
// 输出: 4, 5
// 注意：必须等源完成后才发出
```

## takeWhile - 满足条件时持续取值

```typescript
import { of, interval } from 'rxjs';
import { takeWhile } from 'rxjs/operators';

of(1, 2, 3, 4, 5, 1, 2).pipe(
  takeWhile(x => x < 4)
).subscribe(console.log);
// 输出: 1, 2, 3（遇到 4 就停止）

// 包含边界值
of(1, 2, 3, 4, 5).pipe(
  takeWhile(x => x < 4, true)  // inclusive
).subscribe(console.log);
// 输出: 1, 2, 3, 4

// 实际场景：轮询直到条件满足
interval(1000).pipe(
  takeWhile(count => count < 10)
).subscribe(console.log);
```

## takeUntil - 直到另一个 Observable 发出 ⭐

常用于取消订阅：

```typescript
import { interval, fromEvent, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

// 点击时停止
const stop$ = fromEvent(document, 'click');

interval(500).pipe(
  takeUntil(stop$)
).subscribe({
  next: console.log,
  complete: () => console.log('停止了')
});

// 组件销毁时取消订阅（Angular/React 常用模式）
class MyComponent {
  private destroy$ = new Subject<void>();

  ngOnInit() {
    interval(1000).pipe(
      takeUntil(this.destroy$)
    ).subscribe(console.log);
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
```

## skip - 跳过前 N 个

```typescript
import { of } from 'rxjs';
import { skip } from 'rxjs/operators';

of(1, 2, 3, 4, 5).pipe(
  skip(2)
).subscribe(console.log);
// 输出: 3, 4, 5
```

## skipWhile - 跳过满足条件的值

```typescript
import { of } from 'rxjs';
import { skipWhile } from 'rxjs/operators';

of(1, 2, 3, 4, 5, 1, 2).pipe(
  skipWhile(x => x < 3)
).subscribe(console.log);
// 输出: 3, 4, 5, 1, 2（一旦条件不满足，后续全部发出）
```

## skipUntil - 跳过直到另一个 Observable 发出

```typescript
import { interval, timer } from 'rxjs';
import { skipUntil, take } from 'rxjs/operators';

interval(500).pipe(
  skipUntil(timer(2000)),  // 2 秒后开始
  take(5)
).subscribe(console.log);
// 2 秒后输出: 3, 4, 5, 6, 7
```

## first - 第一个值

```typescript
import { of, EMPTY } from 'rxjs';
import { first } from 'rxjs/operators';

of(1, 2, 3).pipe(
  first()
).subscribe(console.log);
// 输出: 1

// 带条件
of(1, 2, 3, 4, 5).pipe(
  first(x => x > 3)
).subscribe(console.log);
// 输出: 4

// 默认值（如果没有匹配）
EMPTY.pipe(
  first(undefined, 'default')
).subscribe(console.log);
// 输出: 'default'
```

## last - 最后一个值

```typescript
import { of } from 'rxjs';
import { last } from 'rxjs/operators';

of(1, 2, 3).pipe(
  last()
).subscribe(console.log);
// 输出: 3

// 带条件
of(1, 2, 3, 4, 5).pipe(
  last(x => x < 4)
).subscribe(console.log);
// 输出: 3
```

## single - 确保只有一个值

```typescript
import { of } from 'rxjs';
import { single } from 'rxjs/operators';

// 正常
of(1).pipe(single()).subscribe(console.log);
// 输出: 1

// 多个值会报错
of(1, 2).pipe(single()).subscribe({
  error: err => console.log('错误:', err)
});
// 错误: Sequence contains more than one element

// 带条件
of(1, 2, 3, 4, 5).pipe(
  single(x => x === 3)
).subscribe(console.log);
// 输出: 3
```

## distinct - 去除重复值

```typescript
import { of } from 'rxjs';
import { distinct } from 'rxjs/operators';

of(1, 2, 1, 3, 2, 4, 3, 5).pipe(
  distinct()
).subscribe(console.log);
// 输出: 1, 2, 3, 4, 5

// 按属性去重
of(
  { id: 1, name: 'Tom' },
  { id: 2, name: 'Jerry' },
  { id: 1, name: 'Tom Updated' }
).pipe(
  distinct(user => user.id)
).subscribe(console.log);
// 输出: { id: 1, name: 'Tom' }, { id: 2, name: 'Jerry' }
```

## distinctUntilChanged - 与前一个不同才发出 ⭐

```typescript
import { of } from 'rxjs';
import { distinctUntilChanged } from 'rxjs/operators';

of(1, 1, 2, 2, 2, 3, 1, 1).pipe(
  distinctUntilChanged()
).subscribe(console.log);
// 输出: 1, 2, 3, 1

// 自定义比较
of(
  { id: 1, name: 'Tom' },
  { id: 1, name: 'Tom Updated' },
  { id: 2, name: 'Jerry' }
).pipe(
  distinctUntilChanged((prev, curr) => prev.id === curr.id)
).subscribe(console.log);
// 输出: { id: 1, ... }, { id: 2, ... }

// 按属性比较
of(
  { id: 1, name: 'Tom' },
  { id: 1, name: 'Tom' },
  { id: 2, name: 'Jerry' }
).pipe(
  distinctUntilKeyChanged('id')
).subscribe(console.log);
// 输出: { id: 1, ... }, { id: 2, ... }
```

**时间线：**
```
源:    ──1──1──2──2──3──1──|
         ↓     ↓     ↓  ↓
distinctUntilChanged()
         ↓     ↓     ↓  ↓
输出:  ──1─────2─────3──1──|
```

## debounceTime - 防抖 ⭐

等待一段时间没有新值后才发出最新值：

```typescript
import { fromEvent } from 'rxjs';
import { debounceTime, map } from 'rxjs/operators';

// 搜索防抖
const searchInput = document.querySelector('input')!;

fromEvent(searchInput, 'input').pipe(
  map(e => (e.target as HTMLInputElement).value),
  debounceTime(300)  // 300ms 内没有新输入才发出
).subscribe(value => {
  console.log('搜索:', value);
});

// 窗口大小变化
fromEvent(window, 'resize').pipe(
  debounceTime(200),
  map(() => ({ width: window.innerWidth, height: window.innerHeight }))
).subscribe(console.log);
```

**时间线：**
```
输入:  ──a──b──c────────d──e──────────>
                  300ms      300ms
debounceTime(300)
                    ↓           ↓
输出:  ─────────────c───────────e─────>
```

## throttleTime - 节流 ⭐

固定时间内只发出第一个值：

```typescript
import { fromEvent } from 'rxjs';
import { throttleTime, map } from 'rxjs/operators';

// 滚动节流
fromEvent(window, 'scroll').pipe(
  throttleTime(100),
  map(() => window.scrollY)
).subscribe(y => {
  console.log('滚动位置:', y);
});

// 按钮点击节流
fromEvent(button, 'click').pipe(
  throttleTime(1000)  // 1 秒内只响应一次
).subscribe(() => {
  console.log('点击');
});
```

**时间线：**
```
点击:  ──C──C──C────────C──C──────────>
         ↓     100ms    ↓     100ms
throttleTime(100)
         ↓              ↓
输出:  ──C──────────────C─────────────>
```

## debounce vs throttle 对比

| 特性 | debounceTime | throttleTime |
|------|--------------|--------------|
| 行为 | 等待静止后发出 | 固定间隔发出 |
| 发出时机 | 最后一个值 | 第一个值 |
| 使用场景 | 搜索输入 | 滚动、拖拽 |

```
输入:    ──a─b─c─────d─e─────>
            300ms     300ms
debounce:  ─────────c───────e─>  (等静止后发出最后一个)
throttle:  ──a───────d────────>  (固定间隔发出第一个)
```

## sample - 采样

当另一个 Observable 发出时，发出源的最新值：

```typescript
import { interval, fromEvent } from 'rxjs';
import { sample } from 'rxjs/operators';

// 每次点击时，发出最新的计数
interval(500).pipe(
  sample(fromEvent(document, 'click'))
).subscribe(console.log);

// sampleTime - 固定时间采样
interval(200).pipe(
  sampleTime(1000)
).subscribe(console.log);
// 每秒发出当时的最新值
```

## auditTime - 审计

节流的变体，发出时间窗口内的最后一个值：

```typescript
import { fromEvent } from 'rxjs';
import { auditTime } from 'rxjs/operators';

fromEvent(document, 'click').pipe(
  auditTime(1000)
).subscribe(() => console.log('点击'));
// 点击后等 1 秒，发出这 1 秒内最后一次点击
```

## 实战示例

### 搜索输入完整处理

```typescript
import { fromEvent } from 'rxjs';
import { 
  map, 
  filter, 
  debounceTime, 
  distinctUntilChanged,
  switchMap 
} from 'rxjs/operators';

const search$ = fromEvent(searchInput, 'input').pipe(
  map(e => (e.target as HTMLInputElement).value.trim()),
  filter(value => value.length >= 2),      // 至少 2 字符
  debounceTime(300),                        // 防抖
  distinctUntilChanged(),                   // 值变化才继续
  switchMap(keyword => searchApi(keyword))  // 搜索
);
```

### 无限滚动

```typescript
import { fromEvent } from 'rxjs';
import { 
  map, 
  filter, 
  throttleTime, 
  distinctUntilChanged 
} from 'rxjs/operators';

const scroll$ = fromEvent(window, 'scroll').pipe(
  throttleTime(200),
  map(() => ({
    scrollTop: window.scrollY,
    clientHeight: window.innerHeight,
    scrollHeight: document.body.scrollHeight
  })),
  filter(({ scrollTop, clientHeight, scrollHeight }) => 
    scrollTop + clientHeight >= scrollHeight - 100
  ),
  distinctUntilChanged((prev, curr) => 
    prev.scrollTop === curr.scrollTop
  )
);

scroll$.subscribe(() => {
  console.log('加载更多');
  loadMore();
});
```

## 下一步

[👉 08. 组合操作符](./08-combination-operators.md)


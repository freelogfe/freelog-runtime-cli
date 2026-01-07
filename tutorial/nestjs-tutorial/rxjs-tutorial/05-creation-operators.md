# 05. 创建操作符

创建操作符用于创建 Observable，是 RxJS 的起点。

## 操作符概览

```
┌─────────────────────────────────────────────────────────────┐
│                      创建操作符                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  从值创建          从事件创建         从时间创建              │
│  ┌─────────┐      ┌───────────┐     ┌───────────┐          │
│  │ of      │      │ fromEvent │     │ interval  │          │
│  │ from    │      │ fromEvent-│     │ timer     │          │
│  │ range   │      │ Pattern   │     │           │          │
│  └─────────┘      └───────────┘     └───────────┘          │
│                                                             │
│  特殊创建          异步创建                                  │
│  ┌─────────┐      ┌───────────┐                            │
│  │ EMPTY   │      │ defer     │                            │
│  │ NEVER   │      │ generate  │                            │
│  │ throwEr │      │           │                            │
│  └─────────┘      └───────────┘                            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## of - 从值创建

将参数转换为 Observable 序列：

```typescript
import { of } from 'rxjs';

// 发出多个值，然后完成
of(1, 2, 3).subscribe({
  next: v => console.log(v),
  complete: () => console.log('完成'),
});
// 输出: 1, 2, 3, 完成

// 发出任意类型
of('hello', [1, 2], { name: 'Tom' }).subscribe(console.log);
// 输出: 'hello', [1, 2], { name: 'Tom' }

// 单个值
of(42).subscribe(console.log);
// 输出: 42
```

**时间线：**
```
of(1, 2, 3)

时间: ─────────────────────>
值:   (1)(2)(3)|
      ↑  ↑  ↑  ↑
      同步发出   完成
```

## from - 从可迭代对象创建

将数组、Promise、可迭代对象转换为 Observable：

```typescript
import { from } from 'rxjs';

// 从数组
from([1, 2, 3]).subscribe(console.log);
// 输出: 1, 2, 3（逐个发出）

// 从字符串
from('hello').subscribe(console.log);
// 输出: 'h', 'e', 'l', 'l', 'o'

// 从 Promise
from(fetch('/api/users').then(r => r.json())).subscribe(console.log);
// 输出: API 返回的数据

// 从 Promise（简化）
from(Promise.resolve('hello')).subscribe(console.log);
// 输出: 'hello'

// 从 Set
from(new Set([1, 2, 3])).subscribe(console.log);
// 输出: 1, 2, 3

// 从 Map
from(new Map([['a', 1], ['b', 2]])).subscribe(console.log);
// 输出: ['a', 1], ['b', 2]

// 从生成器
function* generator() {
  yield 1;
  yield 2;
  yield 3;
}
from(generator()).subscribe(console.log);
// 输出: 1, 2, 3
```

### of vs from 的区别

```typescript
import { of, from } from 'rxjs';

// of 把整个数组作为一个值发出
of([1, 2, 3]).subscribe(console.log);
// 输出: [1, 2, 3]（一个数组）

// from 把数组元素逐个发出
from([1, 2, 3]).subscribe(console.log);
// 输出: 1, 2, 3（三个值）
```

## range - 创建数字序列

```typescript
import { range } from 'rxjs';

// range(start, count)
range(1, 5).subscribe(console.log);
// 输出: 1, 2, 3, 4, 5

range(10, 3).subscribe(console.log);
// 输出: 10, 11, 12

// 生成索引
range(0, 10).subscribe(i => console.log(`Item ${i}`));
```

## interval - 定时发出递增数字

```typescript
import { interval } from 'rxjs';
import { take } from 'rxjs/operators';

// 每秒发出一个递增数字（从 0 开始）
interval(1000).pipe(
  take(5)  // 只取前 5 个
).subscribe(console.log);
// 输出: 0（1秒后）, 1（2秒后）, 2, 3, 4
```

**时间线：**
```
interval(1000)

时间: ──1s──1s──1s──1s──1s──>
值:      0    1    2    3    4
```

## timer - 延迟后发出

```typescript
import { timer } from 'rxjs';
import { take } from 'rxjs/operators';

// 延迟 2 秒后发出 0，然后完成
timer(2000).subscribe({
  next: v => console.log(v),
  complete: () => console.log('完成'),
});
// 2秒后输出: 0, 完成

// 延迟 1 秒后，每 500ms 发出递增数字
timer(1000, 500).pipe(
  take(4)
).subscribe(console.log);
// 1秒后输出: 0, 然后每500ms: 1, 2, 3
```

**时间线：**
```
timer(2000)
时间: ──────2s──────>
值:                 0|

timer(1000, 500)
时间: ──1s──500ms──500ms──500ms──>
值:       0      1      2      3
```

### interval vs timer

```typescript
// interval(1000) 等价于 timer(1000, 1000)
// 但 interval 第一个值在 1 秒后
// timer(0, 1000) 第一个值立即发出
```

## fromEvent - 从 DOM 事件创建

```typescript
import { fromEvent } from 'rxjs';
import { map, throttleTime } from 'rxjs/operators';

// 点击事件
const clicks$ = fromEvent(document, 'click');
clicks$.subscribe(event => console.log('点击了', event));

// 键盘事件
const keydown$ = fromEvent<KeyboardEvent>(document, 'keydown');
keydown$.pipe(
  map(e => e.key)
).subscribe(key => console.log('按键:', key));

// 输入事件
const input = document.querySelector('input')!;
const input$ = fromEvent<InputEvent>(input, 'input');
input$.pipe(
  map(e => (e.target as HTMLInputElement).value)
).subscribe(value => console.log('输入:', value));

// 滚动事件（节流）
const scroll$ = fromEvent(window, 'scroll');
scroll$.pipe(
  throttleTime(100),
  map(() => window.scrollY)
).subscribe(y => console.log('滚动位置:', y));

// 鼠标移动
const mousemove$ = fromEvent<MouseEvent>(document, 'mousemove');
mousemove$.pipe(
  throttleTime(50),
  map(e => ({ x: e.clientX, y: e.clientY }))
).subscribe(pos => console.log('鼠标位置:', pos));
```

## fromEventPattern - 自定义事件源

用于非标准事件源：

```typescript
import { fromEventPattern } from 'rxjs';

// Node.js EventEmitter
import { EventEmitter } from 'events';

const emitter = new EventEmitter();

const message$ = fromEventPattern(
  handler => emitter.on('message', handler),      // 添加监听
  handler => emitter.off('message', handler)      // 移除监听
);

message$.subscribe(msg => console.log('收到消息:', msg));

emitter.emit('message', 'Hello');
emitter.emit('message', 'World');

// WebSocket
const ws = new WebSocket('ws://localhost:8080');

const wsMessage$ = fromEventPattern(
  handler => ws.addEventListener('message', handler),
  handler => ws.removeEventListener('message', handler)
);
```

## defer - 延迟创建

每次订阅时才创建 Observable：

```typescript
import { defer, of } from 'rxjs';

// 问题：of 立即执行
const now$ = of(Date.now());
now$.subscribe(t => console.log('时间1:', t));
setTimeout(() => {
  now$.subscribe(t => console.log('时间2:', t)); // 相同的时间！
}, 1000);

// 解决：defer 延迟执行
const deferredNow$ = defer(() => of(Date.now()));
deferredNow$.subscribe(t => console.log('时间1:', t));
setTimeout(() => {
  deferredNow$.subscribe(t => console.log('时间2:', t)); // 不同的时间
}, 1000);

// 常用于延迟创建 Promise
const api$ = defer(() => fetch('/api/data').then(r => r.json()));
// 每次订阅都会发起新请求
```

## generate - 循环生成

类似 for 循环：

```typescript
import { generate } from 'rxjs';

// generate(初始值, 条件, 迭代, 结果选择器)
generate(
  1,                    // 初始值
  x => x <= 5,          // 继续条件
  x => x + 1,           // 迭代
  x => x * 10           // 结果映射
).subscribe(console.log);
// 输出: 10, 20, 30, 40, 50

// 等价于:
// for (let x = 1; x <= 5; x++) { console.log(x * 10); }

// 生成斐波那契数列
generate(
  [0, 1],
  ([a, b]) => a < 100,
  ([a, b]) => [b, a + b],
  ([a]) => a
).subscribe(console.log);
// 输出: 0, 1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89
```

## 特殊常量

### EMPTY - 立即完成

```typescript
import { EMPTY } from 'rxjs';

EMPTY.subscribe({
  next: v => console.log('值:', v),        // 不会执行
  complete: () => console.log('完成'),     // 执行
});
// 输出: 完成

// 常用于条件返回
import { of, EMPTY } from 'rxjs';
import { mergeMap } from 'rxjs/operators';

of(1, 2, 3, 4, 5).pipe(
  mergeMap(n => n % 2 === 0 ? of(n) : EMPTY)  // 只保留偶数
).subscribe(console.log);
// 输出: 2, 4
```

### NEVER - 永不发出

```typescript
import { NEVER } from 'rxjs';

NEVER.subscribe({
  next: v => console.log('值:', v),        // 不会执行
  complete: () => console.log('完成'),     // 不会执行
});
// 无输出，Observable 永远挂起

// 用于测试或占位
```

### throwError - 立即报错

```typescript
import { throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

throwError(() => new Error('出错了')).subscribe({
  next: v => console.log('值:', v),
  error: err => console.log('错误:', err.message),
});
// 输出: 错误: 出错了

// 常用于条件抛出错误
import { of } from 'rxjs';
import { mergeMap } from 'rxjs/operators';

of({ status: 'error', message: '请求失败' }).pipe(
  mergeMap(res => 
    res.status === 'error' 
      ? throwError(() => new Error(res.message))
      : of(res)
  )
).subscribe({
  error: err => console.log('捕获错误:', err.message)
});
```

## ajax - HTTP 请求

```typescript
import { ajax } from 'rxjs/ajax';
import { map, catchError } from 'rxjs/operators';
import { of } from 'rxjs';

// GET 请求
ajax.getJSON('/api/users').subscribe(console.log);

// POST 请求
ajax({
  url: '/api/users',
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: { name: 'Tom', age: 25 }
}).pipe(
  map(response => response.response),
  catchError(error => {
    console.error('请求失败:', error);
    return of(null);
  })
).subscribe(console.log);

// 完整配置
ajax({
  url: '/api/data',
  method: 'GET',
  headers: {
    'Authorization': 'Bearer token123',
  },
  timeout: 5000,
  responseType: 'json',
}).subscribe({
  next: response => console.log('响应:', response),
  error: error => console.log('错误:', error),
});
```

## 创建自定义 Observable

```typescript
import { Observable } from 'rxjs';

// 基础创建
const custom$ = new Observable(subscriber => {
  subscriber.next(1);
  subscriber.next(2);
  subscriber.next(3);
  subscriber.complete();
});

// 异步创建
const async$ = new Observable(subscriber => {
  let count = 0;
  const id = setInterval(() => {
    subscriber.next(count++);
    if (count > 5) {
      subscriber.complete();
      clearInterval(id);
    }
  }, 1000);

  // 清理函数
  return () => {
    console.log('清理');
    clearInterval(id);
  };
});

// WebSocket Observable
function createWebSocket(url: string) {
  return new Observable(subscriber => {
    const ws = new WebSocket(url);

    ws.onopen = () => console.log('连接成功');
    ws.onmessage = event => subscriber.next(JSON.parse(event.data));
    ws.onerror = error => subscriber.error(error);
    ws.onclose = () => subscriber.complete();

    return () => ws.close();
  });
}
```

## 总结对比

| 操作符 | 用途 | 示例 |
|--------|------|------|
| `of` | 从值创建 | `of(1, 2, 3)` |
| `from` | 从可迭代/Promise | `from([1,2,3])`, `from(promise)` |
| `range` | 数字序列 | `range(1, 10)` |
| `interval` | 定时递增 | `interval(1000)` |
| `timer` | 延迟/定时 | `timer(2000)`, `timer(1000, 500)` |
| `fromEvent` | DOM 事件 | `fromEvent(btn, 'click')` |
| `defer` | 延迟创建 | `defer(() => of(Date.now()))` |
| `ajax` | HTTP 请求 | `ajax.getJSON(url)` |
| `EMPTY` | 立即完成 | 条件跳过 |
| `throwError` | 立即报错 | 条件抛错 |

## 下一步

[👉 06. 转换操作符](./06-transformation-operators.md)


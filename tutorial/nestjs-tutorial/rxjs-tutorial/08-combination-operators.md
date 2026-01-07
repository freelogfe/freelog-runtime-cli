# 08. 组合操作符

组合操作符用于将多个 Observable 组合在一起。

## 操作符概览

```
┌─────────────────────────────────────────────────────────────┐
│                      组合操作符                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  合并流            组合最新值         等待全部完成           │
│  ┌─────────┐      ┌─────────────┐    ┌─────────┐           │
│  │ merge   │      │ combineLatest│   │ forkJoin│           │
│  │ concat  │      │ withLatest-  │   │ zip     │           │
│  │ race    │      │ From         │   │         │           │
│  └─────────┘      └─────────────┘    └─────────┘           │
│                                                             │
│  条件组合          开关                                     │
│  ┌─────────┐      ┌─────────┐                              │
│  │ iif     │      │ startWith│                             │
│  │         │      │ endWith  │                             │
│  └─────────┘      └─────────┘                              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## merge - 合并多个流

将多个 Observable 合并为一个，值按发出时间交错：

```typescript
import { merge, interval } from 'rxjs';
import { map, take } from 'rxjs/operators';

const a$ = interval(1000).pipe(map(x => `A${x}`), take(3));
const b$ = interval(1500).pipe(map(x => `B${x}`), take(3));

merge(a$, b$).subscribe(console.log);
// 输出（按时间顺序）: A0, B0, A1, A2, B1, B2
```

**时间线：**
```
a$:    ──A0──A1──A2──|
b$:    ────B0────B1────B2──|

merge(a$, b$)
       ↓
输出:  ──A0─B0─A1─A2─B1────B2──|
```

```typescript
// 合并多个事件源
const click$ = fromEvent(document, 'click').pipe(map(() => 'click'));
const keydown$ = fromEvent(document, 'keydown').pipe(map(() => 'keydown'));

merge(click$, keydown$).subscribe(console.log);
// 点击或按键都会触发

// 限制并发
merge(obs1$, obs2$, obs3$, 2).subscribe();  // 最多同时 2 个
```

## concat - 串联多个流

按顺序执行，前一个完成后才执行下一个：

```typescript
import { concat, of } from 'rxjs';
import { delay } from 'rxjs/operators';

const a$ = of('A1', 'A2').pipe(delay(1000));
const b$ = of('B1', 'B2').pipe(delay(500));
const c$ = of('C1', 'C2');

concat(a$, b$, c$).subscribe(console.log);
// 输出: A1, A2（1秒后）, B1, B2（再0.5秒后）, C1, C2
```

**时间线：**
```
a$:    ──A1──A2──|
b$:              ──B1──B2──|
c$:                        ──C1──C2──|

concat(a$, b$, c$)
       ↓
输出:  ──A1──A2──B1──B2──C1──C2──|
```

```typescript
// 顺序请求
concat(
  fetchUser(1),
  fetchUser(2),
  fetchUser(3)
).subscribe(console.log);
// 一个完成后才请求下一个
```

## race - 竞速

只取最先发出值的 Observable：

```typescript
import { race, interval, timer } from 'rxjs';
import { map, take } from 'rxjs/operators';

const fast$ = timer(100).pipe(map(() => 'fast'));
const slow$ = timer(500).pipe(map(() => 'slow'));

race(fast$, slow$).subscribe(console.log);
// 输出: 'fast'（slow 被忽略）

// 超时处理
const request$ = fetch('/api/data').then(r => r.json());
const timeout$ = timer(5000).pipe(map(() => ({ error: '超时' })));

race(from(request$), timeout$).subscribe(console.log);
```

## combineLatest - 组合最新值 ⭐

当任一源发出值时，发出所有源的最新值组合：

```typescript
import { combineLatest, interval } from 'rxjs';
import { map, take } from 'rxjs/operators';

const a$ = interval(1000).pipe(map(x => `A${x}`), take(3));
const b$ = interval(1500).pipe(map(x => `B${x}`), take(3));

combineLatest([a$, b$]).subscribe(console.log);
// 等两个都有值后才开始发出
// 输出: ['A0','B0'], ['A1','B0'], ['A2','B0'], ['A2','B1'], ['A2','B2']
```

**时间线：**
```
a$:    ──A0──A1──A2──|
b$:    ────B0────B1────B2──|

combineLatest([a$, b$])
       ↓
输出:  ────[A0,B0]─[A1,B0]─[A2,B0]─[A2,B1]─[A2,B2]──|
```

```typescript
// 表单验证
const username$ = fromEvent(usernameInput, 'input').pipe(
  map(e => (e.target as HTMLInputElement).value)
);
const password$ = fromEvent(passwordInput, 'input').pipe(
  map(e => (e.target as HTMLInputElement).value)
);

combineLatest([username$, password$]).pipe(
  map(([username, password]) => ({
    valid: username.length >= 3 && password.length >= 6,
    username,
    password
  }))
).subscribe(({ valid }) => {
  submitBtn.disabled = !valid;
});

// 多个数据源组合
combineLatest({
  user: user$,
  settings: settings$,
  notifications: notifications$
}).subscribe(({ user, settings, notifications }) => {
  console.log('所有数据:', user, settings, notifications);
});
```

## withLatestFrom - 获取另一个流的最新值

主流发出时，附带另一个流的最新值：

```typescript
import { fromEvent, interval } from 'rxjs';
import { withLatestFrom, map } from 'rxjs/operators';

const click$ = fromEvent(document, 'click');
const timer$ = interval(1000);

click$.pipe(
  withLatestFrom(timer$),
  map(([event, count]) => `点击时计数: ${count}`)
).subscribe(console.log);
// 点击时输出当前的计数值
```

**时间线：**
```
click$:  ────C────────C──────C──>
timer$:  ──0──1──2──3──4──5──6──>

click$.pipe(withLatestFrom(timer$))
       ↓
输出:    ────[C,1]────[C,3]──[C,5]──>
```

### combineLatest vs withLatestFrom

| 特性 | combineLatest | withLatestFrom |
|------|---------------|----------------|
| 触发时机 | 任一源发出 | 只有主流发出 |
| 初始等待 | 等所有源都有值 | 等副流有值 |
| 使用场景 | 多个等价数据源 | 主流 + 附加数据 |

## forkJoin - 等待全部完成 ⭐

等待所有 Observable 完成，发出它们的最后一个值：

```typescript
import { forkJoin, of } from 'rxjs';
import { delay } from 'rxjs/operators';

const a$ = of('A').pipe(delay(1000));
const b$ = of('B').pipe(delay(2000));
const c$ = of('C').pipe(delay(500));

forkJoin([a$, b$, c$]).subscribe(console.log);
// 2秒后输出: ['A', 'B', 'C']

// 并行 API 请求
forkJoin({
  user: fetchUser(1),
  posts: fetchPosts(1),
  comments: fetchComments(1)
}).subscribe(({ user, posts, comments }) => {
  console.log('所有数据加载完成');
});

// 类似 Promise.all
const results = await forkJoin([api1$, api2$, api3$]).toPromise();
```

**时间线：**
```
a$:    ────────A|
b$:    ────────────────B|
c$:    ──C|

forkJoin([a$, b$, c$])
       ↓
输出:  ────────────────[A,B,C]|
```

### forkJoin vs combineLatest

| 特性 | forkJoin | combineLatest |
|------|----------|---------------|
| 发出时机 | 全部完成时发出一次 | 每次变化都发出 |
| 发出值 | 最后值 | 最新值 |
| 适用场景 | 一次性请求 | 持续数据流 |

## zip - 配对组合

按顺序配对，等待每个源都有新值：

```typescript
import { zip, of, interval } from 'rxjs';
import { take } from 'rxjs/operators';

const a$ = of('A', 'B', 'C');
const b$ = of(1, 2, 3);
const c$ = of('x', 'y', 'z');

zip(a$, b$, c$).subscribe(console.log);
// 输出: ['A',1,'x'], ['B',2,'y'], ['C',3,'z']

// 不同速度的流
const fast$ = interval(500).pipe(take(5));
const slow$ = interval(1000).pipe(take(5));

zip(fast$, slow$).subscribe(console.log);
// 每秒输出: [0,0], [1,1], [2,2], [3,3], [4,4]
```

**时间线：**
```
a$:    ──A──B──C──|
b$:    ────1────2────3──|

zip(a$, b$)
       ↓
输出:  ────[A,1]──[B,2]──[C,3]──|
```

## startWith - 添加初始值

```typescript
import { of } from 'rxjs';
import { startWith } from 'rxjs/operators';

of(1, 2, 3).pipe(
  startWith(0)
).subscribe(console.log);
// 输出: 0, 1, 2, 3

// 多个初始值
of(3, 4, 5).pipe(
  startWith(0, 1, 2)
).subscribe(console.log);
// 输出: 0, 1, 2, 3, 4, 5

// 常用于初始状态
const data$ = fetchData().pipe(
  startWith({ loading: true, data: null })
);
```

## endWith - 添加结束值

```typescript
import { of } from 'rxjs';
import { endWith } from 'rxjs/operators';

of(1, 2, 3).pipe(
  endWith(4, 5)
).subscribe(console.log);
// 输出: 1, 2, 3, 4, 5
```

## iif - 条件选择

```typescript
import { iif, of, EMPTY } from 'rxjs';

const isLoggedIn = true;

iif(
  () => isLoggedIn,
  of('欢迎回来'),
  of('请登录')
).subscribe(console.log);
// 输出: '欢迎回来'

// 配合其他操作符
const getData$ = (userId: number | null) => iif(
  () => userId !== null,
  fetchUserData(userId!),
  EMPTY
);
```

## 实战示例

### 并行请求 + 错误处理

```typescript
import { forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

function safeRequest(url: string) {
  return from(fetch(url).then(r => r.json())).pipe(
    catchError(error => of({ error: true, message: error.message }))
  );
}

forkJoin({
  users: safeRequest('/api/users'),
  posts: safeRequest('/api/posts'),
  comments: safeRequest('/api/comments')
}).subscribe(results => {
  // 即使某个请求失败，其他请求结果仍然可用
  console.log(results);
});
```

### 实时数据仪表盘

```typescript
import { combineLatest, interval } from 'rxjs';
import { switchMap, startWith } from 'rxjs/operators';

const refresh$ = interval(30000).pipe(startWith(0));

const dashboard$ = refresh$.pipe(
  switchMap(() => combineLatest({
    sales: fetchSales(),
    orders: fetchOrders(),
    visitors: fetchVisitors()
  }))
);

dashboard$.subscribe(({ sales, orders, visitors }) => {
  updateDashboard(sales, orders, visitors);
});
```

### 表单联动

```typescript
import { combineLatest, fromEvent } from 'rxjs';
import { map, startWith, switchMap } from 'rxjs/operators';

const country$ = fromEvent(countrySelect, 'change').pipe(
  map(e => (e.target as HTMLSelectElement).value),
  startWith('CN')
);

const city$ = country$.pipe(
  switchMap(country => fetchCities(country))
);

combineLatest([country$, city$]).subscribe(([country, cities]) => {
  updateCityOptions(cities);
});
```

## 下一步

[👉 09. 错误处理](./09-error-handling.md)


# 06. 转换操作符

转换操作符用于将 Observable 发出的值进行转换。

## 操作符概览

```
┌─────────────────────────────────────────────────────────────┐
│                      转换操作符                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  基础转换          高阶转换（返回 Observable）               │
│  ┌─────────┐      ┌─────────────────────────┐              │
│  │ map     │      │ switchMap  - 切换       │              │
│  │ pluck   │      │ mergeMap   - 合并       │              │
│  │ mapTo   │      │ concatMap  - 串联       │              │
│  │ scan    │      │ exhaustMap - 忽略       │              │
│  └─────────┘      └─────────────────────────┘              │
│                                                             │
│  缓冲               分组                                    │
│  ┌─────────┐      ┌─────────┐                              │
│  │ buffer  │      │ groupBy │                              │
│  │ window  │      │ pairwise│                              │
│  └─────────┘      └─────────┘                              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## map - 映射转换

最常用的转换操作符，将每个值进行转换：

```typescript
import { of } from 'rxjs';
import { map } from 'rxjs/operators';

// 数字转换
of(1, 2, 3).pipe(
  map(x => x * 10)
).subscribe(console.log);
// 输出: 10, 20, 30

// 提取属性
of(
  { name: 'Tom', age: 25 },
  { name: 'Jerry', age: 30 }
).pipe(
  map(user => user.name)
).subscribe(console.log);
// 输出: 'Tom', 'Jerry'

// 带索引
of('a', 'b', 'c').pipe(
  map((value, index) => `${index}: ${value}`)
).subscribe(console.log);
// 输出: '0: a', '1: b', '2: c'
```

**时间线：**
```
源:    ──1──2──3──|
         ↓  ↓  ↓
map(x => x * 10)
         ↓  ↓  ↓
输出:  ──10─20─30─|
```

## pluck - 提取属性（已废弃，用 map 替代）

```typescript
import { of } from 'rxjs';
import { map } from 'rxjs/operators';

// 旧写法（pluck 已废弃）
// of({ name: 'Tom' }).pipe(pluck('name'))

// 新写法
of({ name: 'Tom', address: { city: 'Beijing' } }).pipe(
  map(obj => obj.name)
).subscribe(console.log);
// 输出: 'Tom'

// 嵌套属性
of({ name: 'Tom', address: { city: 'Beijing' } }).pipe(
  map(obj => obj.address?.city)
).subscribe(console.log);
// 输出: 'Beijing'
```

## scan - 累积计算

类似数组的 reduce，但会发出每次累积的结果：

```typescript
import { of, interval } from 'rxjs';
import { scan, take } from 'rxjs/operators';

// 累加
of(1, 2, 3, 4, 5).pipe(
  scan((acc, curr) => acc + curr, 0)
).subscribe(console.log);
// 输出: 1, 3, 6, 10, 15

// 对比 reduce（只发出最终结果）
of(1, 2, 3, 4, 5).pipe(
  reduce((acc, curr) => acc + curr, 0)
).subscribe(console.log);
// 输出: 15

// 实时计数器
interval(1000).pipe(
  take(5),
  scan(count => count + 1, 0)
).subscribe(console.log);
// 每秒输出: 1, 2, 3, 4, 5

// 状态管理
interface State {
  count: number;
  history: number[];
}

of(1, -1, 1, 1, -1).pipe(
  scan((state: State, change: number) => ({
    count: state.count + change,
    history: [...state.history, state.count + change]
  }), { count: 0, history: [] })
).subscribe(console.log);
```

**时间线：**
```
源:    ──1──2──3──4──5──|
         ↓  ↓  ↓  ↓  ↓
scan((acc, curr) => acc + curr, 0)
         ↓  ↓  ↓  ↓  ↓
输出:  ──1──3──6──10─15─|
```

## switchMap - 切换到新的 Observable ⭐

**核心特性：取消之前的，只保留最新的。**

```typescript
import { fromEvent, interval } from 'rxjs';
import { switchMap, take } from 'rxjs/operators';

// 每次点击，开始新的计数（取消之前的）
fromEvent(document, 'click').pipe(
  switchMap(() => interval(1000).pipe(take(5)))
).subscribe(console.log);
// 点击后输出: 0, 1, 2...
// 再次点击，重新从 0 开始

// 搜索场景（最常用）
const searchInput = document.querySelector('input')!;
fromEvent(searchInput, 'input').pipe(
  map(e => (e.target as HTMLInputElement).value),
  debounceTime(300),
  switchMap(keyword => 
    fetch(`/api/search?q=${keyword}`).then(r => r.json())
  )
).subscribe(results => console.log('搜索结果:', results));
// 快速输入时，只有最后一次搜索会返回结果
```

**时间线：**
```
点击:     ──C──────────C──────────>
            ↓          ↓
switchMap(() => interval(1000))
            ↓          ↓
内部流1:    ──0──1──2──X（被取消）
                       ↓
内部流2:               ──0──1──2──3──>
```

## mergeMap - 合并所有 Observable

**核心特性：并行执行所有，不取消任何一个。**

```typescript
import { of, interval } from 'rxjs';
import { mergeMap, take, delay } from 'rxjs/operators';

// 并行请求
of(1, 2, 3).pipe(
  mergeMap(id => 
    fetch(`/api/users/${id}`).then(r => r.json())
  )
).subscribe(console.log);
// 三个请求并行发出，结果按完成顺序返回

// 并行计时器
of('A', 'B', 'C').pipe(
  mergeMap(letter => 
    interval(1000).pipe(
      take(3),
      map(i => `${letter}${i}`)
    )
  )
).subscribe(console.log);
// 输出顺序不确定: A0, B0, C0, A1, B1, C1, A2, B2, C2

// 限制并发数
of(1, 2, 3, 4, 5).pipe(
  mergeMap(
    id => fetchUser(id),
    2  // 最多同时 2 个请求
  )
).subscribe(console.log);
```

**时间线：**
```
源:       ──A────B────C──>
            ↓    ↓    ↓
mergeMap(x => interval(1000).pipe(take(2)))
            ↓    ↓    ↓
内部流A:    ──0──1──|
内部流B:         ──0──1──|
内部流C:              ──0──1──|
                ↓
合并输出:   ──A0─B0─A1─C0─B1─C1──>
```

## concatMap - 串联执行

**核心特性：排队执行，一个完成后才执行下一个。**

```typescript
import { of, interval } from 'rxjs';
import { concatMap, take, delay } from 'rxjs/operators';

// 顺序请求
of(1, 2, 3).pipe(
  concatMap(id => 
    of(`用户${id}`).pipe(delay(1000))
  )
).subscribe(console.log);
// 每隔 1 秒输出: '用户1', '用户2', '用户3'

// 顺序计时器
of('A', 'B', 'C').pipe(
  concatMap(letter => 
    interval(500).pipe(
      take(2),
      map(i => `${letter}${i}`)
    )
  )
).subscribe(console.log);
// 输出: A0, A1, B0, B1, C0, C1（严格顺序）

// 文件顺序上传
of(file1, file2, file3).pipe(
  concatMap(file => uploadFile(file))
).subscribe(result => console.log('上传完成:', result));
```

**时间线：**
```
源:       ──A────B────C──|
            ↓
concatMap(x => interval(500).pipe(take(2)))
            ↓
内部流A:    ──0──1──|
                    ↓
内部流B:            ──0──1──|
                            ↓
内部流C:                    ──0──1──|
                ↓
输出:       ──A0─A1─B0─B1─C0─C1──|
```

## exhaustMap - 忽略新请求

**核心特性：正在执行时，忽略新的请求。**

```typescript
import { fromEvent, interval } from 'rxjs';
import { exhaustMap, take } from 'rxjs/operators';

// 防止重复提交
const submitBtn = document.querySelector('button')!;
fromEvent(submitBtn, 'click').pipe(
  exhaustMap(() => 
    fetch('/api/submit', { method: 'POST' }).then(r => r.json())
  )
).subscribe(result => console.log('提交结果:', result));
// 提交过程中的点击会被忽略

// 登录按钮
fromEvent(loginBtn, 'click').pipe(
  exhaustMap(() => loginApi(credentials))
).subscribe(handleLoginResult);
```

**时间线：**
```
点击:      ──C──C──C────────C──>
             ↓  ↓  ↓        ↓
exhaustMap(() => delay(2000))
             ↓  忽略        ↓
输出:        ──────X────────────X──>
```

## 四种 xxxMap 对比

| 操作符 | 行为 | 使用场景 |
|--------|------|---------|
| `switchMap` | 取消之前的 | 搜索、自动完成 |
| `mergeMap` | 并行执行 | 并行请求、不关心顺序 |
| `concatMap` | 排队执行 | 顺序请求、文件上传 |
| `exhaustMap` | 忽略新的 | 防重复提交、登录 |

```typescript
// 可视化对比
import { interval, of } from 'rxjs';
import { switchMap, mergeMap, concatMap, exhaustMap, take, delay } from 'rxjs/operators';

const source$ = interval(1000).pipe(take(3));  // 0, 1, 2

// switchMap: 0 被取消, 1 被取消, 只有 2 完成
source$.pipe(
  switchMap(x => of(x).pipe(delay(1500)))
).subscribe(x => console.log('switch:', x));

// mergeMap: 0, 1, 2 都完成（并行）
source$.pipe(
  mergeMap(x => of(x).pipe(delay(1500)))
).subscribe(x => console.log('merge:', x));

// concatMap: 0, 1, 2 顺序完成
source$.pipe(
  concatMap(x => of(x).pipe(delay(1500)))
).subscribe(x => console.log('concat:', x));

// exhaustMap: 只有 0 完成，1, 2 被忽略
source$.pipe(
  exhaustMap(x => of(x).pipe(delay(1500)))
).subscribe(x => console.log('exhaust:', x));
```

## buffer - 缓冲值

收集值到数组，直到另一个 Observable 发出：

```typescript
import { interval, fromEvent } from 'rxjs';
import { buffer, bufferCount, bufferTime } from 'rxjs/operators';

// 每次点击时，发出之前收集的值
interval(500).pipe(
  buffer(fromEvent(document, 'click'))
).subscribe(console.log);
// 点击时输出: [0, 1, 2, ...]

// bufferCount - 按数量缓冲
interval(500).pipe(
  bufferCount(3)
).subscribe(console.log);
// 每 3 个值输出一次: [0,1,2], [3,4,5], ...

// bufferTime - 按时间缓冲
interval(200).pipe(
  bufferTime(1000)
).subscribe(console.log);
// 每秒输出: [0,1,2,3,4], [5,6,7,8,9], ...
```

## pairwise - 成对发出

```typescript
import { of } from 'rxjs';
import { pairwise } from 'rxjs/operators';

of(1, 2, 3, 4, 5).pipe(
  pairwise()
).subscribe(console.log);
// 输出: [1,2], [2,3], [3,4], [4,5]

// 计算变化量
of(10, 15, 12, 20).pipe(
  pairwise(),
  map(([prev, curr]) => curr - prev)
).subscribe(console.log);
// 输出: 5, -3, 8
```

## groupBy - 分组

```typescript
import { of } from 'rxjs';
import { groupBy, mergeMap, toArray } from 'rxjs/operators';

const people = [
  { name: 'Tom', department: 'IT' },
  { name: 'Jerry', department: 'HR' },
  { name: 'Alice', department: 'IT' },
  { name: 'Bob', department: 'HR' },
];

of(...people).pipe(
  groupBy(person => person.department),
  mergeMap(group$ => 
    group$.pipe(
      toArray(),
      map(members => ({ department: group$.key, members }))
    )
  )
).subscribe(console.log);
// 输出:
// { department: 'IT', members: [{name:'Tom',...}, {name:'Alice',...}] }
// { department: 'HR', members: [{name:'Jerry',...}, {name:'Bob',...}] }
```

## 实战示例

### 搜索自动完成

```typescript
import { fromEvent } from 'rxjs';
import { map, debounceTime, distinctUntilChanged, switchMap, filter } from 'rxjs/operators';

const searchInput = document.querySelector('#search') as HTMLInputElement;

fromEvent(searchInput, 'input').pipe(
  map(e => (e.target as HTMLInputElement).value.trim()),
  filter(value => value.length >= 2),       // 至少 2 个字符
  debounceTime(300),                         // 防抖
  distinctUntilChanged(),                    // 值变化才请求
  switchMap(keyword =>                       // 取消之前的请求
    fetch(`/api/search?q=${keyword}`).then(r => r.json())
  )
).subscribe(results => {
  console.log('搜索结果:', results);
});
```

### 请求重试

```typescript
import { from, timer } from 'rxjs';
import { mergeMap, retryWhen, take } from 'rxjs/operators';

function fetchWithRetry(url: string) {
  return from(fetch(url)).pipe(
    mergeMap(response => {
      if (!response.ok) throw new Error('请求失败');
      return response.json();
    }),
    retryWhen(errors => 
      errors.pipe(
        mergeMap((error, index) => {
          if (index >= 3) throw error;  // 最多重试 3 次
          console.log(`重试 ${index + 1}...`);
          return timer(1000 * (index + 1));  // 递增延迟
        })
      )
    )
  );
}
```

## 下一步

[👉 07. 过滤操作符](./07-filtering-operators.md)


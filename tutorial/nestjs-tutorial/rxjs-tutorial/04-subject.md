# 04. Subject 详解

## 什么是 Subject？

Subject 是特殊的 Observable，它既是**数据生产者**，也是**数据消费者**。

```
普通 Observable：
  数据源 ──────> Observable ──────> Observer
                (只能发送)         (只能接收)

Subject：
  可以手动发送 ──> Subject <────── 可以订阅
                 (双向的)
```

### 基本用法

```typescript
import { Subject } from 'rxjs';

const subject = new Subject<number>();

// 订阅（作为 Observable）
subject.subscribe(v => console.log('A:', v));
subject.subscribe(v => console.log('B:', v));

// 发送数据（作为 Observer）
subject.next(1);
subject.next(2);
subject.next(3);

// 输出：
// A: 1
// B: 1
// A: 2
// B: 2
// A: 3
// B: 3
```

## Subject vs Observable

| 特性 | Observable | Subject |
|------|-----------|---------|
| 数据发送 | 在创建时定义 | 可以随时调用 next() |
| 多播 | 单播（每个订阅者独立） | 多播（所有订阅者共享） |
| 热/冷 | 冷（订阅时才执行） | 热（随时可发送） |

### 单播 vs 多播

```typescript
import { Observable, Subject } from 'rxjs';

// Observable 是单播的
const observable = new Observable(subscriber => {
  subscriber.next(Math.random());
});

observable.subscribe(v => console.log('A:', v));  // A: 0.123
observable.subscribe(v => console.log('B:', v));  // B: 0.456 (不同的值)

// Subject 是多播的
const subject = new Subject();

subject.subscribe(v => console.log('A:', v));
subject.subscribe(v => console.log('B:', v));

subject.next(Math.random());  
// A: 0.789
// B: 0.789 (相同的值)
```

## Subject 的四种类型

### 1. Subject（普通）

```typescript
import { Subject } from 'rxjs';

const subject = new Subject<number>();

subject.next(1);  // 没人收到（还没订阅）

subject.subscribe(v => console.log('A:', v));

subject.next(2);  // A: 2

subject.subscribe(v => console.log('B:', v));

subject.next(3);  // A: 3, B: 3
```

**特点**：新订阅者收不到订阅之前的值。

### 2. BehaviorSubject（有初始值）

```typescript
import { BehaviorSubject } from 'rxjs';

// 必须提供初始值
const subject = new BehaviorSubject<number>(0);

subject.subscribe(v => console.log('A:', v));  // A: 0 (立即收到初始值)

subject.next(1);  // A: 1
subject.next(2);  // A: 2

subject.subscribe(v => console.log('B:', v));  // B: 2 (立即收到最新值)

subject.next(3);  // A: 3, B: 3

// 获取当前值
console.log(subject.getValue());  // 3
```

**特点**：
- 必须有初始值
- 新订阅者立即收到最新值
- 可以用 `getValue()` 获取当前值

**适用场景**：状态管理、当前用户信息、配置等。

### 3. ReplaySubject（重放历史）

```typescript
import { ReplaySubject } from 'rxjs';

// 保留最近 2 个值
const subject = new ReplaySubject<number>(2);

subject.next(1);
subject.next(2);
subject.next(3);

// 新订阅者收到最近 2 个值
subject.subscribe(v => console.log('A:', v));
// A: 2
// A: 3

subject.next(4);  // A: 4
```

```typescript
// 也可以按时间重放
import { ReplaySubject } from 'rxjs';

// 重放最近 500ms 内的值
const subject = new ReplaySubject<number>(100, 500);

subject.next(1);

setTimeout(() => subject.next(2), 100);
setTimeout(() => subject.next(3), 600);

setTimeout(() => {
  subject.subscribe(v => console.log(v));
  // 只收到 3（1 和 2 已超过 500ms）
}, 700);
```

**特点**：可以重放指定数量或时间范围内的值。

**适用场景**：聊天记录、操作历史等。

### 4. AsyncSubject（只发最后一个）

```typescript
import { AsyncSubject } from 'rxjs';

const subject = new AsyncSubject<number>();

subject.subscribe(v => console.log('A:', v));

subject.next(1);  // 不会立即发送
subject.next(2);  // 不会立即发送
subject.next(3);  // 不会立即发送

subject.subscribe(v => console.log('B:', v));

subject.complete();  // 只有 complete 后才发送最后一个值
// A: 3
// B: 3
```

**特点**：只在 complete 后发送最后一个值。

**适用场景**：只关心最终结果的场景。

## Subject 类型对比

```
时间线 ─────────────────────────────────────>

发送:     1    2    3    [订阅]    4    5

Subject:                          4    5
                                  ↑ 只收到订阅后的值

BehaviorSubject:             3    4    5
                             ↑ 订阅时立即收到最新值

ReplaySubject(2):       2    3    4    5
                        ↑ 重放最近 2 个值

AsyncSubject:                          5 (complete后)
                                       ↑ 只收到最后一个值
```

## 实际应用

### 应用 1：事件总线

```typescript
// event-bus.ts
import { Subject } from 'rxjs';
import { filter } from 'rxjs/operators';

interface Event {
  type: string;
  payload: any;
}

class EventBus {
  private subject = new Subject<Event>();

  emit(type: string, payload: any) {
    this.subject.next({ type, payload });
  }

  on(type: string) {
    return this.subject.pipe(
      filter(event => event.type === type)
    );
  }
}

// 使用
const bus = new EventBus();

bus.on('user:login').subscribe(event => {
  console.log('用户登录:', event.payload);
});

bus.emit('user:login', { userId: 1, name: 'Alice' });
```

### 应用 2：状态管理

```typescript
// store.ts
import { BehaviorSubject } from 'rxjs';
import { map, distinctUntilChanged } from 'rxjs/operators';

interface State {
  user: { name: string } | null;
  theme: 'light' | 'dark';
  count: number;
}

class Store {
  private state$ = new BehaviorSubject<State>({
    user: null,
    theme: 'light',
    count: 0
  });

  // 获取整个状态
  getState() {
    return this.state$.getValue();
  }

  // 订阅状态变化
  select<K extends keyof State>(key: K) {
    return this.state$.pipe(
      map(state => state[key]),
      distinctUntilChanged()
    );
  }

  // 更新状态
  setState(partial: Partial<State>) {
    this.state$.next({
      ...this.state$.getValue(),
      ...partial
    });
  }
}

// 使用
const store = new Store();

// 订阅 user 变化
store.select('user').subscribe(user => {
  console.log('用户变化:', user);
});

// 订阅 count 变化
store.select('count').subscribe(count => {
  console.log('计数变化:', count);
});

// 更新状态
store.setState({ user: { name: 'Alice' } });
store.setState({ count: 1 });
```

### 应用 3：WebSocket 封装

```typescript
import { Subject, Observable } from 'rxjs';

class WebSocketService {
  private socket: WebSocket;
  private messages$ = new Subject<any>();

  connect(url: string): Observable<any> {
    this.socket = new WebSocket(url);

    this.socket.onmessage = (event) => {
      this.messages$.next(JSON.parse(event.data));
    };

    this.socket.onerror = (error) => {
      this.messages$.error(error);
    };

    this.socket.onclose = () => {
      this.messages$.complete();
    };

    return this.messages$.asObservable();
  }

  send(data: any) {
    this.socket.send(JSON.stringify(data));
  }

  close() {
    this.socket.close();
  }
}

// 使用
const ws = new WebSocketService();

ws.connect('ws://localhost:8080').subscribe({
  next: msg => console.log('收到消息:', msg),
  error: err => console.error('连接错误:', err),
  complete: () => console.log('连接关闭')
});

ws.send({ type: 'hello', data: 'world' });
```

## 小结

| 类型 | 初始值 | 新订阅者收到 | 适用场景 |
|------|--------|-------------|---------|
| Subject | 无 | 订阅后的值 | 事件广播 |
| BehaviorSubject | 必须 | 最新值 + 后续值 | 状态管理 |
| ReplaySubject | 无 | 历史值 + 后续值 | 聊天记录 |
| AsyncSubject | 无 | 最后一个值 | 只关心结果 |

## 下一步

[👉 05. 创建操作符](./05-creation-operators.md)


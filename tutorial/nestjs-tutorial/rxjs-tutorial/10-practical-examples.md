# 10. 实战案例

本章通过真实场景展示 RxJS 的应用。

## 案例 1：搜索自动完成

```typescript
import { fromEvent, of, EMPTY } from 'rxjs';
import { 
  map, 
  debounceTime, 
  distinctUntilChanged, 
  switchMap, 
  filter,
  catchError,
  tap
} from 'rxjs/operators';

const searchInput = document.querySelector('#search') as HTMLInputElement;
const resultsList = document.querySelector('#results') as HTMLUListElement;

const search$ = fromEvent(searchInput, 'input').pipe(
  map(e => (e.target as HTMLInputElement).value.trim()),
  filter(value => value.length >= 2),
  debounceTime(300),
  distinctUntilChanged(),
  tap(() => showLoading()),
  switchMap(keyword => 
    from(fetch(`/api/search?q=${encodeURIComponent(keyword)}`)).pipe(
      switchMap(r => r.json()),
      catchError(err => {
        console.error('搜索失败:', err);
        return of([]);
      })
    )
  ),
  tap(() => hideLoading())
);

search$.subscribe(results => {
  resultsList.innerHTML = results
    .map((item: any) => `<li>${item.name}</li>`)
    .join('');
});
```

## 案例 2：无限滚动

```typescript
import { fromEvent, BehaviorSubject } from 'rxjs';
import { 
  map, 
  filter, 
  throttleTime, 
  switchMap,
  scan,
  tap
} from 'rxjs/operators';

interface State {
  items: any[];
  page: number;
  loading: boolean;
  hasMore: boolean;
}

const initialState: State = { items: [], page: 1, loading: false, hasMore: true };
const state$ = new BehaviorSubject<State>(initialState);

// 滚动到底部检测
const scrollToBottom$ = fromEvent(window, 'scroll').pipe(
  throttleTime(200),
  map(() => ({
    scrollTop: window.scrollY,
    clientHeight: window.innerHeight,
    scrollHeight: document.body.scrollHeight
  })),
  filter(({ scrollTop, clientHeight, scrollHeight }) => 
    scrollTop + clientHeight >= scrollHeight - 200
  )
);

// 加载更多
scrollToBottom$.pipe(
  filter(() => !state$.value.loading && state$.value.hasMore),
  tap(() => state$.next({ ...state$.value, loading: true })),
  switchMap(() => 
    fetch(`/api/items?page=${state$.value.page}`).then(r => r.json())
  )
).subscribe(newItems => {
  const current = state$.value;
  state$.next({
    items: [...current.items, ...newItems],
    page: current.page + 1,
    loading: false,
    hasMore: newItems.length > 0
  });
});

// 渲染
state$.subscribe(({ items, loading }) => {
  renderItems(items);
  toggleLoading(loading);
});
```

## 案例 3：拖拽

```typescript
import { fromEvent, merge } from 'rxjs';
import { map, takeUntil, switchMap, tap } from 'rxjs/operators';

const draggable = document.querySelector('#draggable') as HTMLElement;

const mousedown$ = fromEvent<MouseEvent>(draggable, 'mousedown');
const mousemove$ = fromEvent<MouseEvent>(document, 'mousemove');
const mouseup$ = fromEvent<MouseEvent>(document, 'mouseup');

const drag$ = mousedown$.pipe(
  tap(e => e.preventDefault()),
  map(start => ({
    startX: start.clientX - draggable.offsetLeft,
    startY: start.clientY - draggable.offsetTop
  })),
  switchMap(({ startX, startY }) =>
    mousemove$.pipe(
      map(move => ({
        x: move.clientX - startX,
        y: move.clientY - startY
      })),
      takeUntil(mouseup$)
    )
  )
);

drag$.subscribe(({ x, y }) => {
  draggable.style.left = `${x}px`;
  draggable.style.top = `${y}px`;
});
```

## 案例 4：实时数据轮询

```typescript
import { timer, Subject, EMPTY } from 'rxjs';
import { switchMap, retry, takeUntil, catchError, tap } from 'rxjs/operators';

class DataPoller {
  private stop$ = new Subject<void>();
  private data$ = new Subject<any>();

  start(interval = 5000) {
    timer(0, interval).pipe(
      takeUntil(this.stop$),
      switchMap(() => 
        fetch('/api/data').then(r => r.json()).catch(() => null)
      ),
      tap(data => data && this.data$.next(data))
    ).subscribe();
  }

  stop() {
    this.stop$.next();
  }

  getData() {
    return this.data$.asObservable();
  }
}

// 使用
const poller = new DataPoller();
poller.getData().subscribe(data => updateUI(data));
poller.start(3000);

// 停止
// poller.stop();
```

## 案例 5：表单验证

```typescript
import { fromEvent, combineLatest, of } from 'rxjs';
import { map, debounceTime, switchMap, startWith } from 'rxjs/operators';

const usernameInput = document.querySelector('#username') as HTMLInputElement;
const emailInput = document.querySelector('#email') as HTMLInputElement;
const submitBtn = document.querySelector('#submit') as HTMLButtonElement;

const username$ = fromEvent(usernameInput, 'input').pipe(
  map(e => (e.target as HTMLInputElement).value),
  startWith(''),
  debounceTime(300),
  switchMap(value => {
    if (value.length < 3) return of({ valid: false, error: '至少3个字符' });
    return checkUsernameAvailable(value).pipe(
      map(available => available 
        ? { valid: true } 
        : { valid: false, error: '用户名已存在' }
      )
    );
  })
);

const email$ = fromEvent(emailInput, 'input').pipe(
  map(e => (e.target as HTMLInputElement).value),
  startWith(''),
  map(value => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(value)
      ? { valid: true }
      : { valid: false, error: '邮箱格式不正确' };
  })
);

combineLatest({ username: username$, email: email$ }).subscribe(({ username, email }) => {
  submitBtn.disabled = !(username.valid && email.valid);
  showErrors({ username, email });
});
```

## 案例 6：WebSocket 消息处理

```typescript
import { webSocket } from 'rxjs/webSocket';
import { retry, tap, filter, map } from 'rxjs/operators';

const socket$ = webSocket<any>('ws://localhost:8080');

// 自动重连
const connection$ = socket$.pipe(
  retry({ delay: 3000 }),
  tap({
    error: () => console.log('连接断开，3秒后重试')
  })
);

// 按类型过滤消息
const chatMessages$ = connection$.pipe(
  filter(msg => msg.type === 'chat'),
  map(msg => msg.data)
);

const notifications$ = connection$.pipe(
  filter(msg => msg.type === 'notification'),
  map(msg => msg.data)
);

// 订阅
chatMessages$.subscribe(msg => addChatMessage(msg));
notifications$.subscribe(notif => showNotification(notif));

// 发送消息
function sendMessage(text: string) {
  socket$.next({ type: 'chat', data: { text, timestamp: Date.now() } });
}
```

## 案例 7：缓存请求

```typescript
import { of, from, Observable } from 'rxjs';
import { tap, shareReplay, catchError } from 'rxjs/operators';

class CachedApi {
  private cache = new Map<string, Observable<any>>();

  get<T>(url: string, ttl = 60000): Observable<T> {
    if (!this.cache.has(url)) {
      const request$ = from(fetch(url).then(r => r.json())).pipe(
        tap(() => {
          // TTL 后清除缓存
          setTimeout(() => this.cache.delete(url), ttl);
        }),
        shareReplay(1),
        catchError(err => {
          this.cache.delete(url);
          throw err;
        })
      );
      this.cache.set(url, request$);
    }
    return this.cache.get(url)!;
  }

  invalidate(url: string) {
    this.cache.delete(url);
  }

  clear() {
    this.cache.clear();
  }
}

// 使用
const api = new CachedApi();
api.get('/api/users').subscribe(console.log);  // 发起请求
api.get('/api/users').subscribe(console.log);  // 使用缓存
```

## 案例 8：状态管理（简单 Redux）

```typescript
import { BehaviorSubject, Subject } from 'rxjs';
import { scan, startWith } from 'rxjs/operators';

interface State {
  count: number;
  todos: string[];
}

type Action = 
  | { type: 'INCREMENT' }
  | { type: 'DECREMENT' }
  | { type: 'ADD_TODO'; payload: string };

const initialState: State = { count: 0, todos: [] };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'INCREMENT':
      return { ...state, count: state.count + 1 };
    case 'DECREMENT':
      return { ...state, count: state.count - 1 };
    case 'ADD_TODO':
      return { ...state, todos: [...state.todos, action.payload] };
    default:
      return state;
  }
}

// Store
const action$ = new Subject<Action>();
const state$ = action$.pipe(
  scan(reducer, initialState),
  startWith(initialState)
);

// 使用
state$.subscribe(state => console.log('State:', state));

action$.next({ type: 'INCREMENT' });
action$.next({ type: 'ADD_TODO', payload: '学习 RxJS' });
```

## 总结

恭喜你完成了 RxJS 教程！你已经学会了：

| 章节 | 内容 |
|------|------|
| 01 | RxJS 核心概念 |
| 02 | Observable 基础 |
| 03 | Observer 与 Subscription |
| 04 | Subject 详解 |
| 05 | 创建操作符 |
| 06 | 转换操作符 |
| 07 | 过滤操作符 |
| 08 | 组合操作符 |
| 09 | 错误处理 |
| 10 | 实战案例 |

## 常用操作符速查

| 场景 | 操作符 |
|------|--------|
| 搜索防抖 | `debounceTime` + `distinctUntilChanged` + `switchMap` |
| 滚动节流 | `throttleTime` |
| 取消请求 | `switchMap` |
| 并行请求 | `forkJoin` |
| 顺序请求 | `concatMap` |
| 错误重试 | `retry` + `catchError` |
| 组合数据 | `combineLatest` |
| 初始值 | `startWith` |
| 取消订阅 | `takeUntil` |


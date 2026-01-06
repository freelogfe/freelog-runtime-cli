# 09. 错误处理

RxJS 提供了多种错误处理机制。

## 错误处理概览

```
┌─────────────────────────────────────────────────────────────┐
│                      错误处理                                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  捕获错误          重试机制          完成处理                │
│  ┌───────────┐    ┌───────────┐    ┌───────────┐           │
│  │ catchError│    │ retry     │    │ finalize  │           │
│  │ throwError│    │ retryWhen │    │           │           │
│  └───────────┘    └───────────┘    └───────────┘           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## 错误基础

Observable 有三种通知类型：
- `next`: 发出值
- `error`: 发出错误（终止流）
- `complete`: 完成（终止流）

```typescript
import { Observable } from 'rxjs';

const error$ = new Observable(subscriber => {
  subscriber.next(1);
  subscriber.next(2);
  subscriber.error(new Error('出错了'));  // 流终止
  subscriber.next(3);  // 不会执行
});

error$.subscribe({
  next: v => console.log('值:', v),
  error: err => console.log('错误:', err.message),
  complete: () => console.log('完成')
});
// 输出: 值: 1, 值: 2, 错误: 出错了
```

## catchError - 捕获错误 ⭐

捕获错误并返回一个新的 Observable：

```typescript
import { of, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

// 返回默认值
throwError(() => new Error('出错了')).pipe(
  catchError(err => {
    console.log('捕获错误:', err.message);
    return of('默认值');
  })
).subscribe(console.log);
// 输出: 捕获错误: 出错了, 默认值

// 返回空流
throwError(() => new Error('出错了')).pipe(
  catchError(() => EMPTY)
).subscribe({
  complete: () => console.log('完成')
});
// 输出: 完成

// 重新抛出错误
throwError(() => new Error('原始错误')).pipe(
  catchError(err => {
    console.log('记录错误');
    return throwError(() => new Error(`包装: ${err.message}`));
  })
).subscribe({
  error: err => console.log('最终错误:', err.message)
});
// 输出: 记录错误, 最终错误: 包装: 原始错误
```

### HTTP 请求错误处理

```typescript
import { from, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

function fetchUser(id: number) {
  return from(fetch(`/api/users/${id}`)).pipe(
    map(response => {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return response.json();
    }),
    catchError(error => {
      console.error('请求失败:', error);
      return of({ error: true, message: error.message });
    })
  );
}

fetchUser(1).subscribe(result => {
  if (result.error) {
    showError(result.message);
  } else {
    showUser(result);
  }
});
```

### 链式错误处理

```typescript
of(1, 2, 3, 4, 5).pipe(
  map(n => {
    if (n === 3) throw new Error('不喜欢 3');
    return n;
  }),
  catchError((err, caught$) => {
    console.log('错误:', err.message);
    // caught$ 是源 Observable，可以用于重试
    return of(0);  // 继续发出 0
  })
).subscribe(console.log);
// 输出: 1, 2, 错误: 不喜欢 3, 0
```

## retry - 自动重试

```typescript
import { interval, throwError } from 'rxjs';
import { mergeMap, retry, take } from 'rxjs/operators';

let attempts = 0;

const unreliable$ = interval(1000).pipe(
  take(5),
  mergeMap(val => {
    attempts++;
    if (attempts < 3) {
      return throwError(() => new Error('模拟失败'));
    }
    return of(val);
  }),
  retry(3)  // 最多重试 3 次
);

unreliable$.subscribe({
  next: console.log,
  error: err => console.log('最终失败:', err.message)
});
```

### retry 配置选项

```typescript
import { retry } from 'rxjs/operators';

source$.pipe(
  retry({
    count: 3,           // 重试次数
    delay: 1000,        // 重试延迟（毫秒）
    resetOnSuccess: true // 成功后重置计数
  })
);

// 指数退避重试
source$.pipe(
  retry({
    count: 3,
    delay: (error, retryCount) => {
      const delay = Math.pow(2, retryCount) * 1000;
      console.log(`第 ${retryCount} 次重试，等待 ${delay}ms`);
      return timer(delay);
    }
  })
);
```

## retryWhen - 自定义重试逻辑（已废弃）

使用 `retry` 配置替代：

```typescript
import { of, timer, throwError } from 'rxjs';
import { retry, mergeMap } from 'rxjs/operators';

// 指数退避 + 最大重试次数
function fetchWithRetry(url: string) {
  return from(fetch(url)).pipe(
    mergeMap(response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    }),
    retry({
      count: 3,
      delay: (error, retryCount) => {
        if (retryCount > 3) {
          return throwError(() => error);
        }
        const delay = 1000 * Math.pow(2, retryCount - 1);
        console.log(`重试 ${retryCount}，等待 ${delay}ms`);
        return timer(delay);
      }
    })
  );
}
```

## finalize - 完成时执行

无论成功、错误还是取消，都会执行：

```typescript
import { of, throwError } from 'rxjs';
import { finalize, tap } from 'rxjs/operators';

// 成功完成
of(1, 2, 3).pipe(
  finalize(() => console.log('清理资源'))
).subscribe(console.log);
// 输出: 1, 2, 3, 清理资源

// 错误时
throwError(() => new Error('出错')).pipe(
  finalize(() => console.log('清理资源'))
).subscribe({
  error: err => console.log('错误:', err.message)
});
// 输出: 错误: 出错, 清理资源

// 实际场景：loading 状态
let loading = true;

fetchData().pipe(
  finalize(() => {
    loading = false;
    console.log('加载完成');
  })
).subscribe({
  next: data => console.log('数据:', data),
  error: err => console.log('错误:', err)
});
```

## 错误处理模式

### 模式 1：返回默认值

```typescript
fetchUser(id).pipe(
  catchError(() => of(defaultUser))
);
```

### 模式 2：返回错误对象

```typescript
interface Result<T> {
  success: boolean;
  data?: T;
  error?: string;
}

fetchUser(id).pipe(
  map(data => ({ success: true, data })),
  catchError(err => of({ success: false, error: err.message }))
);
```

### 模式 3：重试后返回默认值

```typescript
fetchUser(id).pipe(
  retry(3),
  catchError(() => of(defaultUser))
);
```

### 模式 4：显示错误通知

```typescript
fetchUser(id).pipe(
  catchError(err => {
    showNotification('加载失败: ' + err.message);
    return EMPTY;
  })
);
```

### 模式 5：全局错误处理

```typescript
// 创建带错误处理的请求函数
function request<T>(url: string): Observable<T> {
  return from(fetch(url)).pipe(
    mergeMap(response => {
      if (!response.ok) {
        throw new HttpError(response.status, response.statusText);
      }
      return response.json() as Promise<T>;
    }),
    retry({ count: 2, delay: 1000 }),
    catchError(error => {
      // 全局错误日志
      logError(error);
      
      // 根据错误类型处理
      if (error instanceof HttpError) {
        if (error.status === 401) {
          redirectToLogin();
        } else if (error.status === 404) {
          return of(null as T);
        }
      }
      
      return throwError(() => error);
    })
  );
}
```

## 实战示例

### 带超时的请求

```typescript
import { from, throwError, timer } from 'rxjs';
import { timeout, catchError, retry } from 'rxjs/operators';

function fetchWithTimeout(url: string, ms = 5000) {
  return from(fetch(url)).pipe(
    timeout(ms),
    mergeMap(r => r.json()),
    catchError(error => {
      if (error.name === 'TimeoutError') {
        return throwError(() => new Error('请求超时'));
      }
      return throwError(() => error);
    })
  );
}
```

### 批量请求错误隔离

```typescript
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

// 单个请求失败不影响其他
forkJoin({
  users: fetchUsers().pipe(catchError(() => of([]))),
  posts: fetchPosts().pipe(catchError(() => of([]))),
  comments: fetchComments().pipe(catchError(() => of([])))
}).subscribe(({ users, posts, comments }) => {
  // 即使某个失败，其他仍有数据
  console.log('用户:', users);
  console.log('文章:', posts);
  console.log('评论:', comments);
});
```

### 优雅降级

```typescript
import { concat, of, timer } from 'rxjs';
import { catchError, timeout, take } from 'rxjs/operators';

// 主数据源超时后，使用备用数据源
function getDataWithFallback() {
  const primary$ = fetchFromPrimaryServer().pipe(
    timeout(3000)
  );
  
  const fallback$ = fetchFromBackupServer().pipe(
    timeout(5000)
  );
  
  const cache$ = of(getCachedData());
  
  return primary$.pipe(
    catchError(() => {
      console.log('主服务器失败，尝试备用');
      return fallback$;
    }),
    catchError(() => {
      console.log('备用服务器失败，使用缓存');
      return cache$;
    })
  );
}
```

## 下一步

[👉 10. 实战案例](./10-practical-examples.md)


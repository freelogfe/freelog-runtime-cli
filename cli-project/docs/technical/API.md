# API 集成文档

## Freelog API 响应格式

```javascript
{
  "ret": 0,        // 0=成功, 非0=失败
  "msg": "success",
  "data": { ... }  // 实际数据
}
```

---

## 主要 API 端点

### 认证
```
POST /v2/passport/login
```

### 资源
```
GET  /v2/resources/{resourceIdOrName}
GET  /v2/resources/{resourceId}/versions/{version}
GET  /v2/resources/versions/list
POST /v2/resources/{workId}/versions
POST /v2/resources/{workId}/versions/drafts
```

### 策略与合约
```
GET  /resources/{resourceId}/policies
POST /contracts/sign
POST /v2/contracts/{contractId}/events/payment
```

### 文件上传
```
POST /v2/storages/files/upload
```

---

## 环境配置

### 测试环境
```
API: http://api.testfreelog.com
WEB: https://test.freelog.com
```

### 生产环境
```
API: https://api.freelog.com
WEB: https://freelog.com
```

### 切换环境
```bash
# 设置环境变量
export FREELOG_ENV=development  # 测试
export FREELOG_ENV=production   # 生产

# 或自定义 API 地址
export FREELOG_API_URL=http://custom.api.com
```

---

## 参考文档

- [资源详情](https://doc.freelog.com/resourceV2/%E6%9F%A5%E7%9C%8B%E5%8D%95%E4%B8%AA%E8%B5%84%E6%BA%90%E8%AF%A6%E6%83%85.html)
- [版本列表](https://doc.freelog.com/resourceV2/%E6%9F%A5%E7%9C%8B%E8%B5%84%E6%BA%90%E7%89%88%E6%9C%AC%E5%88%97%E8%A1%A8.html)
- [支付事件](https://doc.freelog.com/contract-event-v2/%E4%BA%A4%E6%98%93%E4%BA%8B%E4%BB%B6.html)


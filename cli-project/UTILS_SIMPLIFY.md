# Utils 精简指南

## 🎯 精简目标

**移除不必要的封装，直接使用原生库**

---

## ❌ 已删除的过度封装

### 1. `spinner.js` - 删除 ✅

**原因**: 完全是对 `ora` 的简单包装，没有增加任何价值

**替换方案**:
```javascript
// 旧代码 ❌
const { startSpinner, succeedSpinner, failSpinner } = require('../utils/spinner');
const spinner = startSpinner('加载中...');
succeedSpinner('成功');

// 新代码 ✅
const ora = require('ora');
const spinner = ora('加载中...').start();
spinner.succeed('成功');
```

### 2. `output.js` - 精简 ✅

**原因**: 大部分是对 `chalk` 的简单包装

**保留的函数** (有业务价值):
- `createTable()` - 表格配置
- `printDependenciesTable()` - 依赖表格
- `printAuthStatus()` - 登录状态
- `printValidationResult()` - 验证结果

**删除的函数** (简单封装):
- ~~`success()`~~ → 使用 `chalk.green('✔ ') + message`
- ~~`error()`~~ → 使用 `chalk.red('✖ ') + message`
- ~~`warning()`~~ → 使用 `chalk.yellow('⚠ ') + message`
- ~~`info()`~~ → 使用 `chalk.blue('ℹ ') + message`
- ~~`title()`~~ → 使用 `chalk.bold.cyan(title)`
- ~~`divider()`~~ → 使用 `chalk.gray('─'.repeat(50))`

---

## ✅ 保留的工具

### 1. `crypto.js` ✅

**原因**: 有实际的加密逻辑，不是简单封装
- AES-256-CBC 加密
- IV 生成和管理
- 对象加密/解密

### 2. `validator.js` ✅

**原因**: 有业务验证逻辑
- 版本号验证
- 资源标识符解析
- 依赖验证

### 3. `file.js` ✅

**原因**: 有文件操作逻辑
- 文件压缩
- 大小验证
- 类型检查

### 4. `version-selector.js` ✅

**原因**: 有业务逻辑
- 版本列表获取
- 交互式选择

---

## 📝 迁移指南

### Spinner 迁移

```javascript
// 旧代码
const { startSpinner, succeedSpinner, failSpinner } = require('../utils/spinner');

let spinner = startSpinner('处理中...');
try {
  // 逻辑
  succeedSpinner('成功');
  spinner = null;
} catch (err) {
  failSpinner('失败');
}

// 新代码  
const ora = require('ora');

const spinner = ora('处理中...').start();
try {
  // 逻辑
  spinner.succeed('成功');
} catch (err) {
  spinner.fail('失败');
}
```

### Output 迁移

```javascript
// 旧代码
const { success, error, warning, info, title } = require('../utils/output');

success('操作成功');
error('操作失败');
warning('警告信息');
info('提示信息');
title('标题');

// 新代码
const chalk = require('chalk');

console.log(chalk.green('✔ ') + '操作成功');
console.log(chalk.red('✖ ') + '操作失败');
console.log(chalk.yellow('⚠ ') + '警告信息');
console.log(chalk.blue('ℹ ') + '提示信息');
console.log(chalk.bold.cyan('\n标题\n'));
```

### 保留的 Output 函数

```javascript
// 这些函数仍然保留，因为有业务价值
const { printDependenciesTable, printAuthStatus, printValidationResult } = require('../utils/output');

printDependenciesTable(deps);
printAuthStatus(status);
printValidationResult(result);
```

---

## 📊 精简成果

| 文件 | 精简前 | 精简后 | 状态 |
|------|--------|--------|------|
| `spinner.js` | 103 行 | **删除** | ✅ 直接用 ora |
| `output.js` | 219 行 | **104 行** | ✅ 仅保留复杂函数 |
| `crypto.js` | 109 行 | 109 行 | ✅ 保留 |
| `validator.js` | 208 行 | 208 行 | ✅ 保留 |
| `file.js` | 203 行 | 203 行 | ✅ 保留 |
| `version-selector.js` | ~50 行 | ~50 行 | ✅ 保留 |

**总精简**: ~320 行 → **删除 ~220 行** (-69%)

---

## 🔄 需要更新的文件

所有命令文件都需要更新 import 和调用方式：

1. `src/commands/auth.js` ✅ 已更新
2. `src/commands/init.js`
3. `src/commands/publish.js`
4. `src/commands/sync.js`
5. `src/commands/analyze.js`
6. `src/commands/dependency/add.js`
7. `src/commands/dependency/change.js`
8. `src/commands/dependency/update.js`
9. `src/commands/dependency/list.js`
10. `src/commands/dependency/remove.js`

---

## 💡 原则

**什么该封装**:
- ✅ 有复杂业务逻辑
- ✅ 需要状态管理
- ✅ 多处复用的复杂格式化
- ✅ 需要配置的功能

**什么不该封装**:
- ❌ 简单的一行代码包装
- ❌ 只是改个函数名
- ❌ 没有增加任何逻辑
- ❌ 直接透传参数

---

**简洁！直接！少一层抽象！** ✨

最后更新：2025-11-03


# ANTLR4 教程总结

## 📚 完整教程结构

### 基础篇 (01-basics/)
1. **安装与环境配置** (`01-installation.md`)
   - Java JDK 安装（Windows/Mac/Linux）
   - ANTLR4 安装（npm 和 JAR 两种方式）
   - IDE 插件配置（VS Code、IntelliJ）
   - 验证安装

2. **核心概念** (`02-concepts.md`)
   - 词法分析 vs 语法分析
   - Token 和 AST 概念
   - Visitor vs Listener 对比
   - ANTLR4 工作流程

3. **快速开始** (`03-quick-start.md`)
   - 第一个 ANTLR4 程序
   - 计算器示例完整实现
   - 代码流程理解

### 词法分析篇 (02-lexer/)
1. **词法分析基础** (`01-lexer-basics.md`)
   - Token 概念
   - 词法规则语法
   - 字符类、量词、选择
   - 片段规则（Fragment）
   - 词法动作（skip, channel, mode）

2. **Token 详解** (`02-tokens.md`)
   - Token 结构
   - Token 流操作
   - Token 通道
   - 调试技巧

3. **高级词法规则** (`03-lexer-rules.md`) ⭐ 新增
   - 词法模式（Lexer Modes）
   - 岛屿语法（Island Grammars）
   - Unicode 支持
   - 缩进敏感语言处理
   - 性能优化

### 语法分析篇 (03-parser/)
1. **语法分析基础** (`01-parser-basics.md`)
   - 语法规则语法
   - 左递归处理
   - 优先级和结合性
   - 常见模式

2. **语法文件编写** (`02-grammar.md`)
   - 语法文件结构
   - 选项配置
   - 规则组织
   - 最佳实践

3. **抽象语法树** (`03-ast.md`)
   - AST 概念
   - 访问 AST 节点
   - AST 遍历
   - AST 转换

### Visitor 模式篇 (04-visitor/)
1. **Visitor 模式详解** (`01-visitor-pattern.md`)
   - Visitor vs Listener 对比
   - 基本用法
   - 方法命名规则
   - 访问子节点

2. **树遍历技巧** (`02-tree-traversal.md`)
   - 遍历顺序
   - 遍历控制
   - 遍历模式
   - 性能优化

3. **Visitor 案例集合** (`03-visitor-examples.md`)
   - 表达式求值器
   - 代码生成器
   - AST 转换器
   - 符号表构建器
   - 类型检查器
   - 优化器

### Listener 模式篇 (05-listener/)
1. **Listener 模式详解** (`01-listener-pattern.md`)
   - Listener vs Visitor 对比
   - 基本用法
   - 遍历顺序
   - 实际案例

2. **Listener 案例集合** (`02-listener-examples.md`)
   - 表达式求值器（栈实现）
   - 标识符收集器
   - 代码格式化器
   - 符号表构建器
   - 错误检查器
   - 统计信息收集器

### 高级特性篇 (06-advanced/)
1. **错误处理** (`01-error-handling.md`)
   - 自定义错误监听器
   - 错误恢复策略
   - 错误信息增强

2. **语义谓词** (`02-semantic-predicates.md`)
   - 基本用法
   - 实际案例
   - 注意事项

3. **动作与属性** (`03-actions.md`)
   - 动作概念
   - 属性使用
   - 注意事项

4. **调试技巧** (`04-debugging.md`) ⭐ 新增
   - 调试工具（TestRig、VS Code 插件）
   - 代码级调试
   - 常见问题诊断
   - 性能调试

5. **性能优化** (`05-performance.md`) ⭐ 新增
   - 语法优化
   - 词法优化
   - 运行时优化
   - 内存优化
   - 并行处理

### 实战应用篇 (07-real-world/) ⭐ 新增
1. **DSL 设计指南** (`01-dsl-design.md`)
   - DSL 概念和类型
   - 设计原则
   - 设计流程
   - 语法糖设计
   - 错误处理设计

2. **项目集成指南** (`02-integration.md`)
   - Node.js/TypeScript 集成
   - 前端项目集成（Webpack、Vite）
   - 测试集成（Jest）
   - CI/CD 集成
   - npm 包发布

3. **常见语法模式** (`03-common-patterns.md`)
   - 表达式语法模式
   - 语句语法模式
   - 声明语法模式
   - 列表和集合模式
   - 字符串和模板模式
   - 注释模式
   - 导入和模块模式
   - 类型系统模式
   - 完整编程语言示例

### 常见问题篇 (08-faq/) ⭐ 新增
1. **常见问题与解决方案** (`01-common-issues.md`)
   - 安装问题（5 个）
   - 语法问题（4 个）
   - 运行时问题（3 个）
   - 错误处理问题（2 个）
   - Visitor vs Listener（2 个）
   - 词法模式问题（2 个）
   - 调试技巧（3 个）
   - 性能问题（1 个）

## 🎯 案例项目

### 1. 计算器 (`examples/calculator/`)
- **功能**：四则运算、括号、函数调用、变量
- **学习重点**：表达式解析、运算符优先级、Visitor 模式
- **文件**：完整的 TypeScript 项目

### 2. JSON 解析器 (`examples/json-parser/`)
- **功能**：完整的 JSON 解析
- **学习重点**：复杂数据结构、转义字符、递归结构
- **文件**：完整的 TypeScript 项目

### 3. SQL 解析器 (`examples/sql-parser/`)
- **功能**：SELECT、INSERT、UPDATE、DELETE
- **学习重点**：多语句解析、关键字处理、复杂查询
- **文件**：完整的 TypeScript 项目

### 4. 策略语言 (`examples/policy-language/`)
- **功能**：策略语言解析（参考当前项目）
- **学习重点**：状态机建模、事件驱动、DSL 设计
- **文件**：完整的 TypeScript 项目

## 📖 学习路径建议

### 初学者路径（1-2 周）
1. 阅读基础篇（3 个文档）
2. 完成快速开始示例
3. 阅读词法分析基础
4. 阅读语法分析基础
5. 完成计算器案例

### 进阶路径（2-4 周）
1. 深入学习词法分析（含高级词法规则）
2. 深入学习语法分析
3. 学习 Visitor 模式
4. 学习 Listener 模式
5. 完成 JSON 和 SQL 解析器案例

### 高级路径（1-2 月）
1. 学习高级特性（调试、性能优化）
2. 学习实战应用（DSL 设计、项目集成）
3. 完成策略语言案例
4. 设计自己的 DSL

## 🔑 关键概念速查

| 概念 | 说明 | 相关文档 |
|------|------|----------|
| Lexer | 词法分析器，字符流 → Token 流 | `02-lexer/` |
| Parser | 语法分析器，Token 流 → AST | `03-parser/` |
| Token | 词法单元，最小的语法单位 | `02-lexer/02-tokens.md` |
| AST | 抽象语法树，源代码的树形表示 | `03-parser/03-ast.md` |
| Visitor | 显式遍历 AST 的模式 | `04-visitor/` |
| Listener | 隐式遍历 AST 的模式 | `05-listener/` |
| Grammar | 语法文件，定义语言规则 | `03-parser/02-grammar.md` |
| Lexer Mode | 词法模式，处理嵌套结构 | `02-lexer/03-lexer-rules.md` |
| DSL | 领域特定语言 | `07-real-world/01-dsl-design.md` |

## 📊 文档统计

| 类别 | 文档数 | 说明 |
|------|--------|------|
| 基础篇 | 3 | 入门必读 |
| 词法分析篇 | 3 | 词法规则编写 |
| 语法分析篇 | 3 | 语法规则编写 |
| Visitor 模式篇 | 3 | 显式遍历 |
| Listener 模式篇 | 2 | 隐式遍历 |
| 高级特性篇 | 5 | 进阶内容 |
| 实战应用篇 | 3 | 实际项目 |
| 常见问题篇 | 1 | FAQ |
| **总计** | **23** | **完整教程** |

## 💡 最佳实践总结

1. **语法设计**
   - 清晰的规则命名
   - 通过规则层次体现优先级
   - 避免过度嵌套
   - 使用辅助规则提高可读性

2. **代码组织**
   - 使用 Visitor 进行代码生成和转换
   - 使用 Listener 进行信息收集
   - 保持 Visitor/Listener 类单一职责
   - 使用类型系统提高安全性

3. **错误处理**
   - 提供清晰的错误信息
   - 收集所有错误而不是遇到第一个就停止
   - 包含位置信息（行号、列号）
   - 提供修复建议（如果可能）

4. **性能优化**
   - 缓存计算结果
   - 提前终止不必要的遍历
   - 避免重复解析
   - 使用 SLL 模式提高速度

## 🛠️ 工具和资源

### 必备工具
- Java JDK 8+
- ANTLR4 (npm 或 JAR)
- TypeScript/JavaScript 运行时
- IDE 插件（VS Code 或 IntelliJ）

### 推荐资源
- [ANTLR4 官方文档](https://github.com/antlr/antlr4/blob/master/doc/index.md)
- [ANTLR4 GitHub](https://github.com/antlr/antlr4)
- [语法规则参考](https://github.com/antlr/antlr4/blob/master/doc/grammars.md)
- [ANTLR4 语法库](https://github.com/antlr/grammars-v4)

## 🎓 下一步

完成本教程后，你可以：
1. 设计自己的领域特定语言（DSL）
2. 解析配置文件（JSON、XML、YAML）
3. 构建代码分析工具
4. 实现查询语言解析器
5. 创建代码转换工具

祝学习愉快！🚀

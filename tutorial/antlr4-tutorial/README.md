# ANTLR4 完整教程与案例

这是一个全面的 ANTLR4 学习资源，包含详细的教程文档和丰富的实战案例。

## 📚 目录结构

```
antlr4-tutorial/
├── README.md                    # 本文件
├── 01-basics/                   # 基础教程
│   ├── 01-installation.md      # 安装与环境配置
│   ├── 02-concepts.md          # 核心概念
│   └── 03-quick-start.md       # 快速开始
├── 02-lexer/                    # 词法分析教程
│   ├── 01-lexer-basics.md      # 词法分析基础
│   ├── 02-tokens.md            # Token 详解
│   └── 03-lexer-rules.md       # 高级词法规则
├── 03-parser/                   # 语法分析教程
│   ├── 01-parser-basics.md     # 语法分析基础
│   ├── 02-grammar.md           # 语法文件编写
│   └── 03-ast.md               # 抽象语法树
├── 04-visitor/                  # Visitor 模式教程
│   ├── 01-visitor-pattern.md   # Visitor 模式详解
│   ├── 02-tree-traversal.md    # 树遍历
│   └── 03-visitor-examples.md  # Visitor 案例
├── 05-listener/                 # Listener 模式教程
│   ├── 01-listener-pattern.md  # Listener 模式详解
│   └── 02-listener-examples.md # Listener 案例
├── 06-advanced/                 # 高级特性
│   ├── 01-error-handling.md    # 错误处理
│   ├── 02-semantic-predicates.md # 语义谓词
│   ├── 03-actions.md           # 动作与属性
│   ├── 04-debugging.md         # 调试技巧
│   └── 05-performance.md       # 性能优化
├── 07-real-world/               # 实战应用
│   ├── 01-dsl-design.md        # DSL 设计指南
│   ├── 02-integration.md       # 项目集成指南
│   └── 03-common-patterns.md   # 常见语法模式
├── 08-faq/                      # 常见问题
│   └── 01-common-issues.md     # 常见问题与解决方案
├── 09-project-analysis/         # 当前项目解析
│   ├── 01-overview.md          # 项目概述
│   ├── 02-policy-syntax.md     # 策略语言语法
│   ├── 03-state-machine.md     # 状态机模型
│   ├── 04-compile-process.md   # 编译流程
│   ├── 05-tools.md             # 工具类详解
│   ├── 06-events.md            # 事件系统
│   └── 07-api-reference.md     # API 参考
└── examples/                    # 实战案例项目
    ├── calculator/              # 计算器案例
    ├── json-parser/             # JSON 解析器
    ├── sql-parser/              # SQL 解析器
    └── policy-language/         # 策略语言（参考当前项目）
```

## 🚀 快速开始

### 前置要求

- Java JDK 8+ （ANTLR4 需要 Java 来生成代码）
- Node.js 12+ （JavaScript 运行时）
- npm 或 yarn

### 安装 ANTLR4

#### 方式一：使用 npm（推荐）

```bash
npm install -g antlr4ts-cli
npm install antlr4ts
```

#### 方式二：下载 JAR 文件

```bash
# 下载 ANTLR4 JAR 文件
wget https://www.antlr.org/download/antlr-4.13.1-complete.jar

# 设置别名（Linux/Mac）
alias antlr4='java -jar /path/to/antlr-4.13.1-complete.jar'

# Windows PowerShell
function antlr4 { java -jar C:\path\to\antlr-4.13.1-complete.jar $args }
```

## 📖 学习路径

### 初学者路径

1. **基础入门** → `01-basics/`
   - 了解 ANTLR4 是什么
   - 安装配置环境
   - 编写第一个语法文件

2. **词法分析** → `02-lexer/`
   - 理解 Token 和词法规则
   - 编写词法分析器

3. **语法分析** → `03-parser/`
   - 理解语法规则
   - 构建语法树

4. **Visitor 模式** → `04-visitor/`
   - 学习如何遍历语法树
   - 实现代码生成或转换

### 进阶路径

5. **Listener 模式** → `05-listener/`
   - 学习另一种遍历方式
   - 理解两种模式的差异

6. **高级特性** → `06-advanced/`
   - 错误处理
   - 语义谓词
   - 动作和属性

7. **实战案例** → `examples/`
   - 通过完整项目巩固知识

## 🎯 案例项目

### 1. 计算器 (Calculator)
一个支持四则运算、括号、函数调用的计算器。

**学习重点：**
- 表达式解析
- 运算符优先级
- 递归下降解析

### 2. JSON 解析器
完整的 JSON 解析器实现。

**学习重点：**
- 复杂数据结构解析
- 数组和对象处理
- 错误恢复

### 3. SQL 解析器
简化版 SQL 解析器，支持 SELECT、INSERT、UPDATE、DELETE。

**学习重点：**
- 多语句解析
- 关键字处理
- 复杂查询结构

### 4. 策略语言 (Policy Language)
参考当前项目的策略语言实现。

**学习重点：**
- 状态机建模
- 事件驱动解析
- 领域特定语言设计

## 📝 使用说明

每个案例项目都包含：
- `README.md` - 项目说明和使用方法
- `*.g4` - 语法文件
- `src/` - 源代码
- `test/` - 测试用例
- `package.json` - 项目配置

## 🔗 相关资源

- [ANTLR4 官方文档](https://github.com/antlr/antlr4/blob/master/doc/index.md)
- [ANTLR4 GitHub](https://github.com/antlr/antlr4)
- [ANTLR4 语法规则参考](https://github.com/antlr/antlr4/blob/master/doc/grammars.md)

## 💡 学习建议

1. **循序渐进**：按照教程顺序学习，不要跳跃
2. **动手实践**：每学一个概念，立即编写代码验证
3. **阅读案例**：通过案例项目理解实际应用
4. **调试技巧**：使用 ANTLR4 的调试工具可视化语法树
5. **社区交流**：遇到问题查阅官方文档或社区

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License

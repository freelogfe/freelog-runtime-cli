# ANTLR4 安装与环境配置

## 什么是 ANTLR4？

ANTLR (ANother Tool for Language Recognition) 是一个强大的解析器生成器，用于读取、处理、执行或翻译结构化文本或二进制文件。

ANTLR4 是第四代版本，支持多种目标语言（Java, C#, Python, JavaScript, Go, C++, Swift 等）。

## ⚠️ 重要概念：ANTLR4 的两个部分

**在开始安装之前，必须理解 ANTLR4 分为两个独立的部分：**

| 部分 | 作用 | 运行环境 | 何时需要 |
|------|------|----------|----------|
| **ANTLR4 Tool** | 从 `.g4` 语法文件生成 Lexer/Parser 代码 | **需要 Java** | 开发时（修改语法后） |
| **antlr4 npm 包** | 运行时库，执行已生成的 Parser | **纯 Node.js** | 运行时 |

### 用比喻来理解

```
┌─────────────────────────────────────────────────────────────────┐
│  ANTLR4 就像一个"翻译系统"                                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  📝 语法文件 (.g4)     →  相当于"翻译规则手册"                    │
│                                                                 │
│  🖨️ ANTLR4 Tool       →  相当于"印刷机"（需要 Java）             │
│     (java -jar antlr4.jar)                                      │
│                                                                 │
│  📚 生成的代码 (gen/)  →  相当于"印刷好的书"                      │
│                                                                 │
│  👁️ antlr4 npm 包     →  相当于"读书的能力"（纯 Node.js）        │
│                                                                 │
│  如果书已经印好了（gen/ 目录存在），你只需要读书，不需要印刷机！   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 你需要安装 Java 吗？

| 你的场景 | 需要 Java？ | 说明 |
|----------|-------------|------|
| 使用已有项目（gen/ 已存在） | ❌ **不需要** | 代码已生成，直接 `npm install` 即可 |
| 只运行项目，不改语法 | ❌ **不需要** | 只用到 antlr4 npm 运行时 |
| 修改 `.g4` 语法文件 | ✅ **需要** | 需要重新生成代码 |
| 从零开始新建 ANTLR4 项目 | ✅ **需要** | 需要生成初始代码 |

### 实际例子：resource-policy-lang 项目

```
resource-policy-lang/
├── resourcePolicy.g4      ← 语法文件（源码）
├── gen/                   ← 已生成的代码（已提交到 Git）
│   ├── LexToken.js        ✅ 已存在
│   ├── resourcePolicy.js  ✅ 已存在
│   └── ...
├── package.json
│   └── "antlr4": "4.8.0"  ← npm 运行时库（纯 Node.js）
└── ...

# 如果 gen/ 目录已存在，你只需要：
npm install    # 安装依赖（包括 antlr4 npm 包）
node test/testIndex.js    # 直接运行，不需要 Java！

# 只有当你修改 resourcePolicy.g4 后，才需要：
npm run build  # 这时需要 Java 来重新生成 gen/ 目录
```

---

## 安装步骤

### 1. 安装 Java JDK（仅开发语法时需要）

> **注意**：如果你只是使用已有的 ANTLR4 项目（gen/ 目录已存在），可以跳过此步骤！

ANTLR4 Tool 需要 Java 来运行代码生成。

#### Windows

1. 下载 [Oracle JDK](https://www.oracle.com/java/technologies/downloads/) 或 [OpenJDK](https://adoptium.net/)
2. 安装 JDK
3. 配置环境变量：
   ```powershell
   # 添加到系统环境变量 PATH
   C:\Program Files\Java\jdk-17\bin
   ```
4. 验证安装：
   ```bash
   java -version
   ```

#### macOS

```bash
# 使用 Homebrew
brew install openjdk@17

# 配置环境变量
echo 'export PATH="/opt/homebrew/opt/openjdk@17/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

#### Linux

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install openjdk-17-jdk

# 验证
java -version
```

### 2. 安装 ANTLR4

#### 方式一：使用 npm（推荐用于 JavaScript/TypeScript 项目）

```bash
# 全局安装 CLI 工具
npm install -g antlr4ts-cli

# 安装运行时库
npm install antlr4ts

# 安装类型定义（TypeScript）
npm install --save-dev @types/antlr4ts
```

#### 方式二：下载 JAR 文件（通用方法）

1. 下载 ANTLR4 JAR：
   ```bash
   # 使用 curl
   curl -O https://www.antlr.org/download/antlr-4.13.1-complete.jar
   
   # 或使用 wget
   wget https://www.antlr.org/download/antlr-4.13.1-complete.jar
   ```

2. 设置别名：

   **Windows PowerShell:**
   ```powershell
   # 创建函数
   function antlr4 { 
       java -jar C:\path\to\antlr-4.13.1-complete.jar $args 
   }
   
   # 添加到 PowerShell 配置文件
   notepad $PROFILE
   # 将上面的函数添加到文件中
   ```

   **Linux/Mac:**
   ```bash
   # 添加到 ~/.bashrc 或 ~/.zshrc
   alias antlr4='java -jar /path/to/antlr-4.13.1-complete.jar'
   
   # 重新加载配置
   source ~/.bashrc  # 或 source ~/.zshrc
   ```

3. 验证安装：
   ```bash
   antlr4
   # 应该看到使用说明
   ```

### 3. 安装 IDE 插件（可选但推荐）

#### Visual Studio Code

1. 安装插件：
   - **ANTLR4 grammar syntax support** (mike-lischke)
   - **ANTLR4 grammar syntax support** (evansiroky)

2. 配置插件：
   ```json
   {
     "antlr4.generation": {
       "mode": "external",
       "language": "JavaScript",
       "outputDir": "gen"
     }
   }
   ```

#### IntelliJ IDEA

1. 安装插件：
   - File → Settings → Plugins
   - 搜索 "ANTLR v4 grammar plugin"
   - 安装并重启

## 验证安装

创建一个简单的测试：

### 1. 创建语法文件 `Hello.g4`

```antlr
grammar Hello;
r  : 'hello' ID ;         // 匹配关键字 hello，后跟标识符
ID : [a-z]+ ;             // 匹配小写字母标识符
WS : [ \t\r\n]+ -> skip ; // 跳过空白字符
```

### 2. 生成解析器代码

```bash
# JavaScript 目标
antlr4 -Dlanguage=JavaScript Hello.g4

# 或使用 npm 版本
antlr4ts Hello.g4
```

### 3. 测试解析器

创建 `test.js`：

```javascript
const antlr4 = require('antlr4');
const HelloLexer = require('./HelloLexer').HelloLexer;
const HelloParser = require('./HelloParser').HelloParser;

const input = "hello world";
const chars = new antlr4.InputStream(input);
const lexer = new HelloLexer(chars);
const tokens = new antlr4.CommonTokenStream(lexer);
const parser = new HelloParser(tokens);
parser.buildParseTrees = true;
const tree = parser.r();

console.log(tree.toStringTree(parser.ruleNames));
```

运行：
```bash
node test.js
```

如果看到输出，说明安装成功！

## 常见问题

### Q: 我必须安装 Java 吗？

**A:** 取决于你的使用场景：

```
┌────────────────────────────────────────────────────────────┐
│ 场景                              │ 需要 Java？            │
├────────────────────────────────────────────────────────────┤
│ npm install 后直接使用项目        │ ❌ 不需要              │
│ 运行已有的解析器                  │ ❌ 不需要              │
│ 修改 .g4 语法文件后重新生成代码   │ ✅ 需要                │
│ 创建全新的 ANTLR4 项目            │ ✅ 需要                │
└────────────────────────────────────────────────────────────┘
```

**核心原理**：
- `antlr4` npm 包是**纯 JavaScript 运行时**，不需要 Java
- ANTLR4 Tool（JAR 文件）是**代码生成器**，需要 Java
- 如果 `gen/` 目录已经存在，说明代码已生成，不需要 Java

### Q: 提示找不到 java 命令

**A:** 确保 Java 已正确安装并添加到 PATH 环境变量。

### Q: antlr4 npm 包 和 JAR 文件有什么区别？

**A:** 

| 组件 | 类型 | 作用 | 依赖 |
|------|------|------|------|
| `antlr4` npm 包 | 运行时库 | 执行已生成的 Parser | Node.js |
| `antlr-4.x.x-complete.jar` | 代码生成器 | 从 .g4 生成 JS 代码 | Java |

**工作流程**：
```
.g4 文件  ──[JAR+Java]──>  生成的 .js 文件  ──[npm包+Node.js]──>  解析输入
           (开发时一次)                        (运行时每次)
```

### Q: 如何选择目标语言？

**A:** 使用 `-Dlanguage` 参数：
```bash
antlr4 -Dlanguage=JavaScript Hello.g4    # JavaScript
antlr4 -Dlanguage=Java Hello.g4           # Java
antlr4 -Dlanguage=Python3 Hello.g4       # Python
antlr4 -Dlanguage=TypeScript Hello.g4    # TypeScript
```

### Q: 为什么有些项目把 gen/ 目录提交到 Git？

**A:** 这样做的好处是：
- 使用者不需要安装 Java
- `npm install` 后即可直接使用
- 降低了使用门槛

缺点是：
- 生成的代码会增加仓库体积
- 需要确保 .g4 和 gen/ 保持同步

## 下一步

安装完成后，继续学习：
- [核心概念](./02-concepts.md)
- [快速开始](./03-quick-start.md)

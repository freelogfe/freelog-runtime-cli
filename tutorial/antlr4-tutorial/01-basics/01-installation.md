# ANTLR4 安装与环境配置

## 什么是 ANTLR4？

ANTLR (ANother Tool for Language Recognition) 是一个强大的解析器生成器，用于读取、处理、执行或翻译结构化文本或二进制文件。

ANTLR4 是第四代版本，支持多种目标语言（Java, C#, Python, JavaScript, Go, C++, Swift 等）。

## 安装步骤

### 1. 安装 Java JDK

ANTLR4 需要 Java 来运行代码生成工具。

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

### Q: 提示找不到 java 命令

**A:** 确保 Java 已正确安装并添加到 PATH 环境变量。

### Q: npm 安装的 antlr4ts 和 JAR 文件有什么区别？

**A:** 
- `antlr4ts` 是 JavaScript/TypeScript 版本的运行时库
- JAR 文件是通用的代码生成工具
- 两者可以配合使用：用 JAR 生成代码，用 npm 包作为运行时

### Q: 如何选择目标语言？

**A:** 使用 `-Dlanguage` 参数：
```bash
antlr4 -Dlanguage=JavaScript Hello.g4    # JavaScript
antlr4 -Dlanguage=Java Hello.g4           # Java
antlr4 -Dlanguage=Python3 Hello.g4       # Python
antlr4 -Dlanguage=TypeScript Hello.g4    # TypeScript
```

## 下一步

安装完成后，继续学习：
- [核心概念](./02-concepts.md)
- [快速开始](./03-quick-start.md)

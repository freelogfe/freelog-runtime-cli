# 项目集成指南

## Node.js/TypeScript 项目集成

### 项目结构

```
my-project/
├── grammar/
│   └── MyGrammar.g4
├── src/
│   ├── parser/
│   │   ├── index.ts
│   │   └── visitor.ts
│   └── index.ts
├── gen/                    # 生成的代码
├── package.json
└── tsconfig.json
```

### package.json 配置

```json
{
  "name": "my-project",
  "scripts": {
    "generate": "antlr4ts -visitor grammar/MyGrammar.g4 -o gen",
    "prebuild": "npm run generate",
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "antlr4ts": "^0.5.0-alpha.4"
  },
  "devDependencies": {
    "antlr4ts-cli": "^0.5.0-alpha.4",
    "typescript": "^4.9.0"
  }
}
```

### tsconfig.json 配置

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "outDir": "./dist",
    "rootDir": "./",
    "strict": true,
    "esModuleInterop": true
  },
  "include": ["src/**/*", "gen/**/*"],
  "exclude": ["node_modules"]
}
```

### 封装解析器

```typescript
// src/parser/index.ts
import { InputStream, CommonTokenStream } from 'antlr4ts';
import { MyGrammarLexer } from '../../gen/MyGrammarLexer';
import { MyGrammarParser } from '../../gen/MyGrammarParser';
import { MyVisitor } from './visitor';

export class Parser {
    parse(input: string): any {
        const chars = new InputStream(input);
        const lexer = new MyGrammarLexer(chars);
        const tokens = new CommonTokenStream(lexer);
        const parser = new MyGrammarParser(tokens);
        
        // 错误处理
        parser.removeErrorListeners();
        parser.addErrorListener(new MyErrorListener());
        
        const tree = parser.program();
        const visitor = new MyVisitor();
        return visitor.visit(tree);
    }
}

export function parse(input: string): any {
    return new Parser().parse(input);
}
```

## 前端项目集成

### Webpack 配置

```javascript
// webpack.config.js
module.exports = {
    entry: './src/index.ts',
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: 'ts-loader',
                exclude: /node_modules/,
            },
        ],
    },
    resolve: {
        extensions: ['.tsx', '.ts', '.js'],
        fallback: {
            // antlr4ts 需要这些 polyfill
            "stream": require.resolve("stream-browserify"),
            "buffer": require.resolve("buffer/")
        }
    },
};
```

### Vite 配置

```javascript
// vite.config.js
import { defineConfig } from 'vite';

export default defineConfig({
    optimizeDeps: {
        include: ['antlr4ts']
    }
});
```

## 测试集成

### Jest 配置

```javascript
// jest.config.js
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    modulePathIgnorePatterns: ['<rootDir>/dist/'],
    collectCoverageFrom: ['src/**/*.ts'],
};
```

### 测试示例

```typescript
// __tests__/parser.test.ts
import { parse } from '../src/parser';

describe('Parser', () => {
    test('should parse simple expression', () => {
        const result = parse('3 + 4');
        expect(result).toBe(7);
    });
    
    test('should handle syntax error', () => {
        expect(() => parse('3 +')).toThrow();
    });
});
```

## CI/CD 集成

### GitHub Actions

```yaml
# .github/workflows/ci.yml
name: CI

on: [push, pull_request]

jobs:
  build:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Java
      uses: actions/setup-java@v3
      with:
        distribution: 'temurin'
        java-version: '17'
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Generate parser
      run: npm run generate
    
    - name: Build
      run: npm run build
    
    - name: Test
      run: npm test
```

## 发布 npm 包

### package.json

```json
{
  "name": "@myorg/my-parser",
  "version": "1.0.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": [
    "dist",
    "gen"
  ],
  "scripts": {
    "prepublishOnly": "npm run build"
  }
}
```

### 发布流程

```bash
# 登录 npm
npm login

# 发布
npm publish --access public
```

## 与现有项目集成

### Express.js 集成

```typescript
import express from 'express';
import { parse } from './parser';

const app = express();
app.use(express.json());

app.post('/parse', (req, res) => {
    try {
        const result = parse(req.body.input);
        res.json({ success: true, result });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});
```

### NestJS 集成

```typescript
// parser.service.ts
import { Injectable } from '@nestjs/common';
import { parse } from './parser';

@Injectable()
export class ParserService {
    parse(input: string): any {
        return parse(input);
    }
}
```

## 错误处理最佳实践

### 自定义错误类

```typescript
export class ParseError extends Error {
    constructor(
        message: string,
        public line: number,
        public column: number,
        public input: string
    ) {
        super(message);
        this.name = 'ParseError';
    }
    
    toString(): string {
        return `${this.name}: ${this.message} at ${this.line}:${this.column}`;
    }
}
```

### 错误收集器

```typescript
class ErrorCollector extends ErrorListener<any> {
    private errors: ParseError[] = [];
    
    syntaxError(recognizer, offendingSymbol, line, column, msg, e): void {
        this.errors.push(new ParseError(msg, line, column, ''));
    }
    
    getErrors(): ParseError[] {
        return this.errors;
    }
    
    hasErrors(): boolean {
        return this.errors.length > 0;
    }
}
```

## 版本兼容性

### 语法版本管理

```typescript
interface ParserOptions {
    version?: string;
    strict?: boolean;
}

function parse(input: string, options: ParserOptions = {}): any {
    const { version = 'latest', strict = false } = options;
    
    // 根据版本选择不同的解析器
    const parser = getParser(version);
    
    if (strict) {
        parser.setStrictMode(true);
    }
    
    return parser.parse(input);
}
```

# 动作与属性

## 什么是动作？

动作（Actions）是在语法规则中嵌入的代码片段，在解析过程中执行。

## 基本用法

```antlr
grammar Actions;

expression : term (('+'|'-') term)* { 
    // 动作代码
    System.out.println("解析表达式");
} ;
```

## 属性

### 1. 返回值属性

```antlr
expression returns [int value]
    : term { $value = $term.value; }
    ;
```

### 2. 参数属性

```antlr
expression[int base] returns [int value]
    : term { $value = $term.value + $base; }
    ;
```

## 注意事项

在 JavaScript/TypeScript 中，动作的使用较少，因为：
1. Visitor 和 Listener 模式更灵活
2. 动作使语法文件与目标语言耦合
3. 代码生成和维护更复杂

**建议**：优先使用 Visitor 或 Listener 模式，而不是动作。

# freelog前端统一研发脚手架

## 阅读同目录下的`changeset使用.mhtml`


## Getting Started

### 安装：

```bash
pnpm install
```

### 调试core包

在core目录下执行

```bash
pnpm link -g
```

### 调试init包

在core目录下执行

```bash
freelog-cli init --packagePath D:\appinside\freelog-runtime-cli\packages\init
```
强制清空当前文件夹

```bash
freelog-cli init --force
```

### 发布项目

发布项目/组件

```bash
freelog-cli publish
```

强制更新所有缓存

```bash
freelog-cli publish --force
```

正式发布

```bash
freelog-cli publish --prod
```

手动指定build命令

```bash
freelog-cli publish --buildCmd "npm run build:test"
```


## More

清空本地缓存：

```bash
freelog-cli clean
```

DEBUG 模式：

```bash
freelog-cli --debug
```

调试本地包：

```bash
freelog-cli init --packagePath /Users/sam/Desktop/freelog-cli/packages/init/
```

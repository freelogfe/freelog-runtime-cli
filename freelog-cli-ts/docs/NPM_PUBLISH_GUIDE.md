# NPM 发布指南

## 发布错误：403 Forbidden - Two-factor authentication required

如果遇到以下错误：
```
npm error 403 403 Forbidden - PUT https://registry.npmjs.org/@freelog-cli%2fcli - Two-factor authentication or granular access token with bypass 2fa enabled is required to publish packages.
```

## 解决方案

### 方案一：启用双因素认证（2FA）（推荐）

1. **登录 npm 官网**
   - 访问 https://www.npmjs.com/
   - 登录你的账户

2. **启用 2FA**
   - 进入账户设置：https://www.npmjs.com/settings/[你的用户名]/profile
   - 找到 "Two-Factor Authentication" 部分
   - 选择 "Authorization Only" 或 "Authorization and Publishing"
   - 按照提示完成设置（使用手机应用如 Google Authenticator）

3. **重新登录 CLI**
   ```bash
   npm logout
   npm login
   # 输入用户名、密码和 2FA 验证码
   ```

4. **同步 pnpm 认证**
   ```bash
   # pnpm 会使用 npm 的认证信息
   pnpm whoami --registry https://registry.npmjs.org
   ```

### 方案二：使用 Granular Access Token（推荐用于 CI/CD）

如果你不想启用 2FA，可以创建一个具有 bypass 2fa 权限的 granular access token：

1. **创建 Granular Access Token**
   - 访问：https://www.npmjs.com/settings/[你的用户名]/tokens
   - 点击 "Generate New Token"
   - 选择 "Granular Access Token"
   - 设置权限：
     - **Read and Publish**：选择 `@freelog-cli/cli` 包
     - **Bypass 2FA**：启用此选项
   - 设置过期时间（建议选择较长时间）
   - 生成 token

2. **使用 Token 登录**
   ```bash
   npm logout
   npm login --auth-type=legacy
   # 输入用户名和 token（不是密码）
   ```

   或者直接配置 `.npmrc`：
   ```bash
   # 在项目根目录或用户主目录的 .npmrc 文件中添加：
   //registry.npmjs.org/:_authToken=你的token
   ```

3. **验证登录**
   ```bash
   npm whoami --registry https://registry.npmjs.org
   pnpm whoami --registry https://registry.npmjs.org
   ```

### 方案三：检查当前登录状态

```bash
# 检查 npm 登录状态
npm whoami --registry https://registry.npmjs.org

# 检查 pnpm 登录状态
pnpm whoami --registry https://registry.npmjs.org

# 如果未登录，重新登录
npm login --registry https://registry.npmjs.org
```

## 发布命令

发布到 npm：

```bash
cd freelog-cli-ts
pnpm run pub
```

或者手动发布：

```bash
cd freelog-cli-ts
pnpm publish --access public --registry https://registry.npmjs.org
```

## 如何修改 Registry

### 方法一：临时指定（推荐用于发布）

在命令中使用 `--registry` 参数：

```bash
# npm
npm publish --registry https://registry.npmjs.org

# pnpm
pnpm publish --registry https://registry.npmjs.org
```

### 方法二：在 package.json 的 scripts 中指定

```json
{
  "scripts": {
    "pub": "pnpm publish --access public --registry https://registry.npmjs.org"
  },
  "publishConfig": {
    "registry": "https://registry.npmjs.org/"
  }
}
```

### 方法三：修改全局配置

**npm：**
```bash
# 设置为官方源
npm config set registry https://registry.npmjs.org/

# 设置为淘宝镜像（下载时使用）
npm config set registry https://registry.npmmirror.com/

# 查看当前配置
npm config get registry
```

**pnpm：**
```bash
# 设置为官方源
pnpm config set registry https://registry.npmjs.org/

# 设置为淘宝镜像（下载时使用）
pnpm config set registry https://registry.npmmirror.com/

# 查看当前配置
pnpm config get registry
```

### 方法四：项目级配置（.npmrc 文件）

在项目根目录创建 `.npmrc` 文件：

```ini
# 项目级 registry（仅影响当前项目）
registry=https://registry.npmjs.org/

# 或者只针对特定包使用官方源
@freelog-cli:registry=https://registry.npmjs.org/
```

### 方法五：用户级配置（~/.npmrc）

在用户主目录的 `.npmrc` 文件中配置：

```ini
# 全局 registry
registry=https://registry.npmjs.org/

# 或者使用镜像源下载，但发布时使用官方源
registry=https://registry.npmmirror.com/
```

### 推荐配置方案

**日常开发（使用镜像源加速下载）：**
```bash
# 全局设置为镜像源
npm config set registry https://registry.npmmirror.com/
pnpm config set registry https://registry.npmmirror.com/
```

**发布时（使用官方源）：**
```bash
# 在 package.json 的 scripts 中指定官方源
# 或者在发布命令中临时指定
pnpm publish --registry https://registry.npmjs.org
```

**项目级配置（推荐）：**
在项目根目录创建 `.npmrc`：
```ini
# 下载时使用镜像源（如果全局已设置，此配置可选）
registry=https://registry.npmmirror.com/

# 发布时使用官方源（在 package.json 的 publishConfig 中配置）
```

## 注意事项

1. **Registry 配置优先级**：
   - 命令行参数 `--registry` > 项目级 `.npmrc` > 用户级 `~/.npmrc` > 全局配置
   - `package.json` 中的 `publishConfig.registry` 仅影响发布命令

2. **发布必须使用官方源**：发布包时必须使用 `https://registry.npmjs.org`，镜像源不支持发布

3. **认证同步**：pnpm 会使用 npm 的认证信息，确保 npm 已正确登录

4. **Token 安全**：不要将 token 提交到 Git 仓库，使用 `.npmrc` 文件并添加到 `.gitignore`

5. **2FA 推荐**：建议启用 2FA 以提高账户安全性

## 常见问题

### Q: 为什么已经登录了还报错？

A: npm 要求发布包时必须启用 2FA 或使用具有 bypass 2fa 权限的 token。即使你已经登录，如果没有满足这个要求，也无法发布。

### Q: 如何检查是否启用了 2FA？

A: 访问 https://www.npmjs.com/settings/[你的用户名]/profile，查看 "Two-Factor Authentication" 部分。

### Q: 可以使用镜像源发布吗？

A: 不可以。发布包必须使用官方源 `https://registry.npmjs.org`。镜像源只用于下载包。

### Q: pnpm 和 npm 的认证是共享的吗？

A: 是的。pnpm 会读取 npm 的认证信息（`.npmrc` 文件），所以只需要在 npm 中登录即可。


# 本地开发环境测试付费功能完整指南

本文档详细介绍如何在本地开发环境中测试 Aviate AI 的付费功能（会员订阅系统）。

## 目录
1. [系统架构概览](#系统架构概览)
2. [前置准备](#前置准备)
3. [环境配置](#环境配置)
4. [测试方法](#测试方法)
5. [常见问题排查](#常见问题排查)

---

## 系统架构概览

### 付费功能组件

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────────┐
│   React Native  │         │   Backend API    │         │  Apple Store    │
│   (smart-atc)   │────────▶│  (atc-server)    │────────▶│   Servers       │
│                 │         │                  │         │                 │
│  - IAP购买流程  │         │  - 收据验证      │         │  - 收据验证     │
│  - 会员状态显示 │         │  - 会员管理      │         │  - 订阅管理     │
│  - 功能权限检查 │         │  - 使用量统计    │         │                 │
└─────────────────┘         └──────────────────┘         └─────────────────┘
         │                           │
         │                           │
         └───────────────┬───────────┘
                         ▼
                 ┌──────────────┐
                 │  PostgreSQL  │
                 │   Database   │
                 │              │
                 │ - memberships│
                 │ - payments   │
                 │ - usage_recs │
                 └──────────────┘
```

### 会员等级

- **FREE**: 免费用户
  - 只能访问 KSJC 机场的 Live ATC
  - 只能使用 traffic-pattern 训练模式
  - 录音分析限制：1次（一次性配额）
  - 训练会话：无限制

- **PREMIUM**: 付费用户
  - 访问所有机场的 Live ATC
  - 访问所有训练模式
  - 无限录音分析
  - 无限训练会话

### 产品 ID

```typescript
// 月付订阅
'com.aviateai.premium.monthly'  // $14.99/月

// 年付订阅
'com.aviateai.premium.yearly'   // $69.99/年 (节省60%)

// 兼容旧版本
'com.aviateai.golden.monthly'   // 已废弃，但仍支持
'com.aviateai.golden.yearly'    // 已废弃，但仍支持
```

---

## 前置准备

### 1. 开发环境要求

- **macOS** (用于 iOS 开发)
- **Node.js** >= 18
- **PostgreSQL** >= 14
- **Xcode** (最新版本)
- **iOS 真机设备** (IAP 不能在模拟器上测试)
- **Apple Developer Account** (需要付费账号)

### 2. Apple 配置

#### 2.1 App Store Connect 配置

1. 登录 [App Store Connect](https://appstoreconnect.apple.com/)
2. 进入你的 App
3. 配置 **In-App Purchases**:
   - 创建两个自动续期订阅产品：
     - `com.aviateai.premium.monthly`
     - `com.aviateai.premium.yearly`
   - 确保产品状态为 **"Ready to Submit"**

4. 获取 **App-Specific Shared Secret**:
   ```
   App Information → App-Specific Shared Secret → Generate
   ```
   保存这个密钥，后面会用到。

#### 2.2 创建沙盒测试账号

1. 在 App Store Connect 中:
   ```
   Users and Access → Sandbox Testers → Add Tester
   ```

2. 创建测试账号:
   ```
   Email: test@example.com (可以是虚拟邮箱)
   Password: 设置一个强密码
   Country: United States
   ```

3. **重要**: 不要在真实设备上登录这个账号的 iCloud！

---

## 环境配置

### 1. 后端配置 (atc-server)

#### 1.1 环境变量配置

编辑 `.env.development`:

```bash
# 数据库连接
DATABASE_URL="postgresql://postgres:mysecretpassword@localhost:5432/smart-atc?schema=public"

# JWT 密钥
JWT_SECRET="UD5dDT3w0QrKacvxoTmyJ8gjJq/KdfkCD4j7P27iYBw="

# Apple IAP 配置
APPLE_SHARED_SECRET=261ae73c4b594a878b5e5561e4fca386  # 从 App Store Connect 获取

# Apple 登录配置
APPLE_CLIENT_ID=com.jujubecamp.aviateai

# 其他配置
PORT=3000
NODE_ENV=development
LOG_LEVEL=info

# AWS S3 (用于录音功能)
AWS_REGION=us-west-2
AWS_S3_AUDIO_BUCKET=aviate-ai-public
AWS_S3_AUDIO_PREFIX=cockpit/audio
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
```

#### 1.2 数据库初始化

```bash
cd atc-server

# 安装依赖
pnpm install

# 启动 PostgreSQL (如果使用 Docker)
docker-compose up -d postgres

# 运行数据库迁移
pnpm prisma migrate dev

# 初始化会员计划数据
pnpm prisma db seed  # 如果有 seed 脚本
```

如果没有 seed 脚本，手动插入会员计划：

```sql
-- 连接到数据库
psql postgresql://postgres:mysecretpassword@localhost:5432/smart-atc

-- 插入 Premium 会员计划
INSERT INTO membership_plans (
  id, tier, monthly_price, yearly_price, yearly_discount,
  monthly_product_id, yearly_product_id, is_active
) VALUES (
  'cuid_premium_plan',
  'PREMIUM',
  14.99,
  69.99,
  0.60,
  'com.aviateai.premium.monthly',
  'com.aviateai.premium.yearly',
  true
);
```

#### 1.3 启动后端服务

```bash
cd atc-server
pnpm dev
```

验证服务启动成功：
```bash
curl http://localhost:3000/api/v1/version
```

### 2. 前端配置 (smart-atc)

#### 2.1 环境变量配置

编辑 `app.config.js`:

```javascript
// 确保 development 环境指向你的本地 IP
const localIpAddress = getLocalIpAddress(); // 自动检测

module.exports = {
  expo: {
    // ... 其他配置
    extra: {
      // 开发环境使用本地 IP，生产环境使用 AWS
      apiBaseUrl: env === 'development' 
        ? `http://${localIpAddress}:3000/api/v1` 
        : 'http://atc-server-alb-473487194.us-west-2.elb.amazonaws.com:3000/api/v1',
      env: env,
    },
  },
};
```

#### 2.2 获取本地 IP 地址

```bash
# macOS
ipconfig getifaddr en0  # WiFi
# 或
ifconfig | grep "inet " | grep -v 127.0.0.1

# 示例输出: 192.168.1.100
```

#### 2.3 iOS 配置

确保 `app.config.js` 中允许本地 HTTP 连接：

```javascript
ios: {
  infoPlist: {
    NSAppTransportSecurity: {
      NSAllowsArbitraryLoads: true,
      NSExceptionDomains: {
        [localIpAddress]: {
          NSExceptionAllowsInsecureHTTPLoads: true,
          NSIncludesSubdomains: true,
        },
      },
    },
  },
},
```

#### 2.4 构建并安装到真机

```bash
cd smart-atc

# 安装依赖
npm install

# 预构建 iOS
npx expo prebuild --platform ios

# 打开 Xcode 项目
open ios/aviateai.xcworkspace

# 在 Xcode 中:
# 1. 选择你的开发团队 (Signing & Capabilities)
# 2. 连接 iOS 真机
# 3. 选择真机作为目标设备
# 4. 点击 Run (⌘R)
```

---

## 测试方法

### 方法一：使用 Apple 沙盒环境测试（推荐）

这是最接近真实场景的测试方法。

#### 步骤 1: 准备测试设备

1. 在 iOS 设备上，**退出 App Store 账号**:
   ```
   Settings → [Your Name] → Media & Purchases → Sign Out
   ```
   
2. **不要**在 Settings → Apple ID 中退出（保留 iCloud 登录）

#### 步骤 2: 登录应用并测试购买

1. 打开 Aviate AI 应用
2. 使用 Apple 登录或邮箱注册
3. 进入会员购买页面（点击任何需要付费的功能）
4. 点击 "Subscribe Monthly" 或 "Subscribe Yearly"
5. 系统会提示登录 App Store
6. 使用你的**沙盒测试账号**登录
7. 确认购买（沙盒环境不会真实扣费）

#### 步骤 3: 验证购买流程

观察日志输出：

**前端日志** (React Native Debugger):
```
[MembershipModal] 🔌 Connecting to Apple IAP...
[MembershipModal] ✅ Connected: true
[MembershipModal] 📦 Requesting products: ["com.aviateai.premium.monthly", "com.aviateai.premium.yearly"]
[MembershipModal] 📥 Products received: 2
[MembershipModal] 💰 Products from Apple: [...]
[MembershipModal] 🔄 Updating prices from Apple...
[MembershipModal] ✅ Prices updated successfully
```

**后端日志** (Terminal):
```
[MembershipController] Verifying receipt with Apple
[AppleReceipt] Receipt is from sandbox, retrying with sandbox URL
[AppleReceipt] Verification response: { status: 0, environment: 'Sandbox' }
[AppleReceipt] Receipt verified successfully
[MembershipService] Recording payment
[MembershipService] Updating membership
```

#### 步骤 4: 验证会员状态

1. 购买成功后，应该看到成功提示
2. 返回主界面，检查：
   - 所有机场的 Live ATC 都可以访问
   - 所有训练模式都可以访问
   - 录音分析次数显示为 "Unlimited"

3. 通过 API 验证：
```bash
# 获取用户的 access token (从应用日志或调试器中)
TOKEN="your_access_token_here"

# 查询会员状态
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/v1/membership

# 预期响应:
{
  "membership": {
    "tier": "PREMIUM",
    "expiresAt": "2025-12-13T00:00:00.000Z",
    "isActive": true
  },
  "limits": {
    "maxTrainingSessions": null,
    "maxRecordingUploads": null,
    "trainingSessionsUsed": 0,
    "recordingUploadsUsed": 0,
    "trainingSessionsResetAt": null,
    "recordingUploadsResetAt": null
  }
}
```

#### 步骤 5: 测试恢复购买

1. 在应用中点击 "Restore Purchases"
2. 系统会重新验证你的订阅
3. 会员状态应该保持为 PREMIUM

#### 步骤 6: 测试订阅过期

沙盒环境中，订阅会快速过期：
- 1个月订阅 → 5分钟后过期
- 1年订阅 → 1小时后过期

等待过期后：
1. 重启应用
2. 会员状态应该自动降级为 FREE
3. 付费功能应该被限制

---

### 方法二：直接修改数据库测试（快速测试）

适用于快速测试功能逻辑，不测试真实支付流程。

#### 步骤 1: 创建测试用户

```bash
# 在应用中注册一个测试账号
# 或使用现有账号
```

#### 步骤 2: 手动升级为 Premium

```sql
-- 连接到数据库
psql postgresql://postgres:mysecretpassword@localhost:5432/smart-atc

-- 查找你的用户 ID
SELECT id, email, display_name FROM users WHERE email = 'your_test_email@example.com';

-- 假设用户 ID 是 'clxxx123'
-- 创建或更新会员记录
INSERT INTO memberships (id, user_id, tier, expires_at, created_at, updated_at)
VALUES (
  'membership_test_001',
  'clxxx123',  -- 替换为你的用户 ID
  'PREMIUM',
  NOW() + INTERVAL '30 days',  -- 30天后过期
  NOW(),
  NOW()
)
ON CONFLICT (user_id) DO UPDATE SET
  tier = 'PREMIUM',
  expires_at = NOW() + INTERVAL '30 days',
  updated_at = NOW();
```

#### 步骤 3: 验证会员状态

重启应用，检查：
- 会员状态显示为 Premium
- 所有功能都可以访问

#### 步骤 4: 测试降级

```sql
-- 将会员降级为 FREE
UPDATE memberships 
SET tier = 'FREE', expires_at = NULL, updated_at = NOW()
WHERE user_id = 'clxxx123';
```

重启应用，检查：
- 会员状态显示为 Free
- 付费功能被限制

---

### 方法三：使用 API 直接测试（后端测试）

适用于测试后端逻辑，不涉及前端。

#### 步骤 1: 获取访问令牌

```bash
# 注册或登录
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "TestPassword123!",
    "displayName": "Test User"
  }'

# 响应中包含 accessToken
```

#### 步骤 2: 测试会员 API

```bash
TOKEN="your_access_token"

# 1. 获取会员计划
curl http://localhost:3000/api/v1/membership/plans

# 2. 获取当前会员状态
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/v1/membership

# 3. 获取使用限制
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/v1/membership/limits

# 4. 检查功能访问权限
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/v1/membership/check-access?feature=liveatc&icao=KSFO"

# 5. 获取支付历史
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/v1/membership/history
```

#### 步骤 3: 模拟收据验证（需要真实收据）

```bash
# 这需要从真实的 iOS 购买中获取 receiptData
curl -X POST http://localhost:3000/api/v1/membership/verify-payment \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "transactionId": "1000000123456789",
    "productId": "com.aviateai.premium.monthly",
    "receiptData": "base64_encoded_receipt_data_here"
  }'
```

---

## 测试场景清单

### 基础功能测试

- [ ] **免费用户限制**
  - [ ] 只能访问 KSJC 机场
  - [ ] 只能使用 traffic-pattern 模式
  - [ ] 录音分析限制为 1 次
  - [ ] 尝试访问付费功能时显示升级提示

- [ ] **购买流程**
  - [ ] 显示正确的价格（从 Apple 获取）
  - [ ] 月付购买成功
  - [ ] 年付购买成功
  - [ ] 购买后会员状态立即更新
  - [ ] 购买后所有功能解锁

- [ ] **Premium 用户权限**
  - [ ] 可以访问所有机场
  - [ ] 可以使用所有训练模式
  - [ ] 录音分析显示 "Unlimited"
  - [ ] 训练会话无限制

- [ ] **恢复购买**
  - [ ] 恢复购买成功
  - [ ] 会员状态正确恢复
  - [ ] 跨设备恢复（使用同一 Apple ID）

- [ ] **订阅过期**
  - [ ] 过期后自动降级为 FREE
  - [ ] 付费功能被限制
  - [ ] 显示续费提示

### 边缘情况测试

- [ ] **网络问题**
  - [ ] 购买时网络断开 → 本地保存，稍后重试
  - [ ] 验证时网络断开 → 显示错误，允许重试
  - [ ] 离线时显示缓存的会员状态

- [ ] **重复购买**
  - [ ] 相同 transactionId 不会重复处理
  - [ ] 显示已购买提示

- [ ] **产品 ID 不匹配**
  - [ ] 后端拒绝无效的产品 ID
  - [ ] 显示错误信息

- [ ] **收据验证失败**
  - [ ] Apple 返回错误状态码
  - [ ] 显示友好的错误信息
  - [ ] 允许用户重试

### 数据一致性测试

- [ ] **使用量统计**
  - [ ] 录音分析次数正确递增
  - [ ] 训练会话次数正确统计
  - [ ] Premium 用户不受限制

- [ ] **并发购买**
  - [ ] 多个设备同时购买 → 只记录一次
  - [ ] 数据库事务正确处理

- [ ] **支付历史**
  - [ ] 所有支付记录都被保存
  - [ ] 支付历史按时间排序
  - [ ] 显示正确的金额和状态

---

## 常见问题排查

### 1. 无法连接到后端

**症状**: 前端无法调用后端 API

**检查**:
```bash
# 1. 确认后端正在运行
curl http://localhost:3000/api/v1/version

# 2. 检查本地 IP 地址
ipconfig getifaddr en0

# 3. 确认 app.config.js 中的 IP 正确
# 4. 确认 iOS 允许 HTTP 连接（NSAppTransportSecurity）
```

**解决**:
- 确保手机和电脑在同一 WiFi 网络
- 关闭防火墙或添加例外
- 使用正确的本地 IP（不是 localhost）

### 2. Apple IAP 无法加载产品

**症状**: `Products received: 0`

**检查**:
```
[MembershipModal] ⚠️ No products returned from Apple!
[MembershipModal] 💡 Make sure:
[MembershipModal]   1. Running on a real iOS device (not simulator)
[MembershipModal]   2. Products exist in App Store Connect
[MembershipModal]   3. Product IDs match exactly
[MembershipModal]   4. Products are in "Ready to Submit" state
```

**解决**:
1. 确认在真机上测试（不是模拟器）
2. 检查 App Store Connect 中的产品配置
3. 确认产品 ID 完全匹配（大小写敏感）
4. 等待几分钟（Apple 服务器同步需要时间）
5. 尝试重启应用

### 3. 收据验证失败

**症状**: `Receipt could not be authenticated (status 21003)`

**检查**:
```bash
# 检查 APPLE_SHARED_SECRET 是否正确
grep APPLE_SHARED_SECRET atc-server/.env.development
```

**解决**:
1. 确认 `.env.development` 中的 `APPLE_SHARED_SECRET` 正确
2. 确认使用的是 App-Specific Shared Secret（不是 Master Shared Secret）
3. 检查后端日志中的环境（Sandbox vs Production）

### 4. 沙盒账号问题

**症状**: 无法使用沙盒账号购买

**解决**:
1. 确保在 Settings → App Store 中**没有**登录任何账号
2. 只在应用内购买时登录沙盒账号
3. 不要在 iCloud 中登录沙盒账号
4. 如果沙盒账号被锁定，创建一个新的

### 5. 数据库连接失败

**症状**: `DATABASE_URL validation error`

**检查**:
```bash
# 测试数据库连接
psql postgresql://postgres:mysecretpassword@localhost:5432/smart-atc -c "SELECT 1"

# 检查 PostgreSQL 是否运行
docker ps | grep postgres
# 或
pg_isready
```

**解决**:
1. 启动 PostgreSQL: `docker-compose up -d postgres`
2. 确认 `.env.development` 中的 `DATABASE_URL` 正确
3. 运行迁移: `pnpm prisma migrate dev`

### 6. 购买后会员状态未更新

**症状**: 购买成功但仍显示 FREE

**检查**:
```sql
-- 查看数据库中的会员记录
SELECT * FROM memberships WHERE user_id = 'your_user_id';

-- 查看支付记录
SELECT * FROM payments WHERE user_id = 'your_user_id' ORDER BY created_at DESC;
```

**解决**:
1. 检查后端日志，查看是否有错误
2. 确认收据验证成功
3. 手动刷新应用（下拉刷新）
4. 重新登录

### 7. 使用量统计不正确

**症状**: 录音分析次数显示错误

**检查**:
```sql
-- 查看使用记录
SELECT * FROM usage_records WHERE user_id = 'your_user_id';
```

**解决**:
1. 检查 `MembershipService.tryRecordUsageForAnalysis()` 的调用
2. 确认事务正确提交
3. 手动重置使用量（测试环境）:
```sql
DELETE FROM usage_records WHERE user_id = 'your_user_id';
```

---

## 调试技巧

### 1. 启用详细日志

**后端**:
```bash
# .env.development
LOG_LEVEL=debug
```

**前端**:
```javascript
// 在 MembershipModal.tsx 中已有详细日志
console.log('[MembershipModal] ...');
```

### 2. 使用 React Native Debugger

```bash
# 安装
brew install --cask react-native-debugger

# 启动
open "rndebugger://set-debugger-loc?host=localhost&port=8081"

# 在应用中启用调试
# 摇晃设备 → Debug → Enable Remote JS Debugging
```

### 3. 监控网络请求

在 React Native Debugger 中查看 Network 标签，可以看到所有 API 请求。

### 4. 查看数据库状态

```bash
# 连接到数据库
psql postgresql://postgres:mysecretpassword@localhost:5432/smart-atc

# 常用查询
\dt                          # 列出所有表
\d memberships               # 查看表结构
SELECT * FROM memberships;   # 查看所有会员
SELECT * FROM payments;      # 查看所有支付
SELECT * FROM usage_records; # 查看使用记录
```

### 5. 重置测试环境

```bash
# 清空所有测试数据
psql postgresql://postgres:mysecretpassword@localhost:5432/smart-atc << EOF
DELETE FROM usage_records;
DELETE FROM payments;
DELETE FROM memberships;
EOF

# 或完全重置数据库
cd atc-server
pnpm prisma migrate reset
```

---

## 生产环境部署注意事项

当准备部署到生产环境时：

1. **更新环境变量**:
   ```bash
   # .env.production
   APPLE_SHARED_SECRET=production_shared_secret
   NODE_ENV=production
   ```

2. **配置 Apple Server Notifications**:
   - 在 App Store Connect 中设置 webhook URL
   - 测试 webhook 接收

3. **监控和日志**:
   - 设置日志聚合（如 CloudWatch）
   - 配置错误报警
   - 监控支付成功率

4. **数据备份**:
   - 定期备份数据库
   - 保存支付记录

5. **安全检查**:
   - 确保 HTTPS
   - 验证 JWT 密钥强度
   - 审查权限检查逻辑

---

## 相关文档

- [APPLE_IAP_SETUP.md](../APPLE_IAP_SETUP.md) - Apple IAP 配置指南
- [API_ROUTES.md](../API_ROUTES.md) - API 路由文档
- [membershipService.ts](../src/services/membershipService.ts) - 会员服务代码
- [MembershipModal.tsx](../../smart-atc/src/components/MembershipModal.tsx) - 购买界面代码

---

## 总结

本地测试付费功能的关键步骤：

1. ✅ 配置 Apple IAP（产品、沙盒账号、Shared Secret）
2. ✅ 配置后端环境（数据库、环境变量）
3. ✅ 配置前端环境（本地 IP、HTTP 权限）
4. ✅ 在真机上测试购买流程
5. ✅ 验证会员状态和功能权限
6. ✅ 测试边缘情况和错误处理

遇到问题时，按照"常见问题排查"部分逐步检查。

Good luck! 🚀

# 沙盒环境付费订阅问题修复

## 问题描述

在沙盒环境中,用户付费订阅成功后,数据库中没有生成 `payment` 记录。

## 根本原因

### 1. Transaction ID 不匹配问题

在沙盒环境中,客户端传入的 `transactionId` 可能与 Apple 服务器返回的 `transactionId` 不一致。这导致:

- **验证失败**: 代码在 `membershipController.ts` 中严格检查 `transactionId` 是否匹配,如果不匹配会直接返回错误,不会执行到 `recordPayment` 方法
- **重复检查失败**: 使用客户端的 `transactionId` 查询数据库,但实际存储的是 Apple 的 `transactionId`,导致重复支付检查失效

### 2. 验证顺序问题

原来的代码流程:
1. 使用客户端的 `transactionId` 检查是否已存在
2. 验证 Apple 收据
3. 比较客户端和 Apple 的 `transactionId`
4. 如果不匹配,返回错误 ❌

这导致在沙盒环境中,即使收据有效,也会因为 ID 不匹配而失败。

## 解决方案

### 修改 1: 调整验证顺序

```typescript
// 先验证收据,获取 Apple 的 transaction ID
const verifiedReceipt = await AppleReceiptService.verifyReceipt(
  receiptData,
  request.server.log
);

// 使用 Apple 的 transaction ID 检查是否已处理
const existingPayment = await MembershipService.findPaymentByTransactionId(
  verifiedReceipt.transactionId
);
```

### 修改 2: 沙盒环境宽松验证

```typescript
// 在沙盒环境中,如果 transaction ID 不匹配,只记录警告,不阻止流程
if (!transactionMatches) {
  if (verifiedReceipt.environment === 'Sandbox') {
    request.server.log.info(
      { environment: 'Sandbox' },
      '[MembershipController] Sandbox environment detected - proceeding despite transaction ID mismatch'
    );
  } else {
    return reply.code(400).send({ error: 'Receipt transaction ID does not match' });
  }
}
```

### 修改 3: 使用 Apple 的 Transaction ID

```typescript
// 始终使用 Apple 返回的 transaction ID 存储到数据库
await MembershipService.recordPayment(
  userId,
  verifiedReceipt.transactionId, // 使用 Apple 的 ID
  verifiedReceipt.originalTransactionId,
  productId,
  tier,
  amount,
  'USD',
  'completed',
  receiptData,
  verifiedReceipt.expiresDate || null,
  request.server.log
);
```

### 修改 4: 增强日志记录

添加了详细的日志记录,包括:
- 收据验证前后的状态
- Apple 返回的所有关键字段
- Transaction ID 比较结果
- Payment 记录创建的详细信息

## 测试步骤

### 1. 检查现有 Payment 记录

```bash
# 列出最近的 payment 记录
npx tsx scripts/list-recent-payments.ts 20

# 检查特定用户的 payment 记录
npx tsx scripts/debug-payment.ts <userId>
```

### 2. 测试新的付费流程

1. 在 iOS 真机上使用沙盒测试账号登录
2. 购买订阅 (monthly 或 yearly)
3. 检查服务器日志,确认:
   - 收据验证成功
   - Transaction ID 信息正确记录
   - Payment 记录创建成功
   - Membership 更新成功

### 3. 验证数据库

```bash
# 检查用户的 membership 和 payment 记录
npx tsx scripts/debug-payment.ts <userId>
```

应该看到:
- ✅ Membership tier 为 PREMIUM
- ✅ expiresAt 设置正确
- ✅ Payment 记录存在
- ✅ Transaction ID 与 Apple 返回的一致

## 相关文件

### 修改的文件:
- `src/controllers/membershipController.ts` - 主要修改
- `src/services/membershipService.ts` - 增强日志
- `src/services/appleReceiptService.ts` - 增强日志

### 新增的文件:
- `scripts/debug-payment.ts` - 调试工具
- `scripts/list-recent-payments.ts` - 查看 payment 记录

## 注意事项

### 沙盒环境特点

1. **Transaction ID 可能不一致**: 客户端的 ID 可能与 Apple 返回的不同
2. **订阅自动续期**: 沙盒订阅会快速续期(几分钟内),方便测试
3. **收据格式**: 与生产环境略有不同

### 生产环境

在生产环境中:
- Transaction ID 验证更严格
- 只有在沙盒环境才会宽松处理 ID 不匹配
- 所有验证失败都会被记录

## 后续优化建议

1. **添加 webhook**: 使用 Apple Server-to-Server notifications 来处理订阅状态变化
2. **定期同步**: 定期验证用户的订阅状态,处理退款、取消等情况
3. **监控告警**: 添加 payment 创建失败的监控告警
4. **测试覆盖**: 添加沙盒环境的自动化测试

## 相关文档

- [LOCAL_PAYMENT_TESTING_GUIDE.md](./LOCAL_PAYMENT_TESTING_GUIDE.md) - 本地测试指南
- [Apple In-App Purchase Documentation](https://developer.apple.com/in-app-purchase/)
- [Receipt Validation Guide](https://developer.apple.com/documentation/appstorereceipts/verifyreceipt)

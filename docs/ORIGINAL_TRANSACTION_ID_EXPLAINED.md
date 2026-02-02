# originalTransactionId 详解

## 什么是 originalTransactionId？

`originalTransactionId` 是 Apple In-App Purchase (IAP) 系统中的一个**关键标识符**，用于追踪**自动续期订阅**的整个生命周期。

## transactionId vs originalTransactionId

### 核心区别

```
┌─────────────────────────────────────────────────────────────┐
│  首次购买                                                      │
├─────────────────────────────────────────────────────────────┤
│  transactionId:         "1000000123456789"                  │
│  originalTransactionId: "1000000123456789"  ← 相同           │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  第一次续期                                                    │
├─────────────────────────────────────────────────────────────┤
│  transactionId:         "1000000987654321"  ← 新的 ID        │
│  originalTransactionId: "1000000123456789"  ← 保持不变！      │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  第二次续期                                                    │
├─────────────────────────────────────────────────────────────┤
│  transactionId:         "1000000555555555"  ← 又是新的 ID    │
│  originalTransactionId: "1000000123456789"  ← 始终不变！      │
└─────────────────────────────────────────────────────────────┘
```

### 详细说明

| 字段 | 含义 | 变化规律 | 用途 |
|------|------|----------|------|
| **transactionId** | 当前这笔交易的唯一标识 | 每次续期都会生成新的 ID | 追踪单次交易 |
| **originalTransactionId** | 首次购买时的交易 ID | 在整个订阅周期内保持不变 | 追踪订阅关系 |

## 实际应用场景

### 场景 1: 追踪订阅关系

用户 Alice 购买了年度订阅：

```typescript
// 2024年1月 - 首次购买
{
  transactionId: "1000000111111111",
  originalTransactionId: "1000000111111111",  // 相同
  purchaseDate: "2024-01-15",
  expiresDate: "2025-01-15"
}

// 2025年1月 - 自动续期
{
  transactionId: "1000000222222222",          // 新的
  originalTransactionId: "1000000111111111",  // 保持不变
  purchaseDate: "2025-01-15",
  expiresDate: "2026-01-15"
}

// 2026年1月 - 再次续期
{
  transactionId: "1000000333333333",          // 又是新的
  originalTransactionId: "1000000111111111",  // 还是不变
  purchaseDate: "2026-01-15",
  expiresDate: "2027-01-15"
}
```

**关键点**: 通过 `originalTransactionId`，我们可以知道这三笔交易都属于**同一个订阅**。

### 场景 2: 处理 Apple Server Notifications

当用户的订阅状态发生变化时（续期、取消、退款等），Apple 会发送 webhook 通知：

```typescript
// Apple Webhook 通知
{
  notification_type: "DID_RENEW",
  latest_receipt_info: {
    transaction_id: "1000000222222222",          // 最新的交易 ID
    original_transaction_id: "1000000111111111"  // 原始交易 ID
  }
}
```

我们的代码使用 `originalTransactionId` 来查找用户：

```typescript:84:93:atc-server/src/controllers/appleWebhookController.ts
const payment = await prisma.payment.findFirst({
  where: { originalTransactionId: originalTransactionId },
  include: { membership: { include: { user: true } } },
});

if (!payment) {
  logger.warn(
    { originalTransactionId },
    '[AppleWebhook] No payment found for transaction'
  );
  return;
}
```

**为什么不用 transactionId？**
- 因为 webhook 中的 `transactionId` 是**最新的续期交易**
- 我们数据库中可能还存储的是**旧的交易 ID**
- 但 `originalTransactionId` 始终不变，可以准确找到用户

### 场景 3: 防止重复处理

```typescript
// 检查是否已经处理过这个订阅
const existingPayment = await prisma.payment.findFirst({
  where: {
    originalTransactionId: verifiedReceipt.originalTransactionId
  }
});

if (existingPayment) {
  // 这是同一个订阅的续期，不是新订阅
  // 更新现有记录，而不是创建新记录
}
```

### 场景 4: 订阅历史追踪

查询用户的完整订阅历史：

```typescript
// 获取某个订阅的所有交易记录
const subscriptionHistory = await prisma.payment.findMany({
  where: {
    originalTransactionId: "1000000111111111"
  },
  orderBy: {
    createdAt: 'asc'
  }
});

// 结果:
// [
//   { transactionId: "1000000111111111", purchaseDate: "2024-01-15" },
//   { transactionId: "1000000222222222", purchaseDate: "2025-01-15" },
//   { transactionId: "1000000333333333", purchaseDate: "2026-01-15" }
// ]
```

## 在我们代码中的使用

### 1. 存储 Payment 记录

```typescript:733:739:atc-server/src/services/membershipService.ts
await prisma.payment.create({
  data: {
    userId,
    membershipId: membership.id,
    transactionId,
    originalTransactionId,  // ← 存储原始交易 ID
    productId,
    tier,
    amount,
    currency,
    status,
    receiptData,
  },
});
```

### 2. 验证时的灵活匹配

在沙盒环境中，客户端可能传入的是 `originalTransactionId`：

```typescript:149:152:atc-server/src/controllers/membershipController.ts
// Check if either the transactionId or originalTransactionId matches
const transactionMatches = 
  verifiedReceipt.transactionId === transactionId ||
  verifiedReceipt.originalTransactionId === transactionId;
```

### 3. 数据库索引

为了快速查询，我们在 `originalTransactionId` 上建立了索引：

```prisma:308:329:atc-server/prisma/schema.prisma
model Payment {
  id                  String         @id @default(cuid())
  userId              String         @map("user_id")
  membershipId        String         @map("membership_id")
  transactionId      String         @unique @map("transaction_id")
  originalTransactionId String       @map("original_transaction_id")
  productId           String         @map("product_id")
  tier                MembershipTier
  amount              Float
  currency            String         @default("USD")
  status              String         // pending, completed, failed, refunded
  receiptData         String?        @map("receipt_data") @db.Text
  createdAt           DateTime       @default(now()) @map("created_at")
  updatedAt           DateTime       @updatedAt @map("updated_at")
  membership          Membership     @relation(fields: [membershipId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([transactionId])
  @@index([originalTransactionId])  // ← 索引
  @@index([membershipId])
  @@map("payments")
}
```

## 常见问题

### Q1: 为什么需要同时存储两个 ID？

**A**: 
- `transactionId`: 用于追踪**单次交易**，防止重复处理同一笔交易
- `originalTransactionId`: 用于追踪**订阅关系**，关联所有续期交易

### Q2: 如果用户取消订阅后重新订阅，originalTransactionId 会变吗？

**A**: **会变**！取消后重新订阅被视为**新的订阅**，会有新的 `originalTransactionId`。

```
订阅 A (2024-2025):
  originalTransactionId: "1000000111111111"

取消订阅 ❌

订阅 B (2026-2027):
  originalTransactionId: "1000000444444444"  ← 新的
```

### Q3: 在沙盒环境中，这两个 ID 的行为一样吗？

**A**: **一样**。沙盒环境模拟了生产环境的行为：
- 首次购买：两个 ID 相同
- 续期时：`transactionId` 变化，`originalTransactionId` 不变

### Q4: 如果我只存储 transactionId 会有什么问题？

**A**: 会导致以下问题：
1. ❌ 无法追踪订阅的完整历史
2. ❌ 无法正确处理 Apple webhook（因为 webhook 中的 ID 是最新的）
3. ❌ 无法识别续期和新订阅的区别
4. ❌ 无法实现订阅分析和报表

## 最佳实践

### ✅ 推荐做法

1. **始终存储两个 ID**
   ```typescript
   await prisma.payment.create({
     data: {
       transactionId: verifiedReceipt.transactionId,
       originalTransactionId: verifiedReceipt.originalTransactionId,
       // ...
     }
   });
   ```

2. **使用 originalTransactionId 查询订阅**
   ```typescript
   // 查找订阅（不管续期多少次）
   const subscription = await prisma.payment.findFirst({
     where: { originalTransactionId }
   });
   ```

3. **使用 transactionId 防止重复**
   ```typescript
   // 检查这笔交易是否已处理
   const existingTransaction = await prisma.payment.findUnique({
     where: { transactionId }
   });
   ```

4. **在数据库中建立索引**
   ```prisma
   @@index([transactionId])
   @@index([originalTransactionId])
   ```

### ❌ 避免的做法

1. ❌ 只存储 `transactionId`
2. ❌ 混淆两个 ID 的用途
3. ❌ 在 webhook 处理中使用 `transactionId` 查询
4. ❌ 忽略 `originalTransactionId` 的唯一性

## 总结

| 方面 | transactionId | originalTransactionId |
|------|---------------|----------------------|
| **定义** | 当前交易的唯一标识 | 首次购买的交易标识 |
| **变化** | 每次续期都变 | 整个订阅周期不变 |
| **用途** | 防止重复处理单次交易 | 追踪订阅关系 |
| **场景** | 收据验证、去重 | Webhook、订阅历史 |
| **数据库** | UNIQUE 约束 | INDEX 索引 |

**关键理解**: 
- `transactionId` = 这笔交易
- `originalTransactionId` = 这个订阅

在自动续期订阅系统中，`originalTransactionId` 是连接所有续期交易的**纽带**，是实现完整订阅管理的**基础**。

## 参考资料

- [Apple: In-App Purchase Receipt Validation](https://developer.apple.com/documentation/appstorereceipts/verifyreceipt)
- [Apple: original_transaction_id](https://developer.apple.com/documentation/appstorereceipts/original_transaction_id)
- [Apple: Server Notifications](https://developer.apple.com/documentation/appstoreservernotifications)

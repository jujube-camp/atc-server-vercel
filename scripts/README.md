# Database Export/Import Scripts

这些脚本用于导出和导入 Prisma 数据库数据。

## Export Data (导出数据)

### 使用方法

```bash
# 导出单个模型
tsx scripts/export_data.ts --model User --format json
tsx scripts/export_data.ts --model Airport --format csv --output airports.csv

# 导出所有数据
tsx scripts/export_data.ts --all --format json --output all_data.json
```

### 参数说明

- `--model <modelName>`: 指定要导出的模型名称
- `--format <json|csv>`: 导出格式（默认：json）
- `--output <path>`: 输出文件路径（可选，默认保存到 `scripts/exports/` 目录）
- `--all`: 导出所有数据

### 支持的模型

- user, users
- session, sessions
- transmissionevent, transmission_events
- phaseadvanceevent, phase_advance_events
- evaluation, evaluations
- airport, airports
- referralcode, referral_codes

## Import Data (导入数据)

### 使用方法

```bash
# 导入单个模型
tsx scripts/import_data.ts --model User --input users.json

# 导入所有数据
tsx scripts/import_data.ts --all --input all_data.json

# 跳过已存在的记录（仅创建新记录）
tsx scripts/import_data.ts --all --input all_data.json --skip-existing

# 预览导入（不实际执行）
tsx scripts/import_data.ts --all --input all_data.json --dry-run
```

### 参数说明

- `--model <modelName>`: 指定要导入的模型名称
- `--input <path>`: 输入文件路径（必需）
- `--all`: 导入所有数据
- `--skip-existing`: 跳过已存在的记录（仅创建新记录，不更新）
- `--dry-run`: 预览模式，不实际执行导入

### 支持的模型

所有 Prisma schema 中定义的模型都支持导入，包括：

- user, users
- session, sessions
- transmissionevent, transmission_events
- phaseadvanceevent, phase_advance_events
- evaluation, evaluations
- airport, airports
- referralcode, referral_codes
- locationevent, location_events
- favoritefeed, favorite_feeds
- feedback
- liveatcfeed, liveatc_feeds
- trainingmodeconfig, training_mode_configs
- aircrafttype, aircraft_types
- sessionstate, session_states
- recording, recordings
- membership, memberships
- membershipplan, membership_plans
- payment, payments
- usagerecord, usage_records
- authsession, auth_sessions
- tierlimitconfig, tier_limit_configs

## 工作流程示例

### 1. 备份数据库

```bash
# 导出所有数据到 JSON 文件
tsx scripts/export_data.ts --all --format json --output backup_$(date +%Y%m%d).json
```

### 2. 恢复数据库

```bash
# 从备份文件恢复所有数据
tsx scripts/import_data.ts --all --input backup_20231216.json
```

### 3. 迁移特定数据

```bash
# 导出机场数据
tsx scripts/export_data.ts --model Airport --format json --output airports.json

# 导入到另一个数据库
DATABASE_URL="postgresql://..." tsx scripts/import_data.ts --model Airport --input airports.json
```

### 4. 数据同步（仅新增）

```bash
# 导出源数据库的用户
tsx scripts/export_data.ts --model User --format json --output users.json

# 导入到目标数据库，跳过已存在的用户
DATABASE_URL="postgresql://target..." tsx scripts/import_data.ts --model User --input users.json --skip-existing
```

## 注意事项

1. **外键约束**: 导入所有数据时，脚本会按照正确的顺序导入，以满足外键约束：
   - 首先导入 Users（无依赖）
   - 然后导入 Sessions（依赖 Users）
   - 接着导入 Events（依赖 Sessions）
   - 最后导入其他表

2. **关联数据清理**: 导入脚本会自动清理导出时包含的关联数据（如 `user.sessions`），只保留必要的外键字段。

3. **Upsert 操作**: 默认情况下，导入使用 `upsert` 操作，会更新已存在的记录。使用 `--skip-existing` 可以跳过已存在的记录。

4. **数据验证**: 导入前请确保：
   - JSON 文件格式正确
   - 外键引用的记录存在
   - 唯一约束不会冲突

5. **大数据量**: 对于大量数据，建议：
   - 分批导入
   - 使用 `--dry-run` 先预览
   - 在非生产环境测试

## 错误处理

如果导入失败，脚本会：
- 显示失败的记录 ID 和错误信息
- 继续处理其他记录
- 在最后显示统计信息（成功/失败/跳过的数量）

## 环境变量

两个脚本都使用 `DATABASE_URL` 环境变量连接数据库：

```bash
# 使用不同的数据库
DATABASE_URL="postgresql://user:pass@host:5432/dbname" tsx scripts/export_data.ts --all
```

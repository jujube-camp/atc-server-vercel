#!/usr/bin/env tsx

/**
 * Debug script to check payment records in the database
 * 
 * Usage:
 *   npx tsx scripts/debug-payment.ts [userId]
 */

import { prisma } from '../src/utils/prisma.js';

async function main() {
  const userId = process.argv[2];

  if (!userId) {
    console.log('Usage: npx tsx scripts/debug-payment.ts [userId]');
    process.exit(1);
  }

  console.log(`\n🔍 Checking payment records for user: ${userId}\n`);

  // Check if user exists
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      displayName: true,
    },
  });

  if (!user) {
    console.log('❌ User not found');
    process.exit(1);
  }

  console.log('✅ User found:');
  console.log(`   Email: ${user.email}`);
  console.log(`   Display Name: ${user.displayName || 'N/A'}`);

  // Check membership
  const membership = await prisma.membership.findUnique({
    where: { userId },
  });

  console.log('\n📋 Membership:');
  if (membership) {
    console.log(`   Tier: ${membership.tier}`);
    console.log(`   Expires At: ${membership.expiresAt || 'N/A'}`);
    console.log(`   Created At: ${membership.createdAt}`);
    console.log(`   Updated At: ${membership.updatedAt}`);
  } else {
    console.log('   ❌ No membership found');
  }

  // Check payments
  const payments = await prisma.payment.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });

  console.log('\n💳 Payment Records:');
  if (payments.length === 0) {
    console.log('   ❌ No payment records found');
  } else {
    console.log(`   Found ${payments.length} payment(s):\n`);
    payments.forEach((payment, index) => {
      console.log(`   Payment #${index + 1}:`);
      console.log(`     ID: ${payment.id}`);
      console.log(`     Transaction ID: ${payment.transactionId}`);
      console.log(`     Original Transaction ID: ${payment.originalTransactionId}`);
      console.log(`     Product ID: ${payment.productId}`);
      console.log(`     Tier: ${payment.tier}`);
      console.log(`     Amount: ${payment.amount} ${payment.currency}`);
      console.log(`     Status: ${payment.status}`);
      console.log(`     Created At: ${payment.createdAt}`);
      console.log(`     Updated At: ${payment.updatedAt}`);
      console.log('');
    });
  }

  // Check usage records
  const usageRecords = await prisma.usageRecord.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });

  console.log('📊 Usage Records:');
  if (usageRecords.length === 0) {
    console.log('   No usage records found');
  } else {
    console.log(`   Found ${usageRecords.length} usage record(s):\n`);
    usageRecords.forEach((record, index) => {
      console.log(`   Record #${index + 1}:`);
      console.log(`     Type: ${record.usageType}`);
      console.log(`     Period: ${record.month}/${record.year}`);
      console.log(`     Count: ${record.count}`);
      console.log(`     Created At: ${record.createdAt}`);
      console.log('');
    });
  }

  console.log('✅ Debug complete\n');
}

main()
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

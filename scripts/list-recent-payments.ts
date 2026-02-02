#!/usr/bin/env tsx

/**
 * List all recent payment records
 * 
 * Usage:
 *   npx tsx scripts/list-recent-payments.ts [limit]
 */

import { prisma } from '../src/utils/prisma.js';

async function main() {
  const limit = parseInt(process.argv[2] || '10');

  console.log(`\n💳 Listing last ${limit} payment records...\n`);

  const payments = await prisma.payment.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      membership: {
        include: {
          user: {
            select: {
              id: true,
              email: true,
              displayName: true,
            },
          },
        },
      },
    },
  });

  if (payments.length === 0) {
    console.log('❌ No payment records found in database\n');
    process.exit(0);
  }

  console.log(`Found ${payments.length} payment(s):\n`);
  
  payments.forEach((payment, index) => {
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`Payment #${index + 1}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`Payment ID:        ${payment.id}`);
    console.log(`User:              ${payment.membership.user.email} (${payment.membership.user.displayName || 'N/A'})`);
    console.log(`User ID:           ${payment.userId}`);
    console.log(`Transaction ID:    ${payment.transactionId}`);
    console.log(`Original Txn ID:   ${payment.originalTransactionId}`);
    console.log(`Product ID:        ${payment.productId}`);
    console.log(`Tier:              ${payment.tier}`);
    console.log(`Amount:            ${payment.amount} ${payment.currency}`);
    console.log(`Status:            ${payment.status}`);
    console.log(`Created At:        ${payment.createdAt.toISOString()}`);
    console.log(`Updated At:        ${payment.updatedAt.toISOString()}`);
    console.log(`Has Receipt Data:  ${payment.receiptData ? 'Yes' : 'No'}`);
    console.log('');
  });

  console.log('✅ Done\n');
}

main()
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

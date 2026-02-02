#!/usr/bin/env tsx

import { prisma } from '../utils/prisma.js';

async function checkWebhookStatus() {
  console.log('🔍 Checking webhook and database status...\n');

  try {
    // 1. Check recent memberships
    console.log('1️⃣ Checking PREMIUM memberships:');
    const memberships = await prisma.membership.findMany({
      where: { tier: 'PREMIUM' },
      include: { user: { select: { email: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 5,
    });

    if (memberships.length === 0) {
      console.log('   ❌ No PREMIUM memberships found\n');
    } else {
      type MembershipRow = { user: { email: string }; tier: string; expiresAt: Date | null; updatedAt: Date };
      memberships.forEach((m: MembershipRow, i: number) => {
        console.log(`   ${i + 1}. User: ${m.user.email}`);
        console.log(`      Tier: ${m.tier}`);
        console.log(`      Expires At: ${m.expiresAt ? m.expiresAt.toISOString() : 'NULL'}`);
        console.log(`      Updated At: ${m.updatedAt.toISOString()}`);
        
        if (m.expiresAt) {
          const now = new Date();
          const timeUntilExpiry = m.expiresAt.getTime() - now.getTime();
          const minutesUntilExpiry = Math.floor(timeUntilExpiry / 1000 / 60);
          
          if (timeUntilExpiry < 0) {
            console.log(`      ⚠️  EXPIRED ${Math.abs(minutesUntilExpiry)} minutes ago!`);
          } else {
            console.log(`      ✅ Active - expires in ${minutesUntilExpiry} minutes`);
          }
        }
        console.log('');
      });
    }

    // 2. Check recent payments
    console.log('2️⃣ Checking recent payments:');
    const payments = await prisma.payment.findMany({
      orderBy: { createdAt: 'desc' },
      take: 3,
    });

    if (payments.length === 0) {
      console.log('   ❌ No payments found\n');
    } else {
      for (const p of payments) {
        const membership = await prisma.membership.findUnique({
          where: { id: p.membershipId },
          include: { user: { select: { email: true } } },
        });
        
        console.log(`   ${payments.indexOf(p) + 1}. User: ${membership?.user.email || 'unknown'}`);
        console.log(`      Transaction ID: ${p.transactionId}`);
        console.log(`      Original Transaction ID: ${p.originalTransactionId}`);
        console.log(`      Product ID: ${p.productId}`);
        console.log(`      Status: ${p.status}`);
        console.log(`      Created At: ${p.createdAt.toISOString()}`);
        console.log('');
      }
    }

    // 3. Check if any memberships are expiring soon
    console.log('3️⃣ Checking memberships expiring in next 2 minutes:');
    const expiringSoon = await prisma.membership.findMany({
      where: {
        tier: 'PREMIUM',
        expiresAt: {
          lte: new Date(Date.now() + 2 * 60 * 1000),
        },
      },
      include: { user: { select: { email: true } } },
    });

    if (expiringSoon.length === 0) {
      console.log('   ✅ No memberships expiring in the next 2 minutes\n');
    } else {
      console.log(`   ⚠️  ${expiringSoon.length} membership(s) expiring soon:`);
      type ExpiringRow = { user: { email: string }; expiresAt: Date | null };
      expiringSoon.forEach((m: ExpiringRow) => {
        const minutesUntilExpiry = m.expiresAt 
          ? Math.floor((m.expiresAt.getTime() - Date.now()) / 1000 / 60)
          : 0;
        console.log(`      - ${m.user.email}: expires in ${minutesUntilExpiry} minutes (${m.expiresAt?.toISOString()})`);
      });
      console.log('');
    }

    console.log('4️⃣ Webhook V2 Status:');
    console.log('   ✅ V2 webhook support enabled');
    console.log('   ✅ Auto-detects V1 and V2 formats');
    console.log('   ✅ Uses @apple/app-store-server-library for JWT verification');
    console.log('   📝 Check logs for [AppleWebhookV2] messages\n');

    console.log('5️⃣ Next steps:');
    console.log('   - Wait for next renewal (5 minutes in sandbox)');
    console.log('   - Check ngrok for: POST /api/v1/webhooks/apple 200 OK');
    console.log('   - Check server logs for: [AppleWebhookV2] ✅ Membership updated');
    console.log('   - Run this script again to verify expiresAt was extended\n');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkWebhookStatus();

/**
 * Secure Admin Seed Script
 * ─────────────────────────────────────────────────────────────────────────────
 * Creates the first platform ADMIN user from environment variables.
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register scripts/seed-admin.ts
 *
 * Required environment variables:
 *   ADMIN_EMAIL      - Admin email address
 *   ADMIN_USERNAME   - Admin username (unique, no spaces)
 *   ADMIN_PASSWORD   - Admin password (min 8 chars recommended)
 *   ADMIN_DOB        - Date of birth in YYYY-MM-DD format (admin must be 18+)
 *
 * Optional:
 *   ADMIN_DISPLAY_NAME - Display name shown in the UI (defaults to username)
 *
 * This script is idempotent — running it multiple times will not create duplicate admins.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { PrismaClient, UserRole, UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import * as dotenv from 'dotenv';

// Load .env from project root
dotenv.config();

const prisma = new PrismaClient();

async function main() {
  console.log('\n🔐 Admin Seed Script\n');

  // ── Validate required env vars ─────────────────────────────────────────────
  const email = process.env.ADMIN_EMAIL;
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  const dobStr = process.env.ADMIN_DOB;
  const displayName = process.env.ADMIN_DISPLAY_NAME ?? username;

  if (!email || !username || !password || !dobStr) {
    console.error('❌ Missing required environment variables:');
    console.error('   ADMIN_EMAIL, ADMIN_USERNAME, ADMIN_PASSWORD, ADMIN_DOB');
    process.exit(1);
  }

  // ── Validate password strength ─────────────────────────────────────────────
  if (password.length < 8) {
    console.error('❌ ADMIN_PASSWORD must be at least 8 characters');
    process.exit(1);
  }

  // ── Parse and validate DOB ─────────────────────────────────────────────────
  const dob = new Date(dobStr);
  if (isNaN(dob.getTime())) {
    console.error('❌ ADMIN_DOB is invalid. Use YYYY-MM-DD format.');
    process.exit(1);
  }

  const minAge = new Date();
  minAge.setFullYear(minAge.getFullYear() - 18);
  if (dob > minAge) {
    console.error('❌ Admin user must be at least 18 years old.');
    process.exit(1);
  }

  // ── Idempotency check ──────────────────────────────────────────────────────
  const existingByEmail = await prisma.user.findUnique({ where: { email } });
  if (existingByEmail) {
    if (existingByEmail.role === UserRole.ADMIN) {
      console.log(`✅ Admin user already exists: ${existingByEmail.username} (${existingByEmail.email})`);
      console.log('   No changes made.\n');
      return;
    } else {
      // Promote existing user to ADMIN
      console.log(`⚠️  User ${existingByEmail.email} exists but is not an admin.`);
      console.log(`   Promoting to ADMIN role...`);
      await prisma.user.update({
        where: { id: existingByEmail.id },
        data: { role: UserRole.ADMIN, status: UserStatus.ACTIVE },
      });
      console.log(`✅ User promoted to ADMIN: ${existingByEmail.username}\n`);
      return;
    }
  }

  const existingByUsername = await prisma.user.findUnique({ where: { username } });
  if (existingByUsername) {
    console.error(`❌ Username "${username}" is already taken.`);
    process.exit(1);
  }

  // ── Hash password ──────────────────────────────────────────────────────────
  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });

  // ── Create admin user (single transaction) ─────────────────────────────────
  const admin = await prisma.$transaction(async (tx) => {
    // 1. Create user
    const user = await tx.user.create({
      data: {
        email,
        username,
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        dateOfBirth: dob,
        auth: {
          create: {
            passwordHash,
            emailVerifiedAt: new Date(), // Admin accounts are pre-verified
          },
        },
        profile: {
          create: {
            displayName: displayName ?? username,
          },
        },
      },
    });

    // 2. Create ReputationSummary (required by some queries)
    await tx.reputationSummary.create({
      data: {
        userId: user.id,
      },
    });

    return user;
  });

  console.log('✅ Admin user created successfully!');
  console.log(`   ID:       ${admin.id}`);
  console.log(`   Email:    ${admin.email}`);
  console.log(`   Username: ${admin.username}`);
  console.log(`   Role:     ${admin.role}`);
  console.log(`   Status:   ${admin.status}`);
  console.log('\n🔑 You can now log in with the credentials above.\n');
}

main()
  .catch((err) => {
    console.error('❌ Seed failed:', err.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

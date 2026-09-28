import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  const hash = await argon2.hash('ChangeMe123!');
  const user = await prisma.user.findUnique({
    where: { email: 'admin@letsdotogether.com' },
    include: { auth: true },
  });
  
  if (user && user.auth) {
    await prisma.auth.update({
      where: { userId: user.id },
      data: {
        passwordHash: hash,
        failedLoginCount: 0,
        lockedUntil: null,
      },
    });
    console.log('✅ Admin credentials reset successfully!');
    console.log('Email:', user.email);
    console.log('Password: ChangeMe123!');
  } else {
    console.log('Admin user not found.');
  }
}

main().finally(() => prisma.$disconnect());


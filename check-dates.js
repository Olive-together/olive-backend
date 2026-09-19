const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const activities = await prisma.activity.findMany({
    where: { scheduledAt: null },
    select: { title: true, scheduledAt: true, endsAt: true, expiresAt: true, status: true, id: true }
  });
  console.log(activities);
}
main().finally(() => prisma.$disconnect());

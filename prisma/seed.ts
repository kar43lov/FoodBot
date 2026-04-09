import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  // Create test users
  const user1 = await prisma.user.upsert({
    where: { telegramUserId: BigInt(123456789) },
    update: {},
    create: {
      telegramUserId: BigInt(123456789),
      firstName: "Иван",
      username: "ivan_test",
    },
  });

  const user2 = await prisma.user.upsert({
    where: { telegramUserId: BigInt(987654321) },
    update: {},
    create: {
      telegramUserId: BigInt(987654321),
      firstName: "Мария",
      username: "maria_test",
    },
  });

  console.log(`✅ Created users: ${user1.firstName}, ${user2.firstName}`);

  // Create a group project
  const groupProject = await prisma.project.upsert({
    where: { telegramChatId: BigInt(-1001234567890) },
    update: {},
    create: {
      telegramChatId: BigInt(-1001234567890),
      title: "Семейный трекер калорий",
      type: "group",
    },
  });

  // Create a personal project for user1
  const personalProject = await prisma.project.upsert({
    where: { telegramChatId: BigInt(123456789) },
    update: {},
    create: {
      telegramChatId: BigInt(123456789),
      title: "Личный трекер Ивана",
      type: "personal",
    },
  });

  console.log(
    `✅ Created projects: ${groupProject.title}, ${personalProject.title}`
  );

  // Create memberships
  await prisma.membership.upsert({
    where: {
      projectId_userId: {
        projectId: groupProject.id,
        userId: user1.id,
      },
    },
    update: {},
    create: {
      projectId: groupProject.id,
      userId: user1.id,
      role: "admin",
    },
  });

  await prisma.membership.upsert({
    where: {
      projectId_userId: {
        projectId: groupProject.id,
        userId: user2.id,
      },
    },
    update: {},
    create: {
      projectId: groupProject.id,
      userId: user2.id,
      role: "member",
    },
  });

  await prisma.membership.upsert({
    where: {
      projectId_userId: {
        projectId: personalProject.id,
        userId: user1.id,
      },
    },
    update: {},
    create: {
      projectId: personalProject.id,
      userId: user1.id,
      role: "admin",
    },
  });

  console.log("✅ Created memberships");

  // Create sample meal entries
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const meals = [
    {
      projectId: groupProject.id,
      userId: user1.id,
      recordedAt: new Date(today.setHours(8, 30, 0, 0)),
      caloriesEstimated: 350,
      description: "Овсянка с бананом и мёдом",
      source: "photo",
      aiConfidence: 0.85,
      needsReview: false,
    },
    {
      projectId: groupProject.id,
      userId: user1.id,
      recordedAt: new Date(today.setHours(13, 0, 0, 0)),
      caloriesEstimated: 650,
      description: "Куриная грудка с рисом и овощами",
      source: "photo",
      aiConfidence: 0.92,
      needsReview: false,
    },
    {
      projectId: groupProject.id,
      userId: user2.id,
      recordedAt: new Date(today.setHours(12, 30, 0, 0)),
      caloriesEstimated: 480,
      description: "Салат Цезарь с креветками",
      source: "photo",
      aiConfidence: 0.78,
      needsReview: false,
    },
    {
      projectId: groupProject.id,
      userId: user1.id,
      recordedAt: new Date(yesterday.setHours(19, 0, 0, 0)),
      caloriesEstimated: 800,
      description: "Паста карбонара",
      source: "photo",
      aiConfidence: 0.88,
      needsReview: false,
    },
    {
      projectId: personalProject.id,
      userId: user1.id,
      recordedAt: new Date(today.setHours(16, 0, 0, 0)),
      caloriesEstimated: 150,
      description: "Яблоко и орехи",
      source: "manual",
      aiConfidence: null,
      needsReview: false,
    },
  ];

  for (const meal of meals) {
    await prisma.mealEntry.create({
      data: meal,
    });
  }

  console.log(`✅ Created ${meals.length} meal entries`);

  console.log("🎉 Seeding completed!");
}

main()
  .catch((e) => {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

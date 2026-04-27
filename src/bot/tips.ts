import { prisma } from '../db/index.js';

const DEFAULT_TIPS = [
  '✏️ Если что-то записано неточно — откройте бота, нажмите «Открыть» и отредактируйте запись.',
];

export async function getRandomTip(): Promise<string | null> {
  const tips = await prisma.tip.findMany({ where: { active: true } });
  if (tips.length === 0) {
    // Fallback to defaults if no tips in DB
    return DEFAULT_TIPS[Math.floor(Math.random() * DEFAULT_TIPS.length)] ?? null;
  }
  const tip = tips[Math.floor(Math.random() * tips.length)];
  return tip?.text ?? null;
}

export async function getAllTips(): Promise<Array<{ id: string; text: string; active: boolean }>> {
  return prisma.tip.findMany({ orderBy: { createdAt: 'asc' } });
}

export async function addTip(
  text: string,
  createdBy: bigint
): Promise<{ id: string; text: string }> {
  return prisma.tip.create({ data: { text, createdBy } });
}

export async function updateTip(id: string, text: string): Promise<{ id: string; text: string }> {
  return prisma.tip.update({ where: { id }, data: { text } });
}

export async function deleteTip(id: string): Promise<void> {
  await prisma.tip.delete({ where: { id } });
}

export async function toggleTip(id: string): Promise<{ id: string; active: boolean }> {
  const tip = await prisma.tip.findUnique({ where: { id } });
  if (!tip) throw new Error('Tip not found');
  return prisma.tip.update({ where: { id }, data: { active: !tip.active } });
}

export async function seedDefaultTips(createdBy: bigint): Promise<void> {
  const count = await prisma.tip.count();
  if (count === 0) {
    for (const text of DEFAULT_TIPS) {
      await prisma.tip.create({ data: { text, createdBy } });
    }
  }
}

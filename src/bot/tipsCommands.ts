import type { Context } from 'grammy';
import { InlineKeyboard } from 'grammy';
import { getAccessControl } from './accessControl.js';
import { getAllTips, addTip, updateTip, deleteTip, toggleTip, seedDefaultTips } from './tips.js';

// State for pending edits/adds per user
const pendingAction = new Map<number, { action: 'add' | 'edit'; tipId?: string }>();

function hasAdminAccess(ctx: Context): boolean {
  const userId = ctx.from?.id;
  if (!userId) return false;
  const ac = getAccessControl();
  return ac.isSuperAdmin(userId) || ac.isManager(BigInt(userId));
}

async function showTipsList(ctx: Context): Promise<void> {
  const tips = await getAllTips();

  if (tips.length === 0) {
    // Seed defaults on first use
    if (ctx.from?.id) {
      await seedDefaultTips(BigInt(ctx.from.id));
      return showTipsList(ctx);
    }
    await ctx.reply('Подсказок пока нет.');
    return;
  }

  let text = '📝 **Подсказки для отчётов:**\n\n';
  tips.forEach((tip, i) => {
    const status = tip.active ? '✅' : '❌';
    const preview = tip.text.length > 60 ? tip.text.slice(0, 57) + '...' : tip.text;
    text += `${i + 1}. ${status} ${preview}\n`;
  });

  const keyboard = new InlineKeyboard();

  tips.forEach((tip, i) => {
    keyboard
      .text(`${i + 1} ✏️`, `tip_edit:${tip.id}`)
      .text(tip.active ? `${i + 1} 🔇` : `${i + 1} 🔔`, `tip_toggle:${tip.id}`)
      .text(`${i + 1} 🗑`, `tip_delete:${tip.id}`)
      .row();
  });

  keyboard.text('➕ Добавить подсказку', 'tip_add').row();

  await ctx.reply(text, {
    parse_mode: 'Markdown',
    reply_markup: keyboard,
  });
}

export async function handleTipsCommand(ctx: Context): Promise<void> {
  if (!hasAdminAccess(ctx)) {
    await ctx.reply('❌ Только менеджер или суперадмин может управлять подсказками.');
    return;
  }
  await showTipsList(ctx);
}

export async function handleTipsCallback(ctx: Context): Promise<void> {
  if (!hasAdminAccess(ctx)) {
    await ctx.answerCallbackQuery({ text: '❌ Нет доступа' });
    return;
  }

  const data = ctx.callbackQuery?.data;
  if (!data) return;

  const userId = ctx.from?.id;
  if (!userId) return;

  if (data === 'tip_add') {
    pendingAction.set(userId, { action: 'add' });
    await ctx.answerCallbackQuery();
    await ctx.reply('✏️ Отправьте текст новой подсказки.\n\nДля отмены отправьте /tips');
    return;
  }

  if (data.startsWith('tip_edit:')) {
    const tipId = data.slice(9);
    const tips = await getAllTips();
    const tip = tips.find((t) => t.id === tipId);
    if (!tip) {
      await ctx.answerCallbackQuery({ text: 'Подсказка не найдена' });
      return;
    }
    pendingAction.set(userId, { action: 'edit', tipId });
    await ctx.answerCallbackQuery();
    await ctx.reply(
      `✏️ Текущий текст:\n\n\`${tip.text}\`\n\nОтправьте новый текст. Для отмены — /tips`,
      { parse_mode: 'Markdown' }
    );
    return;
  }

  if (data.startsWith('tip_toggle:')) {
    const tipId = data.slice(11);
    try {
      const result = await toggleTip(tipId);
      await ctx.answerCallbackQuery({
        text: result.active ? '✅ Подсказка включена' : '❌ Подсказка отключена',
      });
      // Refresh list
      if (ctx.callbackQuery?.message) {
        try {
          await ctx.deleteMessage();
        } catch {
          /* ignore */
        }
      }
      await showTipsList(ctx);
    } catch {
      await ctx.answerCallbackQuery({ text: 'Ошибка' });
    }
    return;
  }

  if (data.startsWith('tip_delete:')) {
    const tipId = data.slice(11);
    try {
      await deleteTip(tipId);
      await ctx.answerCallbackQuery({ text: '🗑 Подсказка удалена' });
      if (ctx.callbackQuery?.message) {
        try {
          await ctx.deleteMessage();
        } catch {
          /* ignore */
        }
      }
      await showTipsList(ctx);
    } catch {
      await ctx.answerCallbackQuery({ text: 'Ошибка' });
    }
    return;
  }

  if (data === 'tip_list') {
    await ctx.answerCallbackQuery();
    if (ctx.callbackQuery?.message) {
      try {
        await ctx.deleteMessage();
      } catch {
        /* ignore */
      }
    }
    await showTipsList(ctx);
    return;
  }
}

export async function handleTipsTextInput(ctx: Context): Promise<boolean> {
  const userId = ctx.from?.id;
  if (!userId) return false;

  const pending = pendingAction.get(userId);
  if (!pending) return false;

  const text = ctx.message && 'text' in ctx.message ? ctx.message.text : undefined;
  if (!text) return false;

  // If user sends a command, cancel pending action
  if (text.startsWith('/')) {
    pendingAction.delete(userId);
    return false;
  }

  if (pending.action === 'add') {
    await addTip(text, BigInt(userId));
    pendingAction.delete(userId);
    await ctx.reply('✅ Подсказка добавлена!');
    await showTipsList(ctx);
    return true;
  }

  if (pending.action === 'edit' && pending.tipId) {
    await updateTip(pending.tipId, text);
    pendingAction.delete(userId);
    await ctx.reply('✅ Подсказка обновлена!');
    await showTipsList(ctx);
    return true;
  }

  return false;
}

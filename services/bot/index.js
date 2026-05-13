require("dotenv").config();
const { Telegraf } = require("telegraf");
const { buildContext, formatContextBlock } = require("./context");

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
if (!TELEGRAM_TOKEN) {
  console.error("TELEGRAM_TOKEN environment variable is required");
  process.exit(1);
}

// Comma-separated list of allowed Telegram user IDs, e.g. "123456,789012".
// Leave TELEGRAM_WHITELIST_IDS unset to allow any user (dev only).
const WHITELIST = process.env.TELEGRAM_WHITELIST_IDS
  ? new Set(process.env.TELEGRAM_WHITELIST_IDS.split(",").map((id) => Number(id.trim())))
  : null;

const bot = new Telegraf(TELEGRAM_TOKEN);

// Auth guard
bot.use((ctx, next) => {
  if (WHITELIST && !WHITELIST.has(ctx.from?.id)) {
    return ctx.reply("Unauthorized.");
  }
  return next();
});

bot.command("start", (ctx) =>
  ctx.reply(
    "Personal assistant ready.\n\nCommands:\n/dump — brain dump\n/plan — clarify & prioritise\n/add — add a task mid-day\n/recap — end of day review\n/goals — view & update goals\n/overview — 2-week big picture"
  )
);

// Phase 1 stubs — LLM integration wired in Phase 2
bot.command("dump", async (ctx) => {
  await ctx.reply("(Phase 2) What's on your mind? Tell me everything.");
});

bot.command("plan", async (ctx) => {
  await ctx.reply("(Phase 2) Let's plan your day.");
});

bot.command("add", async (ctx) => {
  await ctx.reply("(Phase 2) What's the task?");
});

bot.command("recap", async (ctx) => {
  await ctx.reply("(Phase 2) End of day — what got done? What's blocked?");
});

bot.command("goals", async (ctx) => {
  await ctx.reply("(Phase 2) Fetching your active goals...");
});

bot.command("overview", async (ctx) => {
  await ctx.reply("(Phase 2) Loading 2-week view...");
});

// Verifies PocketBase connection and date injection — use /ping to confirm Phase 1 works
bot.command("ping", async (ctx) => {
  try {
    const context = await buildContext();
    const block = formatContextBlock(context);
    await ctx.reply(`PocketBase connected.\n\n${block}`);
  } catch (err) {
    await ctx.reply(`PocketBase error: ${err.message}`);
  }
});

bot.on("text", (ctx) =>
  ctx.reply("Use a command to get started: /dump, /plan, /add, /recap, /goals, /overview")
);

bot.launch({ dropPendingUpdates: true });
console.log("Telegram bot started (long polling)");

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));

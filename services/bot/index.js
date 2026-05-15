require("dotenv").config();
const { Telegraf } = require("telegraf");
const { buildContext, formatContextBlock } = require("./context");
const { chat, clearSession } = require("./llm");

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
if (!TELEGRAM_TOKEN) {
  console.error("TELEGRAM_TOKEN environment variable is required");
  process.exit(1);
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY environment variable is required");
  process.exit(1);
}

const WHITELIST = process.env.TELEGRAM_WHITELIST_IDS
  ? new Set(process.env.TELEGRAM_WHITELIST_IDS.split(",").map((id) => Number(id.trim())))
  : null;

const bot = new Telegraf(TELEGRAM_TOKEN);

bot.use((ctx, next) => {
  if (WHITELIST && !WHITELIST.has(ctx.from?.id)) {
    return ctx.reply("Unauthorized.");
  }
  return next();
});

function friendlyError(err) {
  if (err.name === "AbortError" || err.message?.includes("abort")) {
    return "The assistant took too long to respond. Please try again.";
  }
  if (err.message?.includes("PocketBase") || err.message?.includes("fetch")) {
    return "Couldn't reach the database. Make sure PocketBase is running, then try again.";
  }
  if (err.status === 529 || err.message?.includes("overloaded")) {
    return "The AI is overloaded right now. Try again in a moment.";
  }
  return "Something went wrong. Try again.";
}

async function handleCommand(ctx, command) {
  await ctx.sendChatAction("typing");
  const chatId = ctx.chat.id;
  try {
    const context = await buildContext();
    const contextBlock = formatContextBlock(context);
    const userText = ctx.message.text.replace(/^\/\w+\s*/, "").trim();
    const result = await chat(command, userText, contextBlock, chatId);
    await ctx.reply(result.reply, { parse_mode: "Markdown" });
  } catch (err) {
    console.error(`Error handling ${command}:`, err.message);
    await ctx.reply(friendlyError(err));
  }
}

bot.command("start", (ctx) =>
  ctx.reply(
    "Personal assistant ready.\n\nCommands:\n/dump — brain dump\n/plan — clarify & prioritise\n/add — add a task mid-day\n/recap — end of day review\n/goals — view & update goals\n/overview — 2-week big picture\n/teach — add a custom skill"
  )
);

bot.command("dump", (ctx) => handleCommand(ctx, "/dump"));
bot.command("plan", (ctx) => handleCommand(ctx, "/plan"));
bot.command("add", (ctx) => handleCommand(ctx, "/add"));
bot.command("recap", (ctx) => handleCommand(ctx, "/recap"));
bot.command("goals", (ctx) => handleCommand(ctx, "/goals"));
bot.command("overview", (ctx) => handleCommand(ctx, "/overview"));
bot.command("teach", (ctx) => handleCommand(ctx, "/teach"));

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
  ctx.reply("Use a command to get started: /dump, /plan, /add, /recap, /goals, /overview, /teach")
);

bot.launch({ dropPendingUpdates: true });
console.log("Telegram bot started (long polling)");

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));

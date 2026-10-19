import "dotenv/config";
import express from "express";
import {
  Client,
  GatewayIntentBits,
  Partials,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} from "discord.js";

import {
  openDb,
  saveGuildPersona,
  getGuildPersonas,
  setUserPersona,
  getUserPersona,
  saveMemory,
  getRecentMemory,
  upsertUserProfile,
  getKnownUsers
} from "./db.js";

import { makeGrokCall } from "./grok.js";

const app = express();
const db = openDb();
const port = Number(process.env.PORT || 3000);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel]
});

const snakeGames = new Map();

function buildSystemMessage({ guildId, channelId, userId, memberName }) {
  const guildPersonas = getGuildPersonas(db, guildId);
  const userPersona = getUserPersona(db, guildId, userId);

  const personaBits = [];

  for (const p of guildPersonas) {
    personaBits.push(`Server personality "${p.name}": ${p.instructions}`);
  }

  if (userPersona) {
    personaBits.push(`User personal profile: ${userPersona}`);
  }

  const memory = getRecentMemory(db, guildId, channelId, 8);
  const memoryText = memory.length
    ? memory
        .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
        .join("\n")
    : "No recent memory.";

  const base = [
    "You are a helpful, playful Discord AI assistant.",
    "The user may ask for help, coding tips, conversation, or roleplay.",
    "Keep replies concise but fun and engaging.",
    "If a guild personality exists, use it.",
    "If a user persona exists, use it too.",
    "If someone directly mentions the bot, greet them warmly.",
    memberName ? `The current author name is ${memberName}.` : "",
    personaBits.length ? personaBits.join("\n") : "No special personality set.",
    `Recent memory:\n${memoryText}`
  ].filter(Boolean).join("\n");

  return base;
}

async function respondWithGrok({ guildId, channelId, userId, memberName, prompt, rawMessage }) {
  const system = buildSystemMessage({ guildId, channelId, userId, memberName });
  const reply = await makeGrokCall(prompt, {
    maxTokens: 800,
    temperature: 0.85,
    system
  });

  saveMemory(db, guildId, channelId, userId, "user", rawMessage);
  saveMemory(db, guildId, channelId, userId, "assistant", reply);

  return reply;
}

async function registerSlashCommands() {
  const commands = [
    {
      name: "ask",
      description: "Ask the AI a question",
      options: [
        {
          name: "prompt",
          description: "Your question",
          type: 3,
          required: true
        }
      ]
    },
    {
      name: "pers",
      description: "Create or update a guild personality",
      options: [
        {
          name: "name",
          description: "Personality name",
          type: 3,
          required: true
        },
        {
          name: "instructions",
          description: "How the bot should act",
          type: 3,
          required: true
        }
      ]
    },
    {
      name: "mypers",
      description: "Set your own personal chatbot persona",
      options: [
        {
          name: "persona",
          description: "Tell the bot about you",
          type: 3,
          required: true
        }
      ]
    },
    {
      name: "helpbot",
      description: "Show all available commands"
    },
    {
      name: "snake",
      description: "Start a tiny snake game"
    }
  ];

  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.CLIENT_ID;

  if (!token || !clientId) {
    console.warn("DISCORD_TOKEN / CLIENT_ID are not set yet. Slash commands won't register.");
    return;
  }

  const { REST } = await import("@discordjs/rest");
  const { Routes } = await import("discord-api-types/v10");

  const rest = new REST({ version: "10" }).setToken(token);

  try {
    await rest.put(Routes.applicationCommands(clientId), { body: commands });
    console.log("Slash commands registered");
  } catch (err) {
    console.error("Failed to register commands", err);
  }
}

function makeSnakeBoard(game) {
  const board = Array.from({ length: game.height }, () => Array(game.width).fill("⬛"));

  for (const segment of game.snake) {
    board[segment.y][segment.x] = "🟩";
  }

  board[game.food.y][game.food.x] = "🍎";
  board[game.snake[0].y][game.snake[0].x] = "🟢";

  return board.map((row) => row.join("")).join("\n");
}

function createDefaultSnakeGame() {
  return {
    width: 9,
    height: 9,
    snake: [
      { x: 4, y: 4 },
      { x: 3, y: 4 },
      { x: 2, y: 4 }
    ],
    direction: { x: 1, y: 0 },
    food: { x: 6, y: 4 },
    score: 0
  };
}

function stepSnakeGame(game) {
  const head = {
    x: game.snake[0].x + game.direction.x,
    y: game.snake[0].y + game.direction.y
  };

  if (
    head.x < 0 ||
    head.x >= game.width ||
    head.y < 0 ||
    head.y >= game.height
  ) {
    return { over: true, score: game.score };
  }

  if (game.snake.some((segment) => segment.x === head.x && segment.y === head.y)) {
    return { over: true, score: game.score };
  }

  game.snake.unshift(head);

  if (head.x === game.food.x && head.y === game.food.y) {
    game.score += 1;

    do {
      game.food = {
        x: Math.floor(Math.random() * game.width),
        y: Math.floor(Math.random() * game.height)
      };
    } while (game.snake.some((segment) => segment.x === game.food.x && segment.y === game.food.y));
  } else {
    game.snake.pop();
  }

  return { over: false, score: game.score };
}

client.on("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);
  await registerSlashCommands();
});

client.on("interactionCreate", async (interaction) => {
  if (interaction.isChatInputCommand()) {
    const { commandName, options, guildId, channelId, user } = interaction;

    if (commandName === "helpbot") {
      const embed = new EmbedBuilder()
        .setTitle("Bot Commands")
        .setDescription("Commands available in this bot")
        .addFields(
          { name: "/ask", value: "Ask the AI a question" },
          { name: "/pers", value: "Create a custom guild personality" },
          { name: "/mypers", value: "Set your own personal persona" },
          { name: "/snake", value: "Play a mini snake game" },
          { name: "Reply to the bot", value: "Mention or reply to trigger responses" }
        );

      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (commandName === "pers") {
      const name = options.getString("name", true);
      const instructions = options.getString("instructions", true);
      saveGuildPersona(db, guildId, name, instructions);
      await interaction.reply({ content: `Saved guild personality: **${name}**` });
      return;
    }

    if (commandName === "mypers") {
      const persona = options.getString("persona", true);
      setUserPersona(db, guildId, user.id, persona);
      await interaction.reply({
        content: "Your personal persona has been saved. The bot will remember it during future interactions."
      });
      return;
    }

    if (commandName === "ask") {
      const prompt = options.getString("prompt", true);
      await interaction.deferReply();

      const answer = await respondWithGrok({
        guildId,
        channelId,
        userId: user.id,
        memberName: user.username,
        prompt,
        rawMessage: prompt
      });

      await interaction.editReply(answer.slice(0, 2000));
      return;
    }

    if (commandName === "snake") {
      const game = createDefaultSnakeGame();
      snakeGames.set(user.id, game);

      const boardText = makeSnakeBoard(game);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("snake-up").setLabel("⬆️").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("snake-down").setLabel("⬇️").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("snake-left").setLabel("⬅️").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("snake-right").setLabel("➡️").setStyle(ButtonStyle.Primary)
      );

      await interaction.reply({
        content: `**Snake**\n\`\`\`\n${boardText}\n\`\`\`\nScore: ${game.score}`,
        components: [row]
      });
      return;
    }
  }

  if (interaction.isButton()) {
    if (!interaction.customId.startsWith("snake-")) return;

    const userId = interaction.user.id;
    const game = snakeGames.get(userId);

    if (!game) {
      await interaction.reply({ content: "No active snake game found for you.", ephemeral: true });
      return;
    }

    const directionMap = {
      "snake-up": { x: 0, y: -1 },
      "snake-down": { x: 0, y: 1 },
      "snake-left": { x: -1, y: 0 },
      "snake-right": { x: 1, y: 0 }
    };

    const direction = directionMap[interaction.customId];
    if (direction) {
      game.direction = direction;
      const result = stepSnakeGame(game);
      const boardText = makeSnakeBoard(game);

      if (result.over) {
        snakeGames.delete(userId);
        await interaction.update({
          content: `**Snake game over!**\n\`\`\`\n${boardText}\n\`\`\`\nFinal score: ${result.score}`,
          components: []
        });
        return;
      }

      await interaction.update({
        content: `**Snake**\n\`\`\`\n${boardText}\n\`\`\`\nScore: ${game.score}`,
        components: interaction.message.components
      });
    }
  }
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const guildId = message.guildId || "dm";
  const channelId = message.channelId;
  const userId = message.author.id;
  const authorName = message.author.username;

  upsertUserProfile(db, guildId, userId, authorName);

  const mentionBot = message.mentions.has(client.user);
  const isReplyToBot = Boolean(message.reference && message.reference.messageId);

  if (!(mentionBot || isReplyToBot)) return;

  try {
    const intent = mentionBot
      ? `${authorName} mentioned the bot and is starting a new interaction.`
      : `${authorName} replied to the bot.`;

    const answer = await respondWithGrok({
      guildId,
      channelId,
      userId,
      memberName: authorName,
      prompt: `${intent}\nUser message: ${message.content}`,
      rawMessage: message.content
    });

    const knownUsers = getKnownUsers(db, guildId);
    const knownNames = knownUsers.map((u) => u.display_name).filter(Boolean);

    let finalMessage = answer;
    if (mentionBot && knownNames.includes(authorName)) {
      finalMessage = `Hi ${authorName}! ${answer}`;
    }

    await message.reply(finalMessage.slice(0, 2000));
  } catch (err) {
    console.error("Failed to respond to message:", err);
    await message.reply("I hit an error while talking to Grok. Check the bot logs.");
  }
});

app.use(express.json());

app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true, status: "running" });
});

app.post("/webhook", async (req, res) => {
  const { secret, guildId, channelId, content, username, avatarUrl } = req.body || {};

  if (!secret || secret !== process.env.EXTERNAL_WEBHOOK_SECRET) {
    return res.status(401).json({ ok: false, error: "Invalid secret" });
  }

  if (!guildId || !channelId || !content) {
    return res.status(400).json({ ok: false, error: "guildId, channelId and content are required" });
  }

  try {
    const guild = client.guilds.cache.get(guildId) || null;

    if (!guild) {
      return res.status(404).json({ ok: false, error: "Guild not found" });
    }

    const targetChannel =
      guild.channels.cache.get(channelId) ||
      (await guild.channels.fetch(channelId).catch(() => null));

    if (!targetChannel || !targetChannel.isTextBased()) {
      return res.status(404).json({ ok: false, error: "Channel not found or not text-based" });
    }

    await targetChannel.send({
      content,
      username,
      avatarURL: avatarUrl
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Webhook send failed", err);
    return res.status(500).json({ ok: false, error: "Failed to send message" });
  }
});

app.listen(port, () => {
  console.log(`Webhook server listening on port ${port}`);
});

client.login(process.env.DISCORD_TOKEN).catch((err) => {
  console.error("Discord login failed:", err);
  process.exit(1);
});

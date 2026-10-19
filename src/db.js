import Database from "better-sqlite3";
import fs from "fs";

export function openDb(path = process.env.DATABASE_PATH || "./data/bot.db") {
  const dir = path.includes("/") ? path.substring(0, path.lastIndexOf("/")) : ".";

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new Database(path);
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS guild_personas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      name TEXT NOT NULL,
      instructions TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(guild_id, name)
    );

    CREATE TABLE IF NOT EXISTS user_personas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      persona TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(guild_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS memory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      display_name TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(guild_id, user_id)
    );
  `);

  return db;
}

export function saveGuildPersona(db, guildId, name, instructions) {
  const existing = db
    .prepare(`SELECT id FROM guild_personas WHERE guild_id = ? AND name = ?`)
    .get(guildId, name);

  if (existing) {
    db.prepare(`UPDATE guild_personas SET instructions = ? WHERE id = ?`)
      .run(instructions, existing.id);
    return existing.id;
  }

  return db
    .prepare(`
      INSERT INTO guild_personas (guild_id, name, instructions)
      VALUES (?, ?, ?)
    `)
    .run(guildId, name, instructions).lastInsertRowid;
}

export function getGuildPersonas(db, guildId) {
  return db
    .prepare(`
      SELECT name, instructions
      FROM guild_personas
      WHERE guild_id = ?
      ORDER BY created_at DESC
    `)
    .all(guildId);
}

export function setUserPersona(db, guildId, userId, persona) {
  const existing = db
    .prepare(`SELECT id FROM user_personas WHERE guild_id = ? AND user_id = ?`)
    .get(guildId, userId);

  if (existing) {
    db.prepare(`UPDATE user_personas SET persona = ? WHERE id = ?`)
      .run(persona, existing.id);
    return existing.id;
  }

  return db
    .prepare(`
      INSERT INTO user_personas (guild_id, user_id, persona)
      VALUES (?, ?, ?)
    `)
    .run(guildId, userId, persona).lastInsertRowid;
}

export function getUserPersona(db, guildId, userId) {
  return db
    .prepare(`
      SELECT persona FROM user_personas
      WHERE guild_id = ? AND user_id = ?
    `)
    .get(guildId, userId)?.persona || null;
}

export function saveMemory(db, guildId, channelId, userId, role, content) {
  db.prepare(`
    INSERT INTO memory (guild_id, channel_id, user_id, role, content)
    VALUES (?, ?, ?, ?, ?)
  `).run(guildId, channelId, userId, role, content);
}

export function getRecentMemory(db, guildId, channelId, limit = 8) {
  return db
    .prepare(`
      SELECT user_id, role, content
      FROM memory
      WHERE guild_id = ? AND channel_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `)
    .all(guildId, channelId, limit)
    .reverse();
}

export function upsertUserProfile(db, guildId, userId, displayName) {
  if (!displayName) return;

  const existing = db
    .prepare(`SELECT id FROM user_profiles WHERE guild_id = ? AND user_id = ?`)
    .get(guildId, userId);

  if (existing) {
    db.prepare(`UPDATE user_profiles SET display_name = ? WHERE id = ?`)
      .run(displayName, existing.id);
    return;
  }

  db.prepare(`
    INSERT INTO user_profiles (guild_id, user_id, display_name)
    VALUES (?, ?, ?)
  `).run(guildId, userId, displayName);
}

export function getKnownUsers(db, guildId) {
  return db
    .prepare(`
      SELECT user_id, display_name
      FROM user_profiles
      WHERE guild_id = ?
      ORDER BY created_at DESC
    `)
    .all(guildId);
}

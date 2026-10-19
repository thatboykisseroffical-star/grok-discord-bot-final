# Grok Discord Bot

A Discord AI bot with:
- /ask to ask the AI
- /pers to define a server personality like "pirate"
- /mypers to define your personal persona
- mention and reply detection
- persistent memory via SQLite
- a simple Snake game
- external webhook support

## Install

```bash
npm install
```

## Setup

Copy `.env.example` to `.env` and fill in real values:

```bash
cp .env.example .env
```

Then edit `.env` with your real Discord token, client ID, Grok key, and webhook secret.

## Run

```bash
npm start
```

## Commands

### /ask
Ask the AI a question.

Example:
`/ask prompt:How do I deploy a Discord bot on Railway?`

### /pers
Create a server personality.

Example:
`/pers name:pirate instructions:Talk like a pirate and use pirate slang.`

### /mypers
Set your own personal persona.

Example:
`/mypers persona:I am a chill dev who likes coding, debugging, and making tools.`

### /snake
Start a quick Snake mini-game.

### Reply / mention behavior
The bot responds when:
- someone mentions it
- someone replies to it
- the content clearly asks it something

## Memory

The bot stores recent chat context in SQLite for each channel/server.

## Webhook

The app exposes:
`POST /webhook`

Example JSON body:

```json
{
  "secret": "change-this-secret",
  "guildId": "123456789",
  "channelId": "987654321",
  "content": "Hello from an external app"
}
```

## Railway

For Railway:
- import this repo
- set the env vars from `.env`
- use the start command:
  `npm start`

## Grok API

This project expects a Grok-compatible API. If your provider uses a different payload schema, update `src/grok.js`.

## License

MIT

<div align="center">

# Ghost Nexora Bot
### Self-hosted WhatsApp automation

**Community tools · Moderation · Games · Economy · Multimedia · Optional dashboard · Optional AI**

[![CI](https://github.com/Gh0stDeveloper/GhostNexoraBot/actions/workflows/ci.yml/badge.svg)](https://github.com/Gh0stDeveloper/GhostNexoraBot/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/License-MIT-22C55E)](LICENSE)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)

</div>

## Overview

I built Ghost Nexora Bot as a configurable, self-hosted WhatsApp automation platform. It combines community administration, entertainment commands, and optional integrations in one project.

**Hosting status:** I am **not currently running a public bot instance on an active server**. The source code and deployment tooling are available for users who want to operate their own instance. The project is designed for production deployment when its dependencies, credentials, and runtime environment are properly configured and validated.

## Main features

- Multi-device WhatsApp integration using Baileys.
- Group management, moderation, and configurable commands.
- Games, RPG, and economy features.
- Multimedia and download integrations.
- Optional Next.js management dashboard.
- Optional AI integrations, including local Ollama-based workflows.
- Self-hosted installation and update management.

## Deployment options

| Setup | Description |
| --- | --- |
| Bot only | Core WhatsApp automation |
| Bot + web | Adds the optional dashboard |
| Bot + AI | Adds supported AI integrations |
| Full stack | Runs all selected optional components |

The bot can be self-hosted on a compatible Linux VPS, Windows, or a supported Termux environment. Server availability, WhatsApp pairing, third-party APIs, and optional model services must be configured by the operator.

## Technology

Node.js · TypeScript · Baileys · Next.js · Linux · GitHub Actions · Optional Ollama

## Installation

- [Linux VPS setup](docs/)
- [Windows installation](docs/WINDOWS_INSTALL.md)
- [Repository source and workflows](https://github.com/Gh0stDeveloper/GhostNexoraBot)

For the exact setup, configuration variables, and available commands, consult the documentation in this repository before deploying.

## Independence and responsibility

Ghost Nexora Bot is an independent, unofficial project. It is not affiliated with WhatsApp, Meta, or third-party services used by optional modules. Self-hosting does not imply that an official public instance is online.

---

**Ghost Nexora Bot — configurable automation you can deploy and manage yourself.**

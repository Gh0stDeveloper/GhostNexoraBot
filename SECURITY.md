# Ghost Nexora Bot — Security Policy

Ghost Nexora Bot is an open-source, multi-component automation platform. Security reports are handled through coordinated disclosure so maintainers have a reasonable opportunity to investigate and remediate issues before technical details are published.

## Supported code

Security fixes are prioritized for the current `main` branch and the most recent production release. Older deployments should update before requesting support unless the report demonstrates that the issue also affects the current codebase.

## Report a vulnerability privately

Do **not** publish active credentials, WhatsApp sessions, portal tokens, cookies, API keys, private JIDs, personal information, exploit payloads against a live instance, or other sensitive evidence in a public issue.

Send security reports to:

- Email: `ghostnexora@gmail.com`
- Telegram: `@Gh0stDeveloper` / <https://t.me/Gh0stDeveloper>

Include only what is needed to reproduce the issue:

1. Affected component and version/commit.
2. Preconditions and deployment configuration relevant to the bug.
3. Reproduction steps or a minimal proof of concept.
4. Security impact and what an attacker would need to exploit it.
5. Suggested mitigation, if known.
6. Whether the issue is already public or has been disclosed elsewhere.

## In scope

Examples include vulnerabilities affecting:

- Administrative or subbot authentication and authorization.
- Session signing, portal tokens, cookies or privilege boundaries.
- Main-bot/subbot isolation.
- Group-control authorization.
- Secret or credential exposure.
- Command execution or injection.
- Server-side request handling and proxy restrictions.
- File upload/download handling, path traversal or unsafe archive processing.
- SQL injection or unsafe persistence behavior.
- Cross-site scripting, CSRF or other web security boundaries.
- Update, installer or artifact-integrity mechanisms.
- Backup/restore access controls.
- Remote code execution or privilege escalation caused by project code.

## Usually out of scope

The following normally require additional evidence of a project-level vulnerability:

- Availability or policy changes imposed solely by WhatsApp, Meta, Telegram, Discord, GitHub, an API provider or another third party.
- Vulnerabilities introduced only by unsupported third-party modifications.
- A VPS that was intentionally exposed with insecure firewall, SSH, filesystem or operating-system settings unrelated to Ghost Nexora Bot.
- Social engineering without a technical vulnerability in the project.
- Denial-of-service reports that rely only on overwhelming a service with traffic and do not demonstrate a specific implementation flaw.

## Self-hosted deployments

Each self-hosted operator controls their own VPS, reverse proxy, TLS, secrets, databases, backups, WhatsApp authentication state, external APIs and access policy. If an incident affects a third-party deployment, contact that operator as well because the project maintainers may not have access to that server or its data.

## Disclosure process

The maintainers may request clarification or a reduced proof of concept. Valid issues may be fixed privately before public disclosure. Reporters are asked to avoid accessing data that is not their own, disrupting production services, maintaining persistence, or expanding testing beyond what is necessary to establish impact.

A public advisory, release note or acknowledgement may be issued after a fix when appropriate. No bounty or payment is promised unless a separate written program explicitly states otherwise.

## Security is a shared responsibility

Keep Ghost Nexora Bot and its dependencies updated, use HTTPS for public web access, restrict network ports, run services with least privilege, protect persistent data and session files, rotate exposed credentials, and review logs after suspicious activity.

Last updated: 2026-09-16.

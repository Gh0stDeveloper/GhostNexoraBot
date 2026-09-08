#!/usr/bin/env node
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const root = process.cwd()
const temp = mkdtempSync(path.join(os.tmpdir(), 'ghostnexora-bank-v10-'))
const dataDir = path.join(temp, 'data')
const walletDb = path.join(dataDir, 'nexora-economy.sqlite')

const source = `
  const { economy } = await import('./apps/bot/dist/services/economy.js');
  const { bankingV10 } = await import('./apps/bot/dist/services/banking-v10.js');
  const { registerIdentity, repairNegativeEconomyBalances } = await import('./apps/bot/dist/services/identity.js');
  const { commands } = await import('./apps/bot/dist/commands/index.js');
  const user = '5215551112222@s.whatsapp.net';

  economy.balance(user);
  economy.walletDb.prepare('UPDATE global_economy_users SET wallet = 20000, bank = 5000 WHERE user_jid = ?').run(user);
  const canonical = '5215553334444@s.whatsapp.net';
  const alias = '123456789012345@lid';
  economy.balance(canonical);
  economy.balance(alias);
  economy.walletDb.prepare('UPDATE global_economy_users SET wallet = 0, bank = 1000 WHERE user_jid = ?').run(canonical);
  economy.walletDb.prepare('UPDATE global_economy_users SET wallet = 0, bank = 0 WHERE user_jid = ?').run(alias);
  registerIdentity(undefined, [alias, canonical], canonical);
  const merged = economy.balance(canonical);
  if (merged.wallet !== 0 || merged.bank !== 750 || merged.total !== 750) throw new Error('identity merge created invalid balance');

  economy.walletDb.prepare('UPDATE global_economy_users SET wallet = -240, bank = 735890 WHERE user_jid = ?').run(canonical);
  const repairedCount = repairNegativeEconomyBalances();
  const repaired = economy.balance(canonical);
  if (repairedCount < 1 || repaired.wallet !== 0 || repaired.bank !== 735650 || repaired.total !== 735650) throw new Error('negative balance repair mismatch');

  const afterWithdraw = bankingV10.withdraw(canonical, 10);
  if (afterWithdraw.wallet !== 10 || afterWithdraw.bank !== 735640 || afterWithdraw.total !== 735650) throw new Error('withdraw mismatch');

  const firstEligibility = bankingV10.eligibility(user);
  if (firstEligibility.profile.creditScore !== 650) throw new Error('default score mismatch');
  if (firstEligibility.tier.label !== 'Estándar') throw new Error('default tier mismatch');
  const quote = bankingV10.quote(user, 5000);
  if (quote.totalDue !== 5500 || quote.interestPercent !== 10) throw new Error('quote mismatch');
  const opened = bankingV10.requestLoan(user, 5000);
  if (opened.amount !== 5000 || opened.totalDue !== 5500) throw new Error('loan open mismatch');
  let blocked = false;
  try { bankingV10.requestLoan(user, 500); } catch { blocked = true; }
  if (!blocked) throw new Error('second active loan should be blocked');
  const paid = bankingV10.pay(user);
  if (paid.remaining !== 0 || paid.profile.creditScore <= 650) throw new Error('early payment score mismatch');

  const second = bankingV10.requestLoan(user, 1000);
  economy.walletDb.prepare('UPDATE bank_loans_v10 SET due_at = ?, updated_at = ? WHERE id = ?').run(Date.now() - 2 * 86400000, Date.now(), second.loanId);
  const delinquent = bankingV10.status(user);
  const lateLoan = delinquent.loans.find((loan) => loan.id === second.loanId);
  if (!lateLoan || lateLoan.status !== 'delinquent') throw new Error('delinquency mismatch');
  if (lateLoan.lateFeeTotal <= 0 || lateLoan.balanceDue <= second.totalDue) throw new Error('late fee mismatch');
  if (delinquent.profile.creditScore >= paid.profile.creditScore) throw new Error('late score mismatch');

  const bankCommand = [...commands].reverse().find((command) => command.name === 'bank');
  if (!bankCommand || !bankCommand.aliases?.includes('loan')) throw new Error('bank command not registered');
  const minerShop = [...commands].reverse().find((command) => command.name === 'minershop');
  if (!minerShop || !/estilo visual activo/i.test(minerShop.description)) throw new Error('minershop style override missing');

  const balanceCommand = [...commands].reverse().find((command) => command.name === 'balance');
  if (!balanceCommand) throw new Error('balance command not registered');
  let relayedBalance = null;
  const chatId = '120363999999999999@g.us';
  const quoted = { key: { id: 'BALANCE-SMOKE', remoteJid: chatId, participant: user }, message: { conversation: '.balance' } };
  const fakeSocket = {
    user: { id: '5215559999999:1@s.whatsapp.net' },
    relayMessage: async (_jid, content, options) => { relayedBalance = { content, options }; },
    sendMessage: async () => undefined,
  };
  await balanceCommand.handler({
    sender: user,
    prefix: '.',
    chatId,
    message: quoted,
    socket: fakeSocket,
    reply: async () => undefined,
  });
  if (!relayedBalance?.content) throw new Error('interactive balance was not relayed');
  const balanceText = JSON.stringify(relayedBalance.content);
  const labels = ['Crédito bancario:', 'Préstamos de usuarios:', 'Multas:', 'Pasivos totales:'];
  if (!labels.every((label) => balanceText.includes(label))) throw new Error('balance liability lines missing');
  if (balanceText.includes('*-0 NXC*')) throw new Error('negative zero liability display detected');
  if (!balanceText.includes('Crédito bancario:')) throw new Error('bank debt plain amount missing');
  if (!balanceText.includes('Banco') || !balanceText.includes('Minería')) throw new Error('balance action buttons missing');

  console.log(JSON.stringify({ scoreBefore: firstEligibility.profile.creditScore, scoreAfterEarlyPay: paid.profile.creditScore, scoreAfterLate: delinquent.profile.creditScore, lateFee: lateLoan.lateFeeTotal, identityMerge: merged, repaired, afterWithdraw, positiveLiabilityFormatting: true, interactiveBalance: true, minerShop: minerShop.description }));
`

try {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', source], {
    cwd: root,
    env: { ...process.env, ENV_FILE: path.join(temp, 'missing.env'), DATA_DIR: dataDir, SESSION_DIR: path.join(dataDir, 'session'), NEXORA_GLOBAL_ECONOMY_DB: walletDb, NEXORA_INSTANCE_ROLE: 'main', OWNER_NUMBERS: '', ADMIN_WEB_TOKEN: 'bank-v10-ci-token', OLLAMA_ENABLED: 'false' },
    encoding: 'utf8',
  })
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `exit ${result.status}`)
  const output = result.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1)
  if (!output) throw new Error('bank smoke produced no output')
  JSON.parse(output)
  console.log('bank v10 smoke: OK')
} finally {
  rmSync(temp, { recursive: true, force: true })
}
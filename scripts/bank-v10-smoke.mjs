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
  const { commands } = await import('./apps/bot/dist/commands/index.js');
  const user = '5215551112222@s.whatsapp.net';

  economy.balance(user);
  economy.walletDb.prepare('UPDATE global_economy_users SET wallet = 20000, bank = 5000 WHERE user_jid = ?').run(user);

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
  if (paid.remaining !== 0 || paid.profile.creditScore <= 650) throw new Error('early payment did not improve score');

  const second = bankingV10.requestLoan(user, 1000);
  economy.walletDb.prepare('UPDATE bank_loans_v10 SET due_at = ?, updated_at = ? WHERE id = ?')
    .run(Date.now() - 2 * 86400000, Date.now(), second.loanId);

  const delinquent = bankingV10.status(user);
  const lateLoan = delinquent.loans.find((loan) => loan.id === second.loanId);
  if (!lateLoan || lateLoan.status !== 'delinquent') throw new Error('delinquency status not applied');
  if (lateLoan.lateFeeTotal <= 0 || lateLoan.balanceDue <= second.totalDue) throw new Error('late fee not applied');
  if (delinquent.profile.creditScore >= paid.profile.creditScore) throw new Error('late payment did not reduce score');

  const bankCommand = [...commands].reverse().find((command) => command.name === 'bank');
  if (!bankCommand || !bankCommand.aliases?.includes('loan')) throw new Error('bank V10 command not registered');
  const minerShop = [...commands].reverse().find((command) => command.name === 'minershop');
  if (!minerShop || !/estilo visual activo/i.test(minerShop.description)) throw new Error('minershop V13 style carousel override not registered');

  console.log(JSON.stringify({
    scoreBefore: firstEligibility.profile.creditScore,
    scoreAfterEarlyPay: paid.profile.creditScore,
    scoreAfterLate: delinquent.profile.creditScore,
    lateFee: lateLoan.lateFeeTotal,
    minerShop: minerShop.description,
  }));
`

try {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', source], {
    cwd: root,
    env: {
      ...process.env,
      ENV_FILE: path.join(temp, 'missing.env'),
      DATA_DIR: dataDir,
      SESSION_DIR: path.join(dataDir, 'session'),
      NEXORA_GLOBAL_ECONOMY_DB: walletDb,
      NEXORA_INSTANCE_ROLE: 'main',
      OWNER_NUMBERS: '',
      ADMIN_WEB_TOKEN: 'bank-v10-ci-token',
      OLLAMA_ENABLED: 'false',
    },
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

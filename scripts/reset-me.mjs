// 일회용: 현재 user(또는 지정 kakao_id) 삭제 → 신규가입 테스트용
// 사용: node scripts/reset-me.mjs [kakao_id]
import { createClient } from '@libsql/client';
import fs from 'node:fs';
import path from 'node:path';

const env = fs.readFileSync(path.resolve('.env.local'), 'utf8');
const get = (k) => env.match(new RegExp(`^${k}=(.+)$`, 'm'))?.[1]?.trim();

const db = createClient({
  url: get('TURSO_DATABASE_URL'),
  authToken: get('TURSO_AUTH_TOKEN'),
});

const kakaoId = process.argv[2];
const users = await db.execute(
  kakaoId
    ? { sql: 'SELECT id, kakao_id, name, email FROM users WHERE kakao_id=?', args: [kakaoId] }
    : 'SELECT id, kakao_id, name, email FROM users'
);
console.log('found users:', users.rows);

if (users.rows.length === 0) { console.log('nothing to delete'); process.exit(0); }
if (!kakaoId && users.rows.length > 1) {
  console.log('multiple users — pass kakao_id arg to target one');
  process.exit(1);
}

const userId = users.rows[0].id;
const tables = ['transactions','recurring','budgets','categories','people','debts','debt_rate_history','account_settings','user_account_settings','investment_trades','investments','business_targets'];

const tx = await db.transaction('write');
try {
  for (const t of tables) {
    try { await tx.execute({ sql: `DELETE FROM ${t} WHERE user_id=?`, args: [userId] }); }
    catch (e) { console.warn(`skip ${t}:`, e.message); }
  }
  await tx.execute({ sql: 'DELETE FROM users WHERE id=?', args: [userId] });
  await tx.commit();
  console.log(`deleted user id=${userId}`);
} catch (e) {
  await tx.rollback();
  console.error('failed:', e);
  process.exit(1);
}

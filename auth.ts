import NextAuth from 'next-auth';
import { authConfig } from './auth.config';
import { ensureDb } from './lib/db';

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ profile, account }) {
      try {
      console.log('[signIn] profile keys:', profile ? Object.keys(profile) : 'null', 'account.providerAccountId:', account?.providerAccountId);
      if (!profile && !account) return false;
      const db = await ensureDb();
      const kakaoId = String(account?.providerAccountId || (profile as any)?.sub || (profile as any)?.id || '');
      if (!kakaoId) { console.error('[signIn] no kakaoId'); return false; }
      const email = (profile as any).email || (profile as any).kakao_account?.email || null;
      const name = (profile as any).name || (profile as any).properties?.nickname || (profile as any).kakao_account?.profile?.nickname || '사용자';

      const existing = await db.execute({ sql: 'SELECT id FROM users WHERE kakao_id=?', args: [kakaoId] });
      if (existing.rows.length === 0) {
        const r = await db.execute({
          sql: 'INSERT INTO users (kakao_id, email, name) VALUES (?, ?, ?)',
          args: [kakaoId, email, name],
        });
        const newId = Number(r.lastInsertRowid);
        const userCount = await db.execute('SELECT COUNT(*) AS c FROM users');
        if (Number((userCount.rows[0] as any).c) === 1) {
          for (const tbl of ['categories','transactions','recurring','budgets','account_settings','people','debts','debt_rate_history']) {
            try { await db.execute({ sql: `UPDATE ${tbl} SET user_id=? WHERE user_id IS NULL`, args: [newId] }); } catch {}
          }
        } else {
          const seed: [string, string][] = [
            ['personal', '식비'], ['personal', '교통'], ['personal', '공과금'],
            ['personal', '문화/여가'], ['personal', '의료'], ['personal', '쇼핑'],
            ['personal', '급여'], ['personal', '기타수입'], ['personal', '기타'],
            ['business', '매출'], ['business', '매입'], ['business', '임대료'],
            ['business', '인건비'], ['business', '공과금'], ['business', '세금'],
            ['business', '소모품'], ['business', '접대비'], ['business', '기타'],
          ];
          for (const [l, n] of seed) {
            try { await db.execute({ sql: 'INSERT INTO categories (ledger, name, user_id) VALUES (?,?,?)', args: [l, n, newId] }); } catch {}
          }
        }
      } else {
        await db.execute({ sql: 'UPDATE users SET name=?, email=? WHERE kakao_id=?', args: [name, email, kakaoId] });
      }
      return true;
      } catch (e) {
        console.error('[signIn] error:', e);
        return false;
      }
    },
    async jwt({ token, profile, account }) {
      try {
        if (profile || account) {
          const kakaoId = String(account?.providerAccountId || (profile as any)?.sub || (profile as any)?.id || '');
          if (kakaoId) {
            const db = await ensureDb();
            const u = await db.execute({ sql: 'SELECT id, name FROM users WHERE kakao_id=?', args: [kakaoId] });
            const row = u.rows[0] as any;
            if (row) {
              token.userId = Number(row.id);
              token.name = row.name;
            }
          }
        }
      } catch (e) {
        console.error('[jwt] error:', e);
      }
      return token;
    },
    async session({ session, token }) {
      (session as any).userId = token.userId;
      if (token.name) session.user!.name = token.name as string;
      return session;
    },
  },
});

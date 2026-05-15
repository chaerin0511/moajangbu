import NextAuth from 'next-auth';
import { authConfig } from './auth.config';
import { ensureDb } from './lib/db';

export const { handlers, auth, signIn, signOut, unstable_update: updateSession } = NextAuth({
  ...authConfig,
  events: {
    // 토큰(access/refresh/id_token)이 로그에 남지 않도록 최소 식별자만 기록
    async signIn(msg) {
      console.log('[event:signIn]', {
        provider: msg.account?.provider,
        providerAccountId: msg.account?.providerAccountId,
        isNewUser: msg.isNewUser,
      });
    },
    async createUser(msg) {
      console.log('[event:createUser]', { userId: (msg.user as any)?.id });
    },
  },
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ profile, account }) {
      try {
      if (!profile && !account) return false;
      const db = await ensureDb();
      const kakaoId = String(account?.providerAccountId || (profile as any)?.sub || (profile as any)?.id || '');
      if (!kakaoId) { console.error('[signIn] no kakaoId'); return false; }
      const email = (profile as any).email || (profile as any).kakao_account?.email || null;
      const name = (profile as any).name || (profile as any).properties?.nickname || (profile as any).kakao_account?.profile?.nickname || '사용자';
      const image = (profile as any).image || (profile as any).picture || (profile as any).properties?.profile_image || (profile as any).kakao_account?.profile?.profile_image_url || null;

      const existing = await db.execute({ sql: 'SELECT id, name FROM users WHERE kakao_id=?', args: [kakaoId] });
      if (existing.rows.length === 0) {
        const r = await db.execute({
          sql: 'INSERT INTO users (kakao_id, email, name, image) VALUES (?, ?, ?, ?)',
          args: [kakaoId, email, name, image],
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
        // 이메일·이미지는 항상 최신화. 이름은 기본값('사용자')일 때만 카카오 닉네임으로 갱신 (사용자가 직접 수정한 이름은 보존).
        const cur = existing.rows[0] as any;
        const shouldUpdateName = !cur.name || cur.name === '사용자';
        if (shouldUpdateName) {
          await db.execute({ sql: 'UPDATE users SET name=?, email=?, image=COALESCE(?, image) WHERE kakao_id=?', args: [name, email, image, kakaoId] });
        } else {
          await db.execute({ sql: 'UPDATE users SET email=?, image=COALESCE(?, image) WHERE kakao_id=?', args: [email, image, kakaoId] });
        }
      }
      return true;
      } catch (e) {
        console.error('[signIn] error:', e);
        return false;
      }
    },
    async jwt({ token, profile, account, trigger }) {
      try {
        if (profile || account) {
          const kakaoId = String(account?.providerAccountId || (profile as any)?.sub || (profile as any)?.id || '');
          if (kakaoId) {
            const db = await ensureDb();
            const u = await db.execute({ sql: 'SELECT id, name, image, nav_order FROM users WHERE kakao_id=?', args: [kakaoId] });
            const row = u.rows[0] as any;
            if (row) {
              token.userId = Number(row.id);
              token.name = row.name;
              token.picture = row.image;
              (token as any).navOrder = row.nav_order || null;
            }
          }
        }
        // After profile update, refresh from DB
        if (trigger === 'update' && token.userId) {
          const db = await ensureDb();
          const u = await db.execute({ sql: 'SELECT name, image, nav_order FROM users WHERE id=?', args: [Number(token.userId)] });
          const row = u.rows[0] as any;
          if (row) {
            token.name = row.name;
            token.picture = row.image;
            (token as any).navOrder = row.nav_order || null;
          }
        }
      } catch (e) {
        console.error('[jwt] error:', e);
      }
      return token;
    },
    async session({ session, token }) {
      (session as any).userId = token.userId;
      (session as any).navOrder = (token as any).navOrder ?? null;
      if (token.name) session.user!.name = token.name as string;
      if (token.picture) session.user!.image = token.picture as string;
      return session;
    },
  },
});

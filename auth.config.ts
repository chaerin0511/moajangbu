import type { NextAuthConfig } from 'next-auth';
import Kakao from 'next-auth/providers/kakao';

export const authConfig = {
  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
  trustHost: true,
  debug: false,
  providers: [
    Kakao({
      clientId: process.env.KAKAO_CLIENT_ID!,
      clientSecret: process.env.KAKAO_CLIENT_SECRET || '',
    }),
  ],
  // 금전 데이터 보호: 세션 7일로 단축, 24h마다 갱신(갱신 시 JWT 콜백이 DB 상태 재확인)
  session: { strategy: 'jwt', maxAge: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
  pages: { signIn: '/login' },
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;
      const { pathname } = request.nextUrl;
      const isPublic = pathname.startsWith('/login') || pathname.startsWith('/signup') || pathname.startsWith('/api/auth');
      if (!isLoggedIn && !isPublic) return false;
      return true;
    },
  },
} satisfies NextAuthConfig;

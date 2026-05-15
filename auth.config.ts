import type { NextAuthConfig } from 'next-auth';
import Kakao from 'next-auth/providers/kakao';

export const authConfig = {
  providers: [
    Kakao({
      clientId: process.env.KAKAO_CLIENT_ID!,
      clientSecret: process.env.KAKAO_CLIENT_SECRET || '',
    }),
  ],
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;
      const { pathname } = request.nextUrl;
      const isPublic = pathname.startsWith('/login') || pathname.startsWith('/api/auth');
      if (!isLoggedIn && !isPublic) return false;
      return true;
    },
  },
} satisfies NextAuthConfig;

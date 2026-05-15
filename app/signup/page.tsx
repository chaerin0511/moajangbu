import { signIn } from '@/auth';
import { cookies } from 'next/headers';
import Link from 'next/link';
import SignupFlow from '@/components/SignupFlow';

export const metadata = {
  title: '회원가입 · 모아장부',
  description: '개인 가계부 + 사업자 현금흐름을 한 곳에서.',
};

const MINT = '#2c9a6a';

async function signupAction(fd: FormData) {
  'use server';
  const m = String(fd.get('mode') || 'all');
  if (m === 'personal' || m === 'business' || m === 'all') {
    cookies().set('ledger_view', m, { path: '/', maxAge: 60 * 60 * 24 * 365 });
  }
  await signIn('kakao', { redirectTo: '/' });
}

export default function SignupPage() {
  return (
    <div className="-mx-4 sm:-mx-5 -my-5 sm:-my-8 -mb-20 sm:-mb-8 min-h-[100dvh] flex items-center justify-center bg-white text-slate-900">
      <div className="w-full max-w-md px-6 py-16 sm:py-20">
        <Link href="/login" className="flex items-center gap-2.5 hover:opacity-80 transition w-fit">
          <svg width="36" height="36" viewBox="0 0 36 36" aria-hidden>
            <circle cx="18" cy="18" r="16" fill={MINT} />
            <circle cx="18" cy="18" r="11.5" fill="none" stroke="white" strokeOpacity="0.35" strokeWidth="1" />
            <path d="M11.5 18.5 L16 23 L24.5 13.5" fill="none" stroke="white" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-[15px] font-semibold tracking-tight">모아장부</span>
        </Link>

        <SignupFlow signupAction={signupAction} />

        <p className="mt-12 text-center text-[11px] text-slate-400">
          © {new Date().getFullYear()} 모아장부
        </p>
      </div>
    </div>
  );
}

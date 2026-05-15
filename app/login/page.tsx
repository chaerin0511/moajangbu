import { signIn } from '@/auth';

export const metadata = { title: '로그인' };

export default function LoginPage() {
  return (
    <div className="min-h-[calc(100vh-3rem)] flex items-center justify-center px-4">
      <div className="w-full max-w-sm flex flex-col items-center text-center">
        <span
          className="relative inline-flex w-20 h-20 rounded-3xl items-center justify-center text-white text-4xl font-extrabold tracking-tighter shadow-[0_10px_30px_-10px_rgba(49,130,246,0.55)]"
          style={{ background: 'linear-gradient(135deg, #4a98ff 0%, #3182f6 55%, #1b64da 100%)' }}
        >
          ₩
          <span className="absolute bottom-3 right-3 w-2.5 h-2.5 rounded-full bg-white/90" />
        </span>

        <h1 className="mt-6 text-[26px] font-bold tracking-tight">모아장부</h1>
        <p className="mt-2 text-[15px] text-slate-500">
          가계와 사업을 한 곳에서.
        </p>

        <form
          className="w-full mt-10"
          action={async () => { 'use server'; await signIn('kakao', { redirectTo: '/' }); }}
        >
          <button
            type="submit"
            className="w-full flex items-center justify-center gap-2 rounded-xl py-3.5 font-semibold text-[15px] text-[#181600] transition active:translate-y-px hover:brightness-95"
            style={{ background: '#FEE500' }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
              <path d="M9 1.5C4.86 1.5 1.5 4.15 1.5 7.42c0 2.13 1.42 4 3.55 5.04l-.9 3.3c-.08.3.24.55.5.38l3.95-2.62c.13.01.27.02.4.02 4.14 0 7.5-2.65 7.5-5.92S13.14 1.5 9 1.5z" fill="#181600"/>
            </svg>
            카카오로 시작하기
          </button>
        </form>

        <p className="mt-5 text-[12px] text-slate-400 leading-relaxed">
          로그인하면 본인 데이터만 보입니다.
        </p>
      </div>
    </div>
  );
}

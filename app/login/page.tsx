import { signIn } from '@/auth';

export const metadata = { title: '로그인' };

export default function LoginPage() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center">
      <div className="card p-8 max-w-sm w-full text-center space-y-6">
        <div className="flex flex-col items-center gap-3">
          <span className="relative inline-flex w-14 h-14 rounded-2xl items-center justify-center text-white text-2xl font-extrabold tracking-tighter"
                style={{ background: 'linear-gradient(135deg, #4a98ff 0%, #3182f6 55%, #1b64da 100%)' }}>
            ₩
            <span className="absolute bottom-2 right-2 w-2 h-2 rounded-full bg-white/85" />
          </span>
          <h1 className="text-xl">모아장부</h1>
          <p className="text-sm text-slate-500">개인·사업자 통합 가계부</p>
        </div>
        <form action={async () => { 'use server'; await signIn('kakao', { redirectTo: '/' }); }}>
          <button
            type="submit"
            className="w-full flex items-center justify-center gap-2 rounded-xl py-3 font-semibold text-[#181600]"
            style={{ background: '#FEE500' }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M9 1.5C4.86 1.5 1.5 4.15 1.5 7.42c0 2.13 1.42 4 3.55 5.04l-.9 3.3c-.08.3.24.55.5.38l3.95-2.62c.13.01.27.02.4.02 4.14 0 7.5-2.65 7.5-5.92S13.14 1.5 9 1.5z" fill="#181600"/>
            </svg>
            카카오로 시작하기
          </button>
        </form>
        <p className="text-xs text-slate-400">로그인하면 본인 데이터만 보입니다.</p>
      </div>
    </div>
  );
}

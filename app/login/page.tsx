import { signIn } from '@/auth';

export const metadata = {
  title: '모아장부 · 진짜 쓸 수 있는 돈을 보여주는 가계부',
  description: '개인 가계부 + 사업자 현금흐름을 한 곳에서. 고정지출·세금·비상금을 자동으로 떼고 실제 쓸 수 있는 금액만 보여줍니다.',
};

const MINT = '#0bbf7b';
const MINT_DARK = '#0a8b59';

function KakaoButton({ label = '카카오로 시작하기' }: { label?: string }) {
  return (
    <form action={async () => { 'use server'; await signIn('kakao', { redirectTo: '/' }); }}>
      <button
        type="submit"
        className="w-full flex items-center justify-center gap-2 rounded-xl py-4 font-semibold text-[15px] text-[#181600] shadow-sm transition active:translate-y-px hover:brightness-95"
        style={{ background: '#FEE500' }}
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
          <path d="M9 1.5C4.86 1.5 1.5 4.15 1.5 7.42c0 2.13 1.42 4 3.55 5.04l-.9 3.3c-.08.3.24.55.5.38l3.95-2.62c.13.01.27.02.4.02 4.14 0 7.5-2.65 7.5-5.92S13.14 1.5 9 1.5z" fill="#181600"/>
        </svg>
        {label}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="-mx-4 sm:-mx-5 -my-5 sm:-my-8 -mb-20 sm:-mb-8 min-h-[100dvh] flex items-center justify-center bg-white text-slate-900">
      <div className="w-full max-w-md px-6 py-16 sm:py-20">
        {/* 로고 영역 */}
        <div className="flex items-center gap-2.5">
          <svg width="36" height="36" viewBox="0 0 36 36" aria-hidden>
            <circle cx="18" cy="18" r="16" fill={MINT} />
            <circle cx="18" cy="18" r="11.5" fill="none" stroke="white" strokeOpacity="0.35" strokeWidth="1" />
            <path
              d="M11.5 18.5 L16 23 L24.5 13.5"
              fill="none"
              stroke="white"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="text-[15px] font-semibold tracking-tight">모아장부</span>
        </div>

        {/* 핵심 카피 */}
        <h1 className="mt-10 text-[32px] sm:text-[36px] font-bold leading-[1.25] tracking-tight">
          잔액 말고,
          <br />
          <span style={{ color: MINT_DARK }}>진짜 쓸 수 있는 돈</span>.
        </h1>
        <p className="mt-4 text-[15px] text-slate-500 leading-relaxed">
          고정지출·세금·비상금을 자동으로 떼어내고,
          <br className="hidden sm:block" />
          이번 달 실제로 쓸 수 있는 금액만 보여줍니다.
        </p>

        {/* 미니 시각화 */}
        <div className="mt-8 rounded-2xl border border-slate-100 bg-slate-50/60 p-5">
          <div className="text-[12px] text-slate-500">통장 잔액</div>
          <div className="mt-0.5 text-[20px] font-semibold tabular-nums text-slate-400 line-through decoration-slate-300">
            ₩ 5,000,000
          </div>
          <div className="mt-3 text-[12px] text-slate-500">실제 쓸 수 있는 돈</div>
          <div className="mt-0.5 text-[28px] font-bold tabular-nums" style={{ color: MINT_DARK }}>
            ₩ 3,280,000
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-500">개인 가계부</span>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-500">사업자 현금흐름</span>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-500">가족 공유</span>
          </div>
        </div>

        {/* CTA */}
        <div className="mt-8">
          <KakaoButton />
          <div className="mt-3 flex items-center justify-center gap-x-3 gap-y-1 text-[12px] text-slate-400">
            <span>평생 무료</span>
            <span className="w-1 h-1 rounded-full bg-slate-300" />
            <span>광고 없음</span>
            <span className="w-1 h-1 rounded-full bg-slate-300" />
            <span>3초 가입</span>
          </div>
        </div>

        <p className="mt-12 text-center text-[11px] text-slate-400">
          © {new Date().getFullYear()} 모아장부
        </p>
      </div>
    </div>
  );
}

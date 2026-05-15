'use client';
import { useState } from 'react';
import type { ViewMode } from '@/lib/view-mode';

const MINT = '#4a7c5f';
const MINT_DARK = '#3a6249';

const MODES: { value: ViewMode; title: string; desc: string }[] = [
  { value: 'personal', title: '개인',  desc: '가계부·고정지출·비상금' },
  { value: 'business', title: '사업자', desc: '매출·부가세·종소세 충당' },
  { value: 'all',      title: '둘 다',  desc: '개인 + 사업자 한 화면' },
];

function KakaoIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path d="M9 1.5C4.86 1.5 1.5 4.15 1.5 7.42c0 2.13 1.42 4 3.55 5.04l-.9 3.3c-.08.3.24.55.5.38l3.95-2.62c.13.01.27.02.4.02 4.14 0 7.5-2.65 7.5-5.92S13.14 1.5 9 1.5z" fill="#181600"/>
    </svg>
  );
}

export default function LoginCard({
  signupAction,
}: {
  signupAction: (fd: FormData) => void;
}) {
  const [view, setView] = useState<'intro' | 'picker'>('intro');
  const [mode, setMode] = useState<ViewMode>('all');

  if (view === 'intro') {
    return (
      <>
        <h1 className="text-[32px] sm:text-[36px] font-bold leading-[1.25] tracking-tight">
          잔액 말고,
          <br />
          <span style={{ color: MINT_DARK }}>진짜 쓸 수 있는 돈</span>.
        </h1>
        <p className="mt-4 text-[15px] text-slate-500 leading-relaxed">
          고정지출·세금·비상금을 자동으로 떼어내고,
          <br className="hidden sm:block" />
          이번 달 실제로 쓸 수 있는 금액만 보여줍니다.
        </p>

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
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-500">대출 이자 관리</span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setView('picker')}
          className="mt-8 w-full rounded-xl py-4 font-semibold text-[15px] text-white shadow-sm transition active:translate-y-px hover:brightness-95"
          style={{ background: MINT_DARK }}
        >
          시작하기
        </button>
        <div className="mt-3 flex items-center justify-center gap-x-3 text-[12px] text-slate-400">
          <span>평생 무료</span>
          <span className="w-1 h-1 rounded-full bg-slate-300" />
          <span>3초 가입</span>
        </div>
      </>
    );
  }

  return (
    <>
      <h1 className="text-[26px] font-bold tracking-tight leading-tight">
        어떤 용도로 쓸까요?
      </h1>
      <p className="mt-2 text-[13.5px] text-slate-500">
        용도에 맞춰 첫 화면을 정리해 드려요. 나중에 바꿀 수 있어요.
      </p>

      <form action={signupAction} className="mt-6">
        <input type="hidden" name="mode" value={mode} />

        <div className="space-y-2">
          {MODES.map(o => {
            const active = mode === o.value;
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => setMode(o.value)}
                className={`w-full flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition ${
                  active ? '' : 'bg-white border-slate-200 hover:border-slate-300'
                }`}
                style={active ? { background: '#eef3ef', borderColor: '#d0ddd3' } : undefined}
              >
                <div>
                  <div className="text-[14px] font-semibold" style={active ? { color: MINT_DARK } : undefined}>
                    {o.title}
                  </div>
                  <div className="text-[12px] text-slate-500 mt-0.5">{o.desc}</div>
                </div>
                <span
                  aria-hidden
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                    active ? '' : 'border-slate-300'
                  }`}
                  style={active ? { borderColor: MINT, background: MINT } : undefined}
                >
                  {active && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                      <path d="M5 12l5 5L20 7" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
              </button>
            );
          })}
        </div>

        <button
          type="submit"
          className="mt-4 w-full flex items-center justify-center gap-2 rounded-xl py-4 font-semibold text-[15px] text-[#181600] shadow-sm transition active:translate-y-px hover:brightness-95"
          style={{ background: '#FEE500' }}
        >
          <KakaoIcon />
          카카오로 가입하기
        </button>
        <button
          type="submit"
          className="mt-2 w-full rounded-xl border border-slate-200 bg-white py-4 font-semibold text-[15px] text-slate-700 hover:bg-slate-50 transition active:translate-y-px"
        >
          회원가입하기
        </button>
      </form>

      <button
        type="button"
        onClick={() => setView('intro')}
        className="mt-4 w-full text-center text-[13px] text-slate-500 hover:text-slate-900"
      >
        ← 처음으로 돌아가기
      </button>
    </>
  );
}

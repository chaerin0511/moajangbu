# 모아장부

개인·사업자 통합 가계부. 저축률, 비상금, 세금 충당금, 대출 상환까지 한 화면에서 본다.

Next.js 14 (App Router) · TypeScript · Tailwind · libSQL/Turso · NextAuth v5 (Kakao) 로 만든 멀티테넌트 웹앱.

## 주요 기능

- **이중 장부**: 모든 거래를 `personal` / `business` 로 분리. 장부 간 이체 지원.
- **대시보드**: 저축률 티어(건강/보통/주의/위험), 전월 대비 순익, 고정비 커버리지, 순수 변동소비, 6개월 저축률 추세.
- **계좌 잔액 & 월말 예상**: 시작잔액 + 거래로 현재 잔액 계산, 남은 고정거래까지 반영한 월말 예상치.
- **고정거래(recurring)**: 매월 지정일 자동 생성. 대시보드 진입 시 미생성분 채움.
- **예산**: 카테고리·장부·월별 한도와 사용률 게이지.
- **비상금 게이지**: 개인 월평균 고정지출 기준 몇 개월치 보유 중인지 표시 (권장 6개월).
- **세금 충당금**: 사업자 매출에 대해 설정한 비율만큼 적립 필요액·미납 추정·실가용 잔액 계산.
- **대출 관리**: 원금·이자 분리 기록, 누적이자 이월, 금리 이력, 거치기간, 의무상환 비율. 원금 상환은 저축으로 가산한 "조정 저축률" 제공.
- **이상 지출 감지**: 최근 3개월 평균 대비 ±30% 이상 변동 카테고리 자동 표시.
- **가족(people)**: 거래 주체 태깅.
- **카카오 로그인 + 멀티테넌트**: 모든 데이터 테이블에 `user_id` 격리.

## 기술 스택

- **Next.js 14.2** App Router, Server Actions, RSC
- **next-auth v5** (Kakao provider, JWT 세션 30일)
- **libSQL** — 로컬은 `file:./data/ledger.db`, 운영은 Turso
- **Tailwind CSS 3.4**
- **Vercel** 배포 (`vercel.json` — `icn1` 서울 리전)

## 디렉토리 구조

```
app/
  page.tsx              대시보드
  transactions/         거래 목록/추가
  recurring/            고정거래
  budgets/              예산
  categories/           카테고리
  statistics/           통계
  debts/                대출
  people/               가족
  settings/             시작잔액·세금 충당비율
  profile/  more/  login/
components/
  TransactionForm, BulkTransactionForm, BudgetForm, RecurringForm,
  BottomTabs, NavLink, Disclosure
lib/
  db.ts                 libSQL 클라이언트 + 스키마 init/마이그레이션
  queries.ts            모든 집계 쿼리 (저축률·비상금·세금·이상지출 등)
  actions.ts            Server Actions (CRUD)
  auth-helper.ts        currentUserId()
  utils.ts              formatWon, currentMonth 등
auth.ts, auth.config.ts NextAuth 설정
middleware.ts           비로그인 사용자 보호
```

## 시작하기

```bash
npm install
cp .env.local.example .env.local
# .env.local 채우기:
#   TURSO_DATABASE_URL=file:./data/ledger.db   (로컬) 또는 libsql://...
#   TURSO_AUTH_TOKEN=...                       (Turso 사용 시)
#   AUTH_SECRET=$(openssl rand -base64 32)
#   KAKAO_CLIENT_ID=...
#   KAKAO_CLIENT_SECRET=...
npm run dev
```

DB 스키마와 기본 카테고리는 첫 요청 시 [lib/db.ts](lib/db.ts) 의 `init()` 이 자동 생성한다. 컬럼 추가는 `ALTER TABLE ... IGNORE` 패턴으로 멱등하게 진행된다.

## 스크립트

- `npm run dev` — 개발 서버
- `npm run build` — 프로덕션 빌드
- `npm start` — 프로덕션 서버

## 인증

Kakao OAuth 전용. 신규 가입 시 개인/사업자 기본 카테고리 18종을 자동 시딩하고, 닉네임은 사용자가 직접 변경한 경우 카카오 동기화에서 보존된다.

## 데이터 모델 (요약)

`users / categories / transactions / recurring / budgets / user_account_settings / people / debts / debt_rate_history`

모든 비-인증 테이블은 `user_id` 로 격리. 거래는 `type ∈ {income, expense, transfer}`, 이체는 `from_ledger`·`to_ledger` 로 표현.

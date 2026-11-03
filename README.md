# 차곡 — 개인 가계부

HTML/CSS/JavaScript, Node.js + Express, Neon PostgreSQL 기반의 개인 가계부입니다. 날짜·항목·카테고리·원화 정수 금액의 추가/조회/수정/삭제, 날짜 검색, 월별 합계, 카테고리 합계와 막대그래프를 제공합니다. 검색 중에도 요약 및 그래프는 선택한 월 전체를 기준으로 합니다. 데이터는 Neon에만 저장합니다.

## 로컬 실행

Node.js 22 이상이 필요합니다. Windows PowerShell 실행 정책으로 npm이 차단되면 `npm.cmd`를 사용하세요.

```sh
npm install
```

`.env.example`을 참고하여 프로젝트 루트의 `.env`에 다음 두 값을 설정합니다. 기존 `.env`가 있다면 덮어쓰지 말고 항목을 추가하세요.

```dotenv
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require
APP_PASSWORD=충분히-길고-무작위인-비밀번호
PORT=3000
```

Neon 프로젝트의 Connect에서 PostgreSQL 연결 문자열을 복사하세요. 첫 인증된 데이터 요청 시 `expenses` 테이블을 자동으로 생성하므로 연결 역할에 테이블 생성 권한이 필요합니다. 금액은 1~2,147,483,647원의 정수입니다.

```sh
npm start
```

http://localhost:3000 에서 APP_PASSWORD로 로그인합니다. 개발 시 `npm run dev`, 검증은 `npm test`를 실행하세요. 설정이 없어도 로그인 화면은 실행되며, 데이터 기능은 환경변수 설정 후 사용할 수 있습니다.

## GitHub + Vercel 배포

1. GitHub에 새 저장소를 만들고 이 폴더를 푸시합니다. `.env`와 `node_modules`는 `.gitignore`로 제외됩니다. 커밋 전 `git status`로 비밀 파일이 포함되지 않았는지 확인하세요.
2. Vercel에서 Add New → Project → GitHub 저장소를 가져옵니다.
3. Framework Preset은 Other, Root Directory는 이 프로젝트 루트로 설정합니다. 별도 Build Command나 Output Directory는 필요하지 않습니다. Node.js 런타임은 22 이상을 선택합니다.
4. Vercel 프로젝트 Settings → Environment Variables에 `DATABASE_URL`, `APP_PASSWORD`를 등록합니다. 필요한 Production/Preview/Development 범위를 선택하세요. 프런트엔드 공개 접두어를 붙이지 마세요.
5. Deploy를 실행합니다. `vercel.json`이 모든 요청을 `api/index.js`의 Express 앱으로 전달합니다. 환경변수 변경 후에는 재배포해야 합니다.
6. 배포 URL에서 로그인하고 지출 추가·수정·검색·삭제 및 Neon 테이블 반영을 확인하세요. 이후 GitHub 기본 브랜치 푸시 시 Vercel이 자동 배포합니다.

이 저장소는 배포 가능한 소스와 설정을 제공합니다. 실제 GitHub 저장소 생성 및 Vercel 배포는 연결된 계정에서 위 절차로 진행합니다.

## 인증 및 보안

- APP_PASSWORD는 서버에서만 비교합니다. 12시간 유효한 HMAC 서명 세션을 HttpOnly/SameSite=Strict 쿠키로 사용하고, Vercel/production에서는 Secure를 적용합니다. 비밀번호 변경 시 기존 세션은 무효화됩니다.
- 로그아웃은 브라우저 쿠키를 제거합니다. 개별 세션을 서버에서 취소하는 기능은 없으며, 복사된 쿠키는 만료 또는 비밀번호 변경까지 유효합니다.
- 로그인 시도는 인스턴스별 15분에 10회로 제한합니다. Vercel 여러 인스턴스에 걸친 전역 제한은 아니므로 공개 운영 시 Vercel 방화벽 등의 전역 제한도 적용할 수 있습니다.
- SQL은 Neon 태그 템플릿의 매개변수 바인딩을 사용합니다. 입력 검증, 요청 Origin/사용자 지정 헤더 확인, Helmet 보안 헤더를 적용합니다.
- 정적 파일은 `public` 폴더에서만 제공합니다. DB 주소·비밀번호·DB 오류 세부내용은 API 응답에 포함하지 않습니다. DB 연결 정보는 브라우저에서 사용하지 않습니다.
- 단일 사용자를 위한 공유 비밀번호 방식이며 사용자별 계정 구분은 없습니다.
- 테스트는 입력 검증과 실제 HTTP 인증/보안 경로를 검사합니다. 실제 Neon CRUD 통합 검증에는 유효한 DATABASE_URL과 APP_PASSWORD가 필요합니다.

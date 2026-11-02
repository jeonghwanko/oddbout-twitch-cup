# Codex 작업 지침

이 저장소는 ODDBOUT에서 분리한 Twitch Cup 클라이언트다. creator agent·MCP 서버·플러그인 전체를 포함한다고 가정하지 않는다. 이 파일은 빠른 진입 안내이며, 상세 작업 절차는 [`docs/development.md`](docs/development.md)에 있다.

## 먼저 확인할 것

- 작업 전 `README.md`와 관련 모듈·테스트를 읽는다. Twitch Cup 동작 변경은 `src/app`, `src/platform`, `src/render/boot`, `src/sim`의 책임 경계를 확인한다.
- `git status --short`와 현재 diff를 먼저 확인한다. 사용자와 다른 작업의 수정은 보존하고, 무관한 변경을 되돌리거나 함께 커밋하지 않는다.
- 프로젝트 구조와 메시지 흐름은 [`docs/architecture.md`](docs/architecture.md)를 참고한다.
- `rg --files`로 후보를 찾고 `rg -n`을 관련 경로에 한정한다. 미디어·압축 산출물·대형 JSON·lockfile을 통째로 읽거나 검색하지 않는다. 필요한 데이터의 스키마와 소비 코드만 확인한다.
- 비밀키·실제 OAuth 토큰을 소스, 로그, 문서, 테스트 fixture에 넣지 않는다.
- `.env`는 로컬 설정이다. 설정 항목은 `.env.example`로 확인하며 기존 `.env`를 덮어쓰지 않는다. `VITE_*`는 모두 공개되는 값이다.

## 개발 및 확인 명령

- Node.js 22, npm 사용.
- 의존성 설치: `npm ci`
- Twitch 없는 로컬 검증은 `.env` 없이 가능하다. 주소는 `http://localhost:5178/twitch.html?lang=en`이다. `/`에는 진입 페이지가 없다.
- 개발 서버: `npm run dev` (포트 5178, strict port)
- 테스트: `npm test` (`test/**/*.test.ts` 전체)
- 타입 검사: `npm run lint:types`
- 프로덕션 빌드: `npm run build`
- 최종 검증: `npm run check` (타입 → 테스트 → 빌드). 절차와 수동 확인은 [`docs/testing.md`](docs/testing.md).
- 빌드 미리보기: `npm run preview` (5178 포트; 개발 서버와 동시에 실행하지 않는다).
- 청크 분석: `npm run analyze:build`. 측정값·성능 경계·예산은 [`docs/performance.md`](docs/performance.md). Phaser 배포본과 미디어 목록 변환을 바꾸면 빌드 예산 및 런타임 미디어 테스트를 확인한다.
- 실제 첫 경기 측정: 빌드 후 `npm run measure:first-bout -- --ports=5186,5187,5188`. 새 출처·no-store·캐시 적중 0을 확인하고 로컬 측정의 범위를 명시한다.
- 실제 세 경기 검증: 로컬 서버와 설치된 Chrome에서 `npm run test:browser -- --seed=123`. 시계 변경은 `--raf-ms=1000` 조건도 확인한다. 상세 조건은 `docs/testing.md`를 따른다.
- 측정 비교에는 저장이 확인된 `kind: ready`만 사용한다. `invalid`·오류·재시도·숨김·누락된 리소스를 정상 cold sample로 바꾸지 않는다. 실행 편차와 제외 조건도 기록한다.

## 코드 소유 경로

- Twitch Cup 상태 규칙: `src/app/TwitchTournament.ts`; 등록 선수 명령/표시 목록: `src/app/TwitchCupRoster.ts`.
- Twitch OAuth와 채팅: `src/platform/twitchAuth.ts`, `src/twitchAuthCallback.ts`, `src/platform/twitchChat.ts`.
- iframe 계약과 재시도: `src/app/TwitchArenaBout.ts`, `src/app/TwitchBoutRecovery.ts`.
- Cup 화면과 흐름 연결: `src/twitch.ts`; 전투 호스트: `src/render/boot/TwitchArenaBoot.ts`; 페이지 진입점: `twitch.html`, `twitch-auth.html`, `fighter.html`.
- 전투 시뮬레이션: `src/sim/cityFight/bout/CityFightFighterBout.ts`와 그 하위 규칙·전투기 모듈. 표현은 `src/render`, 아트 카탈로그는 `src/assets`.
- 관련 회귀 테스트는 `test/`에서 기능명으로 찾는다. UI 연결·초기화·뒤로가기 복원은 `test/twitch-ui.test.ts`.
- 먼저 `npm test -- test/관련파일.test.ts`로 필요한 범위만 검증한다. 새 테스트는 `test/` 아래 `*.test.ts`로 작성한다.

## 지켜야 할 동작

- 컵 시작에는 정확히 4명이 필요하며, 일반 참가에서는 Twitch 계정과 선수가 각각 중복될 수 없다. 참가 순서가 준결승 대진을 정한다.
- 결과는 현재 활성 경기의 참가 선수 승리만 반영한다. 오래되거나 중복된 callback은 대진을 변경하지 않는다.
- 일반 참가 모드는 기본값이다. solo rehearsal은 연결·검증된 방송자 ID에만 허용되며, 서로 다른 선수 4명을 등록한다.
- `!join <이름>`은 메시지 전체가 명령이어야 한다. 기존 command 정규화와 중복 처리 계약을 유지한다.
- iframe 메시지는 기대한 출처·창·경기 ID·선수·seed가 일치해야 한다. ready/error를 승리 결과로 해석하지 않는다.
- 전투는 seed 기반 결정론에 의존한다. 선택 순서, 난수 소비 순서, 결과 digest를 바꾸는 수정은 재현성 영향까지 확인한다.
- 방송 호스트만 `TWITCH_RENDER_FRAME_RATE`의 timer/unsmoothed 정책을 사용한다. 진행 지연은 rawDelta·screenMs·simMs·가시성을 비교해 진단한다. 재현 없이 240초 watchdog이나 고정 시뮬레이션 스텝을 바꾸지 않는다.
- OAuth 토큰은 메모리에서만 다루고 저장소에 기록하지 않는다. 채팅 어댑터는 읽기 전용이며 프로토콜 응답 외 메시지를 보내지 않는다.

## 협업과 모델 선택

- 사용자가 위임 또는 병렬 작업을 허용한 경우에만 하위 에이전트를 사용한다.
- 단순 매핑·문서 작업은 Luna, 범위가 명확한 구현·리뷰는 Sol을 우선 제안한다. 사용자의 명시적 모델 선호가 있으면 그 선호를 따른다.
- 위임 시 목표·담당 파일·보존할 계약·검증 명령·원하는 보고 형식을 좁혀 전달한다. 같은 파일을 동시에 편집하지 않으며, 통합 담당자가 diff와 검증 결과를 확인한다.
- 이미 확인한 자료를 반복해 읽지 않는다. 관련 테스트부터 실행하고, 새 변경·실패·미해결 위험이 없다면 통과한 전체 검사를 반복하지 않는다.

## 변경과 완료 기준

- 기존 모듈 경계를 유지한다. 순수한 상태 규칙에 DOM/네트워크 코드를 넣지 않는다. 타입만 필요하면 `import type`을 사용한다.
- 버그 수정은 실패 조건을 재현하는 좁은 회귀 테스트로 확인한다. 외부 경계만 mock하고 실제 규칙까지 mock해 테스트를 통과시키지 않는다.
- 코드·의존성·빌드 변경은 관련 테스트 후 `npm run check`를 통과시킨다. 문서만 바꾸면 명령·파일 경로·링크·주장을 실제 소스와 대조하고 `git diff --check`로 확인한다.
- Phaser/호스트/UI 변경은 가능한 경우 `npm run preview`로 세 경기·우승·New cup을 수동 확인한다. 실제 Twitch/API를 쓰지 않았다면 결과에 그 한계를 명시한다.
- 동작·명령·환경 설정이 바뀌면 관련 문서도 같은 변경에서 갱신한다. 측정값에는 날짜와 방법을 적고 바이트 감소를 시간 단축률로 표현하지 않는다.
- 커밋·push·배포는 사용자가 요청한 범위에서 수행한다. push와 배포를 구분하고, 요청받지 않은 force push·원격 이력 덮어쓰기는 하지 않는다. 파일을 명시해 stage하고 `.env`, `dist/`, 로컬 보고서가 섞이지 않았는지 확인한다.
- 최종 보고는 변경 내용, 검증 명령과 결과, 남은 한계, 요청된 업로드의 브랜치/커밋을 간결하게 적는다. 로컬 검사와 원격 CI 결과를 구분한다.

## Code Review Rules

- 참가·대진 규칙과 origin/source/요청 ID/선수/seed 검증을 우회하는 변경을 지적한다. ready/error를 승리로 처리하거나 늦은 callback으로 다음 경기를 바꾸면 안 된다.
- 비동기 작업에서 종료·요청 교체·실패 후의 응답을 검사한다. 타이머와 listener를 정리하고, 대기 중 import 실패를 관찰하며, 오래된 작업이 씬을 만들지 않게 한다.
- OAuth 토큰의 영속 저장·로그 출력, 검증되지 않은 외부 메시지, 채팅의 쓰기 기능 추가를 지적한다.
- Phaser 전체 배포본이나 마을 전용 KTX2 의존성이 첫 경기 경로로 돌아오는지 확인한다. 빌드 예산을 숫자만 올리거나 경고 임계값 변경으로 우회하지 않는다.
- arena의 idle/walk는 `arenaGaitSheets`로 실제 좌우 방향만 요청하며 preload와 view의 준비 판정이 일치해야 한다. 마을 이름이 붙은 공통 코드를 통째로 삭제하지 않는다.
- 근거 없는 가능성보다 재현 조건·영향·코드 위치를 제시한다. 포맷 취향과 동작 결함을 구분한다.

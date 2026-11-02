# 개발·검증 안내

Node.js 22에서 `npm ci` 후 작업한다. `.env`가 없을 때만 `.env.example`을 복사한다. Twitch 없이 테스트할 때는 `.env`가 필요 없다. 외부 선수 API를 끄려면 `VITE_AI_FIGHTER_API_BASE`를 지우고 서버를 재시작한다.

## 빠른 확인

```sh
npm test -- test/twitch-tournament.test.ts
npm run lint:types
```

| 변경 대상 | 먼저 실행할 테스트 |
| --- | --- |
| 참가·대진·우승 | `test/twitch-tournament.test.ts` |
| 선수 명령·충돌 처리 | `test/twitch-cup-roster.test.ts` |
| 채팅 파서·소켓 | `test/twitch-chat.test.ts` |
| OAuth 검증 | `test/twitch-auth.test.ts` |
| iframe 메시지·요청·재시도 | `test/twitch-arena-bout.test.ts`, `test/twitch-bout-recovery.test.ts` |
| 전투 호스트의 병렬 부팅·경기 간 전환·치명적 오류 | `test/twitch-arena-host.test.ts` |
| 방송 프레임 시계·rAF 정체·blur·timer 종료 | `test/twitch-frame-clock.test.ts` (실제 Phaser TimeStep) |
| 등록/내장 선수 전투기 선택 | `test/twitch-arena-corners.test.ts` |
| 화면·연결 해제·페이지 복원 | `test/twitch-ui.test.ts` |
| Vite 입력·포트 | `test/twitch-site-build.test.ts` |
| 실제 청크 크기·불필요한 의존성 재유입 | `test/twitch-build-budget.test.ts` |
| 빌드의 오디오·글꼴 목록 축약 | `test/twitch-runtime-media.test.ts` |
| 경기의 좌우 이동 이미지·준비 판정 | `test/twitch-arena-gait.test.ts` |
| 첫 경기 측정의 실패·재시도·숨김·캐시·저장 오류 | `test/first-bout-probe.test.ts` |
| 측정 서버의 중단된 POST·UTF-8 분할 수신 | `test/first-bout-server.test.ts` |

새 테스트는 `test/` 아래 `*.test.ts`로 만든다. 기본 환경은 Node이며 DOM이 필요한 파일만 `// @vitest-environment jsdom`을 사용한다. 외부 서비스와 브라우저 경계를 mock하고, 검증하려는 실제 상태 규칙은 유지한다. 가짜 타이머·전역 listener·mock은 테스트가 끝날 때 정리한다. [Vitest 환경 문서](https://vitest.dev/guide/environment)를 참고한다.

## 최종 확인

```sh
npm run check
npm run preview
```

`check`는 타입 검사, 전체 테스트, 빌드를 순서대로 실행하고 실패 시 중단한다. `.github/workflows/check.yml`도 Node 22에서 같은 명령을 실행한다. workflow를 로컬에 추가한 것과 원격 Actions 실행 성공은 구분해서 보고한다.

`preview`는 `dist/`의 마지막 빌드를 제공한다. 파일 수정 뒤에는 다시 빌드해야 한다. 개발 서버와 미리보기 모두 5178을 쓰므로 둘 중 하나만 실행한다. 진입 주소는 `http://localhost:5178/twitch.html?lang=en`이며 루트 `/`에는 페이지가 없다.

개발 중에는 `npm run dev`를 사용한다. 파일 감시를 끄면 변경이 반영되지 않으므로 `server.watch: null`을 다시 추가하지 않는다. [Vite 파일 감시 설정](https://vite.dev/config/server-options#server-watch).

## 브라우저 점검

1. **Try it solo → Try without Twitch → Fill all 4 slots → Start cup**으로 시작한다. 준결승 2회와 결승 후 우승 표시를 확인한다. 탭은 보이는 상태로 둔다.
2. **New cup**에서 인원 0/4, 빈 대진, OPEN LOBBY, 기본 경기장으로 돌아오는지 확인한다. **Stream view**를 켜고 끈다.
3. 경기 중 다른 페이지로 이동 후 뒤로가기로 복원되면 **Retry match**로 같은 선수와 seed의 경기를 재시도할 수 있는지 확인한다. 브라우저가 BFCache를 쓰지 않고 새로 로드하면 컵이 초기화되는 것이 현재 동작이다.
4. Twitch가 설정된 경우 로그인 취소/성공, 실제 계정 4명의 참가, 방송자 혼자 하는 rehearsal을 확인한다. 우승 후 **Connection settings → Disconnect**를 누르면 이전 경기 iframe과 우승 표시가 사라져야 한다.
5. Clipboard 권한을 막은 상태에서도 선수 버튼을 누르면 직접 입력할 `!join` 안내가 표시되는지 확인한다.

`npm test`는 실제 Twitch 로그인·네트워크 복구·Phaser 렌더링/오디오·브라우저별 BFCache 동작을 보증하지 않는다. 실행한 수동 점검과 생략한 점검을 구분해 보고한다. UI 테스트의 합성 `pagehide`/`pageshow`는 브라우저의 BFCache 저장 여부 자체를 검증하지 않는다.

## 로컬 Playwright로 세 경기 검증

`npm ci`로 고정된 Playwright를 설치한다. 로컬 Google Chrome이 필요하며 MCP나 기존 사용자 프로필에 연결하지 않는다. 서버용 터미널에서 `npm run build` 후 `npm run preview`를 실행하고, 다른 터미널에서 다음 명령을 사용한다.

```sh
npm run test:browser -- --seed=123
npm run test:browser -- --seed=123 --raf-ms=1000 --out=browser-report/slow-raf
```

첫 명령은 일반 실행, 두 번째는 페이지와 iframe의 rAF callback만 1초 간격으로 전달하는 장애 재현이다. 전투 결과나 시뮬레이션 시간을 주입하지 않는다. `--seed=123`은 테스트 문서에서 경기 seed를 123, 124, 125로 고정하며, 생략하면 앱의 난수를 사용한다. 같은 seed의 수정 전 정상 실행과 수정 후 실행에서 승자·결과 전체·digest를 비교한다. 고정 seed와 rAF 주입은 배포 코드에 들어가지 않는다.

기본은 headless Chrome이며 `--headed`로 창을 표시할 수 있다. `--url=http://127.0.0.1:포트/twitch.html?lang=en`으로 다른 로컬 서버를 지정한다. Chrome의 background 제한을 해제하는 Playwright 기본 인수는 제외했다. headless와 headed, 브라우저 버전, 주입 조건은 보고서에 남는다. 이 재현은 실제 OS 창 가림이나 완전히 정지된 탭을 검증하지 않는다.

스크립트는 로컬 데모 UI를 클릭하고 실제 ready/result 메시지, 결승 대진, 우승 표시, New cup의 0/4·OPEN LOBBY·iframe 제거를 확인한다. `browser-report/report.json`에 시계·오류·실패한 요청을, 같은 폴더에 완료 또는 실패 화면을 저장한다. 사용자 프로필·OAuth 토큰은 사용하지 않는다. 요청 취소도 기록하므로 완료 여부와 별도로 살펴본다. 기본 전체 실행 한도는 780초이며 앱의 경기별 240초 제한은 그대로다. `--duration-ms`로 관측 한도를 정할 수 있고, `--diagnose`는 미완료/실패에도 종료 코드 0을 허용하므로 최종 합격 검사에서는 사용하지 않는다.

캐시 없는 HTTP 측정도 필요하면 preview 대신 `measure:first-bout` 서버를 사용한다. 이 브라우저 스크립트는 세 경기 완주 검사이며, 자체적으로 cold-cache 측정을 판정하지 않는다. 실제 Twitch 인증·채팅, 등록 선수 API, 소리 청취와 BFCache 왕복은 별도 점검한다.

## 빌드 해석

HTML 진입점은 세 개이며, `public/` 미디어도 `dist/`로 복사된다. 큰 청크 경고는 빌드 실패와 구분한다. `npm run analyze:build`로 청크 구성과 크기를 확인한다. 적용한 최적화·바이트 예산·시간 측정의 한계는 [performance.md](performance.md)를 따른다. 정적 글꼴은 `/fonts/...` 형태로 참조해 Vite가 public 파일로 인식하게 한다. [Vite public 디렉터리 규칙](https://vite.dev/guide/assets#the-public-directory).

CI의 체크아웃·Node 설정은 공식 [checkout](https://github.com/actions/checkout)과 [setup-node](https://github.com/actions/setup-node)를 사용하며, 배포 단계는 없다.

캐시 없는 첫 경기 실측은 [performance.md](performance.md)의 `npm run measure:first-bout` 절차를 따른다. 테스트 실행 시간이나 청크 크기를 사용자 로딩 시간으로 대신 보고하지 않는다. 측정 중에는 빌드/전체 테스트를 동시에 실행하지 않는다.

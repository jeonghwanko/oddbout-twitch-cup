# Codex 개발 작업 안내

이 문서는 작업별로 필요한 파일을 찾아 작은 변경과 검증으로 끝내기 위한 안내다. 기본 규칙은 루트 [AGENTS.md](../AGENTS.md)에 두고, 구조·테스트·성능의 상세 자료는 해당 문서에서 관리한다. 문서마다 전체 규칙을 복사하지 않는다.

## 시작할 때

1. `git status --short`, `git branch --show-current`, 관련 파일의 diff로 작업 상태를 확인한다. 다른 작업의 수정은 보존한다.
2. [README](../README.md)의 실행 방법과 루트 지침을 읽는다. 아래 표에서 변경 대상의 소유 모듈과 테스트를 선택한다.
3. 기능을 실제로 호출하는 경로를 확인하고, 필요한 파일만 읽는다. 원본 게임에서 남은 파일을 이름만으로 삭제하지 않는다.
4. 버그라면 좁은 재현 또는 회귀 테스트로 기존 실패를 확인한다. 단순 문구 수정에 구현을 그대로 따라 하는 테스트를 만들지는 않는다.

## 작업별 읽기 경로

| 작업 | 먼저 볼 코드 | 다음 참고 |
| --- | --- | --- |
| 참가·대진·중복 거부 | `src/app/TwitchTournament.ts`, `test/twitch-tournament.test.ts` | 화면 연결이 필요할 때만 `src/twitch.ts` |
| 선수 명령·승인 선수 목록 | `src/app/TwitchCupRoster.ts`, `test/twitch-cup-roster.test.ts` | `src/twitch.ts`의 `loadRegisteredFighters` |
| 로그인·채팅 연결 | `src/platform/twitchAuth.ts`, `twitchChat.ts`와 대응 테스트 | `src/twitchAuthCallback.ts`, UI 연결 세대 처리 |
| 멈춘 경기·재시도·늦은 결과 | `src/app/TwitchArenaBout.ts`, `TwitchBoutRecovery.ts` | `src/render/boot/TwitchArenaBoot.ts`, arena/host/recovery 테스트 |
| 화면 초기화·페이지 복원 | `src/twitch.ts`, `test/twitch-ui.test.ts` | `pagehide`/`pageshow`, `resetCup`, iframe 정리 |
| 전투 규칙 | `src/sim/cityFight/bout/CityFightFighterBout.ts`와 해당 규칙 | RNG 소비 순서, seed/digest 영향, 호출부 |
| 첫 경기 크기·부팅 순서 | `vite.config.ts`, `build/runtimeMedia.ts`, `TwitchArenaBoot.ts` | [성능 분석](performance.md), build-budget/runtime-media 테스트 |
| 실행·CI·문서 | `package.json`, `.github/workflows/check.yml`, `vitest.config.ts` | [검증 절차](testing.md), 세 HTML 진입점 |

`TwitchCupRoster`는 명령을 선수 ID로 변환하고, `TwitchTournament`는 상태 규칙을 소유한다. `src/twitch.ts`가 UI와 연결을 조립한다. 호스트는 전투 실행과 수명주기를, `src/sim`은 계산을 담당한다. 메시지 흐름과 불변 조건은 [architecture.md](architecture.md)를 따른다.

## 작은 범위로 조사하기

다음은 PowerShell과 일반 셸에서 사용할 수 있는 예시다.

```sh
rg --files src/app test -g '*Twitch*' -g '*twitch*'
rg -n 'createTwitchArenaStartGate|validateTwitchArenaStartMessage' src/app src/render/boot test
npm test -- test/twitch-arena-host.test.ts
```

루트 전체에서 모든 JSON을 검색하기보다 import하는 TypeScript와 타입 정의부터 확인한다. 에셋 조사가 필요하면 특정 파일의 스키마, 키 또는 개수만 뽑는다. `node_modules`, `dist`, 미디어, 압축 데이터, 대형 매니페스트를 대화 문맥에 통째로 넣지 않는다. 파일 목록이 큰 경우에도 범위를 좁힌다.

청크 문제는 `npm run analyze:build`로 실제 구성부터 본다. 모듈의 `renderedLength`는 기여도 추정치이며, 최종 청크 바이트·gzip·사용자가 기다린 시간은 서로 다른 수치다. 원본 미디어 출처와 라이선스 기록을 전송량 최적화 때문에 삭제하지 않는다.

## 구현과 검증

1. 순수한 상태 변경과 브라우저 부수효과를 분리하고 필요한 위치만 수정한다. 타입 import가 런타임 의존성으로 바뀌지 않게 한다.
2. 비동기 작업은 성공뿐 아니라 지연·거절·중복·종료 후 응답을 확인한다. retry로 선수·seed·승리 결과를 바꾸지 않는다.
3. [기능별 테스트 표](testing.md#빠른-확인)의 해당 파일부터 실행한다. 테스트는 실제 규칙을 사용하고 OAuth, WebSocket, Phaser 같은 외부 경계를 제어한다.
4. 코드·설정 변경이 끝나면 `npm run check`로 타입·전체 테스트·빌드를 한 번 검증한다. 실패하면 원인을 수정하고 영향을 받는 검사를 다시 실행한다.
5. UI·전투 호스트·Phaser 변경이면 프로덕션 preview에서 로컬 컵 완주와 초기화를 확인한다. 실제 Twitch나 등록 선수 API 검증은 환경이 준비된 경우에만 실행하고, 생략한 항목은 보고한다.

문서만 변경할 때는 불필요한 게임 실행 대신 링크·경로·명령·주장을 검증한다. 코드 검사가 이미 통과했고 코드가 바뀌지 않았다면 문구 수정마다 전체 테스트를 반복하지 않는다. `npm run lint:types`는 타입 검사이며 포맷 검사가 아니다. `git diff --check`는 공백 문제를 검사한다.

## Codex에 작업 전달하기

다음 형태로 목표와 검증 범위를 주면 추가 탐색을 줄일 수 있다.

```text
목표: 경기 로딩 중 페이지를 벗어났을 때 늦은 응답이 씬을 만들지 않게 해줘.
범위: TwitchArenaBoot와 관련 테스트. 기존 변경은 보존해줘.
유지할 계약: 선수·seed·요청 ID 검증, 타임아웃, 정상적인 연속 경기.
검증: 해당 호스트 테스트로 재현하고 수정 후 npm run check.
보고: 원인, 변경 파일, 실행한 검사, 브라우저에서 미검증인 항목.
```

위임은 사용자가 허용했을 때만 한다. 단순 문서/매핑은 Luna, 한정된 구현/리뷰는 Sol을 우선 고려하되 현재 환경의 사용 가능 여부와 사용자 지시를 따른다. 모델 이름을 문서에 쓴 것만으로 실행 모델이 설정되지는 않는다. 하위 작업에는 담당 파일과 완료 조건을 지정하고, 전체 저장소를 중복 조사하게 하지 않는다.

Codex의 프로젝트 지침 진입 파일은 `AGENTS.md`다. 상세 문서를 읽어야 하는 시점을 여기에 연결하고 핵심 규칙은 짧게 유지한다. 공식 동작 설명은 [OpenAI의 AGENTS.md 안내](https://learn.chatgpt.com/docs/agent-configuration/agents-md)를 참고한다. 이 저장소의 안내를 위해 개인 전역 설정이나 자격증명을 바꿀 필요는 없다.

## 문서와 업로드

| 바뀐 내용 | 함께 갱신할 문서 |
| --- | --- |
| 설치·환경 변수·운영 UI·빌드 | `README.md` |
| 소유 모듈·메시지 흐름·계약 | `docs/architecture.md` |
| 검사 명령·회귀 범위·수동 절차 | `docs/testing.md` |
| 청크 구성·예산·측정 결과 | `docs/performance.md` |
| 에이전트가 반드시 지킬 작업 규칙 | `AGENTS.md` |
| 날짜가 있는 리뷰 결과·검증 이력 | `docs/review-2026-11-02.md` 또는 새 날짜의 리뷰 기록 |

업로드를 요청받았다면 대상 remote/branch를 확인하고, 포함할 파일을 명시해 stage한다. staged diff에 비밀값·개인 문서·산출물·다른 작업의 변경이 섞이지 않았는지 확인한 뒤 커밋하고 push한다. 원격이 앞서 있으면 이력을 확인해 통합하고 force push로 덮어쓰지 않는다. CI를 확인할 때는 업로드한 SHA와 일치하는 실행 결과를 사용한다. 소스 push와 사이트 배포는 별개이며, 배포는 요청된 경우에 수행한다.

완료 보고에는 무엇을 바꿨는지, 어떤 검사가 통과했는지, 실제로 확인하지 않은 범위, 요청받은 업로드의 커밋/링크를 남긴다. 수동 실행과 mock 테스트를 혼동하거나 검증하지 않은 결과를 성공으로 적지 않는다.

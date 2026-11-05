# ODDBOUT Twitch Cup 구조

## 페이지와 실행 흐름

Vite는 다섯 HTML 페이지를 빌드한다. 개발 서버는 포트 5178을 strict하게 사용한다.

| 페이지 | 진입 모듈 | 역할 |
| --- | --- | --- |
| `twitch.html` | `src/twitch.ts` | 컵 UI, Twitch 연결, 채팅 명령 처리, 대진 및 iframe 제어 |
| `twitch-auth.html` | `src/twitchAuthCallback.ts` | OAuth 응답을 읽고 주소 fragment를 지운 뒤 opener에 결과 전달 |
| `fighter.html` | `src/fighter.ts` | `twitchBout` 런타임 옵션을 읽고 전투 호스트 부팅 |
| `broadcast.html` | `src/broadcast.ts` | 별도 agent exhibition 화면·브라우저 API·동일 출처 전투 iframe 제어 |
| `bet.html` | `src/bet.ts` | 배팅 부스: 1:1 무한 경기, 채팅 `!bet`/`!balance`, 무료 포인트 원장, 데모 봇 |

Cup 흐름은 채팅에서 `!join`을 받아 등록된 선수 command와 대조하고, `TwitchTournament` 상태 전이로 네 참가자의 대진을 구성한다. 활성 경기는 `TwitchArenaBout` 계약에 맞춰 같은 출처의 `fighter.html` iframe에 전달한다. 호스트는 선수를 로드하고 Phaser `ArenaDuelScene`을 실행한다. 검증된 경기 결과만 Cup 상태에 반영되어 다음 경기 또는 챔피언으로 이어진다.

## 모듈 경계

- `src/app/BroadcastCup.ts`: Twitch 등록과 독립적인 4인 exhibition 상태 규칙. 두 준결승과 결승의 순서, uint32 seed 증가, job 입력 충돌·중복·취소를 처리한다. `src/broadcast.ts`만 DOM·iframe 경계를 조립한다. 기존 Twitch 참가 정책은 변경하지 않는다.

- `src/app/BetRound.ts`·`BetLedger.ts`·`BetMatchmaker.ts`: 배팅 부스의 순수 규칙. `!bet`/`!balance` 파서, 라운드당 1건(열린 동안 교체), 패리뮤추얼 정산(한쪽만 건 라운드는 0), 시작 1,000·하한 100, 원장 디코드, 최근 대진 회피.
- `src/app/BetBooth.ts`: 배팅 라운드 루프(open → lock → bout → settle/void). seed는 마감 **뒤에** 뽑는다. 원장은 검증된 결과로 정산할 때만 한 번 저장하고(`platform/betLedgerStorage`, `sessionBackedStore`), 실패·시간 초과·페이지 숨김은 void로 끝나 포인트가 움직이지 않는다. 연속 3회 실패하면 멈춘다. `src/bet.ts`는 DOM·채팅·데모 봇만 조립하며 시청자 문자열은 textContent로만 쓴다.
- `src/arenaFrameRunner.ts`: `broadcast.ts`와 `bet.ts`가 함께 쓰는 전투 iframe 러너. 기존 origin/source/요청 ID/선수/seed 검증과 문서 교체 거부·watchdog을 그대로 옮긴 것이다.
- `src/app/TwitchTournament.ts`: 순수한 토너먼트 상태 규칙. 참가, 시작, 결과 반영, solo rehearsal 정책을 다룬다.
- `src/app/TwitchCupRoster.ts`: 기본 선수와 승인된 등록 선수의 공개 command 목록을 만든다.
- `src/platform/twitchAuth.ts` 및 `src/twitchAuthCallback.ts`: 브라우저 OAuth popup 왕복과 세션 검증. 현재 필요한 권한은 `chat:read`이다.
- `src/platform/twitchChat.ts`: Twitch IRC WebSocket의 읽기 전용 수신·파싱, 재연결 및 중복 메시지 처리. 소켓 생성부터 채널 입장 확인까지 15초 제한을 두며, 종료·교체된 소켓의 남은 프레임 데이터는 버린다.
- `src/platform/registeredFighters.ts`: 공개 선수 서비스에서 등록 메타데이터와 제한된 선수 자료를 가져온다.
- `src/app/TwitchArenaBout.ts`: iframe URL과 `postMessage` 자료의 유효성 계약.
- `src/app/TwitchBoutRecovery.ts`: 부팅 재시도 및 실패 상태 규칙.
- `src/render/boot/TwitchArenaBoot.ts`: 전투 모듈 import와 게임/글꼴 부팅을 동시에 시작하고, 선수 로드·씬 실행·결과 메시지를 연결한다. host-ready와 bout-ready는 별개다.
- `src/render/RenderFrameRate.ts`: 기본 페이지는 기존 rAF/smoothing 정책을 유지한다. 방송 호스트만 `GameBootSpec.frameRate`로 timer, unsmoothed delta, target 60, limit 0을 전달한다. timer 자체가 주기를 정하므로 FPS limit을 중복 적용하지 않는다. 씬의 숨김 처리·100ms 상한과 전투의 고정 스텝·인트로·hitstop·240초 watchdog은 유지한다.
- `src/render/scenes/village/PhaserFightDeps.ts`: arena의 공통 텍스처/오디오 어댑터. `NativeCityFightDeps.ts`의 마을 전용 family/KTX2 경로와 분리한다.
- `build/runtimeMedia.ts`: Vite에서 오디오·글꼴 목록의 런타임 필드만 투영한다. 원본 출처 정보는 수정하지 않는다. Phaser 배포본 선택과 함께 [performance.md](performance.md)를 참고한다.
- `src/sim`: 규칙과 전투 상태 계산. `src/render`: Phaser 화면·효과·장면. `src/assets`와 `src/world`: 아트 카탈로그 및 게임 데이터.

## 경계 계약과 불변 조건

- 참가 슬롯은 4개이며 참가 순서가 첫 두 준결승 선수와 다음 두 선수의 짝을 정한다. 일반 참가에서는 같은 Twitch 사용자나 이미 선택된 선수가 다시 등록할 수 없다.
- 승리 callback은 현재 활성 경기 ID에 속하고 그 경기 참가자 중 한 명을 가리켜야 한다. stale, 중복, 비참가자 결과는 거부한다.
- live 등록이 새 컵의 기본이다. rehearsal에서는 연결된 방송자 계정만 참가할 수 있고, 동일 방송자 계정의 네 참가 슬롯은 네 개의 서로 다른 선수로 채운다.
- `!join` 파서는 메시지 전체에 단일 command가 있어야 한다. 허용 문자는 영문자·숫자·밑줄·하이픈이며 길이는 1–64자다. 매칭 전에 소문자화한다.
- OAuth 응답은 popup의 origin, source, state를 확인하고 Twitch validate 응답에서 client ID, 사용자, scope, 만료를 검증한다. access token은 브라우저 저장소가 아니라 메모리에서만 유지한다.
- iframe 요청과 응답은 동일 origin/source 및 경기 ID, 선수 쌍, seed가 일치해야 한다. seed는 unsigned 32-bit 정수다. ready/error 메시지는 경기 결과가 아니다.
- iframe 재탐색은 WindowProxy를 바꾸지 않는다. 이전 문서의 지연된 host-ready가 새 문서의 준비를 가리지 않도록 검증된 host-ready마다 현재 start 요청을 재전송한다. 호스트는 각 요청 토큰을 한 번만 실행한다.
- 부팅 watchdog은 기본 25초이며 등록 선수 한 명마다 20초를 더한다. 부팅 재시도는 한 번으로 제한된다. 전투 결과는 시뮬레이션의 seed와 digest를 포함한다.
- 호스트의 전역 치명적 오류 이후에는 새 경기 요청에 해당 요청 ID의 오류를 즉시 응답한다. 수동 재시도로 iframe을 새로 만든다. 일반 선수 로딩·경기 오류는 같은 호스트의 후속 요청을 막지 않는다.
- 시뮬레이션은 seed 기반 선택에 의존한다. `src/sim/cityFight/bout/CityFightFighterBout.ts`의 난수 소비와 업데이트 순서를 변경할 때 결과 재현성도 확인한다.

## 테스트와 검증 범위

`broadcast.html`의 `window.oddboutBroadcast` protocol 1은 `runCup({jobId, leaseToken, seed, fighterIds})`, `getStatus()`, `cancel()`을 제공한다. 결과에는 job/lease 연결과 실제 세 경기의 digest·시간·승리 근거가 포함된다. 각 경기 seed는 `(seed + index) >>> 0`이다. 동일 job의 입력·lease 변경과 다른 동시 job은 거부하고, 실패·취소 결과는 같은 문서 안에서 재실행하지 않는다. 이 중복 방어는 메모리 한정이며 서버 원장이나 지출 승인이 아니다. 페이지 재시작 후 조정은 외부 runner의 책임이다.

부모는 기존 `TwitchArenaBout` 검증으로 origin/source/요청 ID/선수/seed를 확인하고 host-ready마다 현재 start를 전달한다. bout-ready 후 유효한 result만 대진을 전진시킨다. 기존 호스트가 등록 선수의 실제 승인·패키지를 확인하며 로딩·전투 timeout, 취소, 페이지 종료는 오류로 끝나고 결과를 합성하지 않는다. job/lease는 화면에 렌더하지 않고 OAuth·결제·wallet 코드를 이 경로에 넣지 않는다.

배팅 부스의 포인트는 현금 가치가 없다(구매·환전·교환 불가). 원장은 방송자 브라우저의 `localStorage`에만 있고(`STORAGE_KEYS.betLedger`, 데모는 `betLedgerDemo`), 서버 원장이나 지갑이 아니다. 채팅은 Cup과 같은 읽기 전용 `chat:read` 연결을 쓰고 채팅에 글을 쓰지 않는다. `bet-round`·`bet-ledger`·`bet-booth`·`bet-ui` 테스트가 규칙·저장·루프·화면을 다룬다.

`vitest.config.ts`는 `test/**/*.test.ts`를 실행한다. 테스트는 토너먼트 규칙, command roster, IRC adapter, OAuth 경계, iframe 계약, 실패 복구, 등록 선수의 전투기 선택, 다섯 페이지 빌드 설정을 다룬다. `twitch-ui.test.ts`는 jsdom에서 실제 화면 제어 코드와 상태 규칙을 함께 실행하며 외부 인증·채팅·선수 API를 mock한다. `twitch-arena-host.test.ts`는 Phaser와 에셋 로더를 mock하고 실제 호스트 제어 코드의 연속 경기·오류 복구를 검증한다. 통합 확인 명령은 `npm run check`이다.

`twitch-frame-clock.test.ts`는 실제 Phaser TimeStep으로 rAF 정체·blur delta 손실·timer 진행과 종료를 검사한다. 별도 `npm run test:browser`는 로컬 Chrome에서 실제 iframe 전투 세 경기·우승·New cup을 확인하며 CI의 `check`에는 포함하지 않는다. Twitch 로그인·실제 채팅은 별도 확인이 필요하다. `twitch-site-build.test.ts`는 Vite 입력 페이지와 포트 설정을 검사하며, 프로덕션 산출물의 전 화면 동작을 검증하지 않는다. 점검 조건과 기능별 테스트 선택은 [testing.md](testing.md)를 따른다.

## 저장소 범위와 참고 사항

이 저장소는 기존 ODDBOUT 게임에서 Twitch Cup에 필요한 부분을 추출한 독립 실행형이다. 전투 엔진, Phaser 장면, 렌더러, 에셋 도구 상당수는 공유 또는 상속 코드이므로 파일이 존재한다는 이유만으로 Cup 진입 경로에서 사용된다고 가정하지 않는다. 호출부와 진입 경로를 따라 확인한다.

승인된 creator fighter의 최신 메타데이터·패키지·아트는 런타임의 공개 서비스에서 온다. 해당 파일 전체를 저장소에 복사하거나 대형 JSON/미디어를 통째로 열기보다 `registeredFighters.ts`와 실제 로더에서 필요한 계약을 확인한다. 출처 및 제3자 미디어 정보는 `NOTICE.md`에 있다.

# 첫 경기 로딩과 빌드 크기

## 2026-11-02 측정

Windows, Node 22.22.2, 현재 lockfile로 같은 프로덕션 빌드를 비교했다. 아래 값은 가장 큰 두 JS 청크의 실제 바이트 수이며 미디어 전송량이나 전체 페이지 크기는 아니다. 파일 해시는 빌드마다 달라질 수 있다.

| 청크 | 변경 전 bytes | 변경 후 bytes | 감소 |
| --- | ---: | ---: | ---: |
| `UiFeedback-*.js` (Phaser 포함) | 1,529,018 | 1,247,711 | 18.40% |
| `ArenaDuelScene-*.js` | 972,134 | 926,088 | 4.74% |
| 합계 | 2,501,152 | 2,173,799 | **327,353 bytes / 13.09%** |
| 합계 gzip | 717,490 | 656,552 | **60,938 bytes / 8.49%** |

gzip은 Node `gzipSync` 기본 설정으로 각 청크를 압축한 값의 합이다. 서버의 압축 설정이나 Vite 출력과는 다를 수 있다. 이 결과는 코드 전송·파싱 대상이 줄었다는 근거이며, 실제 첫 경기 시작 시간이 13% 빨라졌다는 뜻은 아니다. 네트워크 제한·기기별 반복 시간 측정은 아직 하지 않았다.

## 원인과 변경

1. **Phaser 배포본.** `UiFeedback`이라는 청크 이름과 달리 대부분은 Phaser였다. 설치된 동일 버전 3.90.0의 공식 `phaser-arcade-physics.js`를 사용해 쓰지 않는 Phaser Matter 통합을 제외했다. Canvas/WebGL과 오디오 등 사용 기능은 유지한다. 독립 시뮬레이션에서 직접 사용하는 `matter-js`는 변경하지 않았다. Phaser Matter API가 새로 필요해지면 이 alias도 재검토한다.
2. **미디어 목록.** 오디오·글꼴의 출처 및 제작 메타데이터까지 런타임 JS에 포함되어 있었다. `build/runtimeMedia.ts`가 Vite의 JSON 처리 전에 실행에 필요한 key/path/hash, duration, voice, font 필드만 남긴다. 원본 `src/assets/runtime-media.json`과 `NOTICE.md`의 출처 정보는 유지한다. 모듈 기여도 추정치는 249,986 → 57,743 bytes로 줄었다.
3. **마을 전용 텍스처 의존성.** arena에서 쓰지 않는 family 선언 경로가 `native-city-ktx2.json`을 끌어왔다. 공통 Phaser 아트 어댑터를 `PhaserFightDeps.ts`로 분리하고 arena가 직접 사용하도록 했다. 기존 `NativeCityFightDeps.ts`는 마을의 family 동작을 보존하는 wrapper로 남겼다. Cup 빌드에서 해당 JSON과 연결 모듈이 빠졌다.
4. **부팅 대기 순서.** 기존에는 전투 모듈 import가 끝난 뒤 `bootGame`의 글꼴 로딩과 Phaser 초기화를 시작했다. 이제 두 작업을 동시에 시작한다. `host-ready`는 여전히 호스트 씬 생성 시점이며, 경기 시작은 모듈·선수·씬 준비를 모두 기다린다. import 실패는 즉시 관찰하고, 기다리는 동안 종료·요청 교체·시간 초과가 발생하면 오래된 작업은 씬을 만들지 않는다.

시뮬레이션 계산, 난수 소비, seed, 선수 선택, 결과 메시지 계약은 수정하지 않았다. 사용자 입력이나 미디어를 예측해 미리 전송하는 새로운 외부 요청도 추가하지 않았다.

## 다시 측정하기

```sh
npm run analyze:build
npm run analyze:build -- bundle-report.json
```

`scripts/analyze-build.mjs`는 메모리에서 프로덕션 빌드를 만들고 상위 청크와 구성 모듈을 출력한다. 선택 인수는 전체 JSON 보고서 경로다. `dist/`를 덮어쓰거나 public 미디어를 복사하지 않는다. 생성된 보고서는 측정용 로컬 파일이며 검토 없이 커밋하지 않는다.

`bytes`와 `gzipBytes`는 최종 청크의 실제 크기다. 모듈의 `bytes`는 bundler의 `renderedLength`로, 최종 minify 전 기여도 추정치다. 모듈 크기를 합쳐 전송량이라고 보고하지 않는다. 청크 이름만으로 책임을 추정하지 말고 모듈 목록과 import 경로를 함께 확인한다.

## 검증과 남은 범위

- `npm run check`: 타입 검사, 12개 파일의 71개 테스트, 프로덕션 빌드 통과.
- `twitch-build-budget.test.ts`: 실제 메모리 빌드에서 엔진 청크 1,300,000 bytes 미만, arena 청크 950,000 bytes 미만 및 불필요한 Phaser 전체 배포본/KTX2 목록 부재를 확인한다. 예산 초과 시 보고서를 보고 원인을 판단하며 숫자만 올리지 않는다.
- `twitch-runtime-media.test.ts`: 모든 오디오 식별자·해시·길이, voice cue, 글꼴 속성 보존을 원본 목록과 대조한다.
- `twitch-arena-host.test.ts`: 모듈 지연 중 게임 부팅, 종료, 요청 교체/중복, import 실패 및 기존 연속 경기·오류 처리를 확인한다.
- Chrome에서 `npm run preview`의 내장 선수 4명으로 준결승 2회·결승·우승 표시를 확인했다. Stream view 왕복과 New cup의 iframe 제거·0/4·빈 대진·OPEN LOBBY 복귀도 확인했다. 실제 Twitch 로그인·채팅과 등록 선수 API는 이번 수동 검증에 포함하지 않았다.

큰 청크 경고는 아직 남는다. Phaser 약 1.25 MB와 arena 약 926 kB는 첫 경기에 필요한 코드가 상당 부분이며, 단순히 파일을 나눠도 총 전송·평가 비용이 사라지지 않는다. 다음 작업은 cold cache에서 네트워크 전송, JS 평가, 글꼴/선수 에셋 준비를 분리 측정하는 것이다. 추가 lazy import는 실제 사용 시점과 부수효과 순서를 확인한 뒤 적용한다. 경고 임계값은 올리지 않았다.

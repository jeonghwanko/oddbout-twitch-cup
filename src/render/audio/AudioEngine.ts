import type { Voice } from "./voices";
import { FIGHT_VOICE_DIR, type AudioAssetDefinition } from "../../assets/RuntimeMediaCatalog";
import { isScrambledAudioPath, unscrambleAudio } from "../../assets/ScrambledAudio";
import { AUDIO_MIX, clampVolume } from "./AudioMix";
import type { AudioDynamicsProfile } from "./AudioMix";

/**
 * WebAudio 재생기.
 *
 * 브라우저 API 를 만지는 유일한 오디오 계층이다. `SfxPlayer`가 고른 제작 샘플과
 * 악보·앰비언스·발소리용 합성 voice를 실제 노드로 만들어 울린다.
 *
 * 브라우저는 사용자 제스처 전에는 AudioContext 를 재생하지 않는다. 그래서 생성은
 * 미루고 첫 입력에서 `unlock()` 이 깨운다 — 미리 만들면 suspended 상태로 남아
 * 첫 몇 초가 통째로 무음이 된다.
 */

/** 동시에 울리는 목소리 수 상한. 넘으면 새 소리를 버린다. */
const MAX_CONCURRENT = 24;

/** 끊을 수 있는 샘플 재생(`playSampleStoppable`). */
export interface SampleHandle {
  stop(fadeMs?: number): void;
}

/** `playSample` 의 선택 인자. 생략하면 예전과 같은 소리다. */
export interface SampleOptions {
  /** 페이드인 길이(ms). 타격 과도음을 살릴 샘플만 줄인다. 최소 1ms. */
  readonly attackMs?: number;
  /** 재생 속도 배율(0.5..2). 음높이도 함께 바뀐다. */
  readonly rate?: number;
  /**
   * 파일 앞부분을 건너뛸 길이(ms, 원본 시간). 끝에 정점이 있는 라이저를 짧은 예비동작에 맞출 때
   * 시작을 당기는 대신 앞을 잘라 정점 시각을 지킨다.
   */
  readonly offsetMs?: number;
  /** 올라탈 버스. 생략하면 효과음 버스. 대결 목소리(`audio/voice/`)는 `voice` — 플레이어의 목소리 음량을 탄다. */
  readonly bus?: AudioVoiceBus;
}

/** 음소거가 아닐 때의 최종 출력. 파일 루프는 이미 마스터링되어 별도 버스로 보낸다. */
const UNMUTED_MASTER_GAIN = 1;

/** 첫 사용자 입력에서 파일 첫 어택이 확인음처럼 튀지 않게 하는 진입 페이드. */
const FILE_LOOP_SILENCE_GAIN = 0.0001;

interface LoopPlayback {
  readonly key: string;
  gain: number;
  source: AudioBufferSourceNode | null;
  envelope: GainNode | null;
  /** 소스를 시작한 컨텍스트 시각(초). 아직 시작 전이면 null. */
  startedAt: number | null;
  /** 첫 시작 어택(초). 없으면 `loopFadeInSeconds`. 그 자리에서 시작하지 못하면 지운다(늦은 시작은 평소 페이드). */
  attackSeconds?: number;
  /** 첫 시작을 파일의 이 위치(초)에서 한다(`armLoopStart`). 그 자리에서 시작하지 못하면 지운다(늦은 시작은 곡 처음부터). */
  offsetSeconds?: number;
}

/**
 * 이만큼 긴 파일(음악·환경음)은 루프가 그 곡을 부를 때 받아 디코드하고, 그 곡을 트는 루프가 없어지면 디코드한 PCM 을 놓는다(2026-10-13).
 * 48 kHz 스테레오 1분은 약 22 MiB 다 — 전에는 첫 입력에 여덟 곡(730초, 약 250 MiB)을 모두 풀어 두었다. 짧은 효과음은 그대로 첫 입력에 받는다.
 */
const ON_DEMAND_SAMPLE_MS = 5_000;

/**
 * 합성 목소리가 올라탈 버스.
 *
 * `voice` 는 `voices.ts` 가 만든 목소리층이고 플레이어의 "목소리 음량" 슬라이더가
 * 소유한다. `effects` 는 그 슬라이더를 타지 않는 합성층 — 위험 리듬·마을 앰비언스처럼
 * 이미 음악 음량으로 조절되는 소리다. 둘을 합치면 목소리 슬라이더가 음악까지 몰래
 * 끌어내린다.
 */
export type AudioVoiceBus = "voice" | "effects";

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private effectsBus: GainNode | null = null;
  /**
   * 합성 목소리 전용 게인. `voiceBus → effectsBus` 로 이어 붙여서 배율 1일 때는
   * 예전 그래프와 소리가 같고, 슬라이더를 내리면 샘플 효과음은 그대로 둔 채
   * 목소리층만 물러난다.
   */
  private voiceBus: GainNode | null = null;
  private voiceVolume = 1;
  private effectsDynamics: DynamicsCompressorNode | null = null;
  private ambienceDynamics: DynamicsCompressorNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private readonly sampleBuffers = new Map<string, AudioBuffer>();
  private readonly sampleLoads = new Map<string, Promise<void>>();
  private readonly loops = new Map<string, LoopPlayback>();
  /** 채널의 다음 새 루프에 한 번만 쓸 어택(`armLoopAttack`). */
  private readonly armedAttack = new Map<string, number>();
  /** 채널의 다음 새 루프에 한 번만 쓸 시작 위치(`armLoopStart`). */
  private readonly armedOffset = new Map<string, number>();
  /** 루프가 부르기 전에 받아 둘 긴 곡(`prefetch`). */
  private readonly prefetched = new Set<string>();
  /**
   * 채널 장부에서는 빠졌지만 아직 꼬리가 울리는 옛 루프. 끝나면 `onended` 가 스스로
   * 지운다. 앱 종료가 꼬리를 기다리지 않고 한꺼번에 끊을 수 있게 따로 들고 있는다.
   */
  private readonly releasingLoops = new Set<LoopPlayback>();
  /**
   * 울리는 중인 목소리가 끝나는 시각(AudioContext 기준).
   *
   * 처음에는 `onended` 로 세는 카운터를 뒀는데, 탭이 뒤로 가면 컨텍스트가 멈춰
   * 예약된 노드가 끝나지 않는다. 그러면 카운터가 상한에 붙어 내려오지 않고 소리가
   * 영영 멈춘다. 시각을 적어 두고 지난 것을 지우면 그런 상태가 생길 수 없다.
   */
  private endsAt: number[] = [];
  private mutedFlag = false;
  /**
   * 탭이 뒤로 간 동안만 서는 플래그. 사용자의 음소거 설정(`mutedFlag`)과 **별도**다.
   *
   * 같은 플래그로 합치면 숨어 있는 동안 켠 음소거가 돌아올 때 풀리거나, 반대로
   * 사용자가 끈 소리가 복귀와 함께 다시 켜진다. 설정은 사용자만 바꾼다.
   */
  private backgroundedFlag = false;

  constructor(private readonly sampleAssets: readonly AudioAssetDefinition[] = []) {}

  get muted(): boolean {
    return this.mutedFlag;
  }

  /** 탭이 숨어 있어 소리를 내지 않는 중인가. 사용자 음소거와 별개다. */
  get backgrounded(): boolean {
    return this.backgroundedFlag;
  }

  /** 음소거든 백그라운드든, 지금 소리를 내지 않아야 하는가. */
  private get silenced(): boolean {
    return this.mutedFlag || this.backgroundedFlag;
  }

  /** E2E가 실제 WebAudio 잠금 해제와 파일 루프 연결을 확인하는 읽기 전용 진단값. */
  debugState(): {
    readonly contextState: AudioContextState | "locked";
    readonly backgrounded: boolean;
    readonly masterGain: number | null;
    readonly effectsBusGain: number | null;
    readonly voiceBusGain: number | null;
    readonly effectsDynamics: ReturnType<typeof dynamicsDebugState>;
    readonly ambienceDynamics: ReturnType<typeof dynamicsDebugState>;
    readonly loadedSampleKeys: readonly string[];
    /** 이 엔진이 첫 입력에 미리 받는 샘플 키 전체(긴 곡은 루프가 부를 때 받아 빠진다). 검사는 개수를 박지 않고 이것과 대조한다. */
    readonly expectedSampleKeys: readonly string[];
    readonly loops: readonly {
      readonly channel: string;
      readonly key: string;
      readonly gain: number;
      readonly playing: boolean;
    }[];
  } {
    return Object.freeze({
      contextState: this.ctx?.state ?? "locked",
      backgrounded: this.backgroundedFlag,
      masterGain: this.master?.gain.value ?? null,
      effectsBusGain: this.effectsBus?.gain.value ?? null,
      voiceBusGain: this.voiceBus?.gain.value ?? null,
      effectsDynamics: dynamicsDebugState(this.effectsDynamics),
      ambienceDynamics: dynamicsDebugState(this.ambienceDynamics),
      loadedSampleKeys: Object.freeze([...this.sampleBuffers.keys()].sort()),
      expectedSampleKeys: Object.freeze([...new Set(this.sampleAssets.filter((asset) => !onDemandSample(asset)).map((asset) => asset.key))].sort()),
      loops: Object.freeze([...this.loops].map(([channel, playback]) => Object.freeze({
        channel,
        key: playback.key,
        gain: playback.gain,
        playing: playback.source !== null,
      }))),
    });
  }

  /** 음소거 토글. 끄는 순간 이미 울리던 소리도 함께 줄인다. */
  toggleMute(): boolean {
    return this.setMuted(!this.mutedFlag);
  }

  /**
   * 저장된 설정을 그대로 적용한다. 토글과 달리 "지금 값이 무엇이든 이 값으로" 라서
   * 부팅 복원과 설정 화면이 현재 상태를 되묻지 않아도 된다.
   */
  setMuted(muted: boolean): boolean {
    if (this.mutedFlag === muted) return this.mutedFlag;
    this.mutedFlag = muted;
    this.applyMasterGain();
    return this.mutedFlag;
  }

  /** 목소리 버스 배율. 샘플 효과음 버스는 건드리지 않는다. */
  setVoiceVolume(volume: number): void {
    this.voiceVolume = clampVolume(volume);
    if (this.voiceBus === null || this.ctx === null) return;
    this.voiceBus.gain.setTargetAtTime(this.voiceVolume, this.ctx.currentTime, 0.02);
  }

  /**
   * 탭이 숨는 순간 마스터를 내린다. 게임 루프는 멈추지 않고 오직 출력만 끈다.
   *
   * 루프를 정지시키거나 컨텍스트를 닫지 않는 이유는 복귀 비용 때문이다 —
   * 다시 만들면 돌아온 첫 몇 초가 통째로 무음이 된다.
   */
  suspendForBackground(): void {
    if (this.backgroundedFlag) return;
    this.backgroundedFlag = true;
    this.applyMasterGain();
  }

  /** 탭이 돌아오면 사용자 설정 그대로의 음량으로 되돌린다. */
  resumeFromBackground(): void {
    if (!this.backgroundedFlag) return;
    this.backgroundedFlag = false;
    this.applyMasterGain();
    const ctx = this.ctx;
    if (ctx === null || typeof ctx.resume !== "function") return;
    // iOS 는 전화·잠금 뒤 표준 타입에 없는 "interrupted" 로 돌아온다. 상태 이름을
    // 열거하는 대신 "running 이 아니면 깨운다"로 둔다.
    if (ctx.state !== "running") {
      try {
        void ctx.resume().catch(() => undefined);
      } catch {
        // 복귀 실패는 무음일 뿐이다. 게임은 계속 돈다.
      }
    }
  }

  private applyMasterGain(): void {
    if (this.master === null || this.ctx === null) return;
    this.master.gain.setTargetAtTime(this.silenced ? 0 : UNMUTED_MASTER_GAIN, this.ctx.currentTime, 0.02);
  }

  /**
   * 사용자 제스처 시점에 부른다. 여러 번 불러도 안전하다.
   * 브라우저가 AudioContext 를 막고 있으면 조용히 넘어간다 — 소리 때문에 게임이
   * 멈추면 안 된다.
   */
  unlock(): void {
    try {
      if (this.ctx === null) {
        const Ctor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (Ctor === undefined) return;
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.effectsBus = this.ctx.createGain();
        this.voiceBus = this.ctx.createGain();
        this.effectsDynamics = createDynamics(this.ctx, AUDIO_MIX.effectsDynamics);
        this.ambienceDynamics = createDynamics(this.ctx, AUDIO_MIX.ambienceDynamics);
        this.master.gain.value = this.silenced ? 0 : UNMUTED_MASTER_GAIN;
        this.effectsBus.gain.value = AUDIO_MIX.effectsBusGain;
        this.voiceBus.gain.value = this.voiceVolume;
        this.voiceBus.connect(this.effectsBus);
        this.effectsBus.connect(this.effectsDynamics);
        this.effectsDynamics.connect(this.master);
        this.ambienceDynamics.connect(this.master);
        this.master.connect(this.ctx.destination);
        this.noiseBuffer = createNoiseBuffer(this.ctx);
      }
      this.preloadSamples(this.ctx);
      if (this.ctx.state === "suspended") void this.ctx.resume().catch(() => undefined);
    } catch {
      // 오디오는 있으면 좋은 것이다. 실패해도 게임은 계속 돈다.
      closeAudioContext(this.releaseContextGraph());
    }
  }

  /** 한 이벤트의 목소리들을 gain 배율을 곱해 울린다. */
  play(
    voices: readonly Voice[],
    gain: number,
    cutoffCapHz: number | null,
    bus: AudioVoiceBus = "voice",
  ): void {
    if (this.ctx === null || this.effectsBus === null || this.silenced) return;
    if (gain <= 0.002) return;

    // 지난 것을 먼저 지운다. 그래야 상한이 "지금 울리는 수" 를 뜻한다.
    const now = this.ctx.currentTime;
    this.endsAt = this.endsAt.filter((t) => t > now);

    for (const voice of voices) {
      if (this.endsAt.length >= MAX_CONCURRENT) return;
      this.playVoice(voice, gain, cutoffCapHz, bus);
    }
  }

  /**
   * 등록된 짧은 샘플을 재생한다. 아직 디코딩 중이면 false이며 호출자가 조용히 건너뛴다.
   *
   * `options.attackMs` 는 타격음처럼 첫 몇 ms 의 크랙이 소리의 전부인 샘플만 줄인다(최소 1ms —
   * 0 이면 파형 중간에서 시작해 클릭음이 난다). 기본 어택(`AUDIO_MIX.sampleAttackSeconds`)은
   * 8ms 라 주먹 타격의 첫 과도음을 깎아 "퍽" 이 "푹" 으로 뭉개진다.
   * `options.rate` 는 재생 속도(=음높이) 배율이다. 같은 타격 샘플이 연타에서 기계처럼 반복되지 않게
   * 호출자가 결정적으로 조금씩 흔든다.
   */
  playSample(key: string, gain: number, delayMs = 0, options: SampleOptions = {}): boolean {
    return this.startSample(key, gain, delayMs, options) !== false;
  }

  /**
   * `playSample` 과 같지만 도중에 끊을 수 있는 손잡이를 준다. 선딜 예고 라이저처럼 사건이 취소되면 소리도
   * 같이 물러나야 하는 샘플에만 쓴다(클릭음이 나지 않게 짧게 페이드아웃한다). 재생하지 못했으면 null.
   */
  playSampleStoppable(key: string, gain: number, delayMs = 0, options: SampleOptions = {}): SampleHandle | null {
    const started = this.startSample(key, gain, delayMs, options);
    return started === false || started === true ? null : started;
  }

  /** false: 재생 불가(잠김·미디코딩) · true: 들을 수 없어 건너뜀 · 손잡이: 실제로 예약됨. */
  private startSample(key: string, gain: number, delayMs: number, options: SampleOptions): SampleHandle | boolean {
    if (this.ctx === null || this.effectsBus === null || this.silenced) return false;
    const buffer = this.sampleBuffers.get(key);
    if (buffer === undefined) return false;
    if (gain <= 0.002) return true;

    const now = this.ctx.currentTime;
    const startAt = now + Math.max(0, delayMs) / 1_000;
    this.endsAt = this.endsAt.filter((t) => t > now);
    if (this.endsAt.length >= MAX_CONCURRENT) return true;

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const rate = options.rate !== undefined && Number.isFinite(options.rate)
      ? Math.max(0.5, Math.min(2, options.rate))
      : 1;
    if (rate !== 1) source.playbackRate.value = rate;
    const offset = Math.max(0, Math.min(buffer.duration * 0.9, (options.offsetMs ?? 0) / 1_000));
    const duration = (buffer.duration - offset) / rate;
    const envelope = this.ctx.createGain();
    const endAt = startAt + duration;
    envelope.gain.setValueAtTime(0.0001, startAt);
    const attackSeconds = options.attackMs === undefined
      ? AUDIO_MIX.sampleAttackSeconds
      : Math.max(0.001, options.attackMs / 1_000);
    const attack = Math.min(attackSeconds, duration * 0.12);
    const release = Math.min(AUDIO_MIX.sampleReleaseSeconds, duration * 0.35);
    envelope.gain.exponentialRampToValueAtTime(gain, startAt + attack);
    envelope.gain.setValueAtTime(gain, Math.max(startAt + attack, endAt - release));
    envelope.gain.exponentialRampToValueAtTime(0.0001, endAt);
    source.connect(envelope);
    envelope.connect(options.bus === "voice" ? this.voiceBus ?? this.effectsBus : this.effectsBus);
    source.onended = () => {
      source.disconnect();
      envelope.disconnect();
    };
    this.endsAt.push(endAt);
    if (offset > 0) source.start(startAt, offset);
    else source.start(startAt);
    const ctx = this.ctx;
    return {
      stop: (fadeMs = 60) => {
        const now = ctx.currentTime;
        const fadeEnd = now + Math.max(0.01, fadeMs / 1_000);
        if (fadeEnd >= endAt) return;
        envelope.gain.cancelScheduledValues(now);
        envelope.gain.setValueAtTime(Math.max(0.0001, envelope.gain.value), now);
        envelope.gain.exponentialRampToValueAtTime(0.0001, fadeEnd);
        try { source.stop(fadeEnd); } catch { /* 이미 멈춘 소스 */ }
      },
    };
  }

  /**
   * 디코딩된 파일을 채널별로 한 번만 루프한다.
   *
   * unlock/load보다 먼저 호출해도 의도를 보존해 두었다가 샘플이 준비되는 순간 시작한다.
   * 같은 채널을 다시 설정하면 노드를 중복 생성하지 않고 음량만 부드럽게 바꾼다.
   * 다른 곡으로 바꾸면 교차한다 — 새 곡이 `loopFadeInSeconds` 동안 올라오는 사이 옛 곡은
   * 같은 길이로 물러난 뒤 멈춘다. 옛 곡을 딱 끊으면 새 곡이 올라올 때까지 빈 구멍이 들린다.
   */
  setLoop(channel: string, key: string, gain: number): void {
    const normalizedGain = clampVolume(gain);
    const current = this.loops.get(channel);
    const armed = this.armedAttack.get(channel);
    this.armedAttack.delete(channel);
    const armedOffset = this.armedOffset.get(channel);
    this.armedOffset.delete(channel);
    if (current?.key === key) {
      const gainChanged = current.gain !== normalizedGain;
      current.gain = normalizedGain;
      // 타이틀 → 캐릭터 선택처럼 같은 곡·같은 믹스를 다시 선언하는 전환은
      // 진행 중인 첫 페이드를 건드리지 않는다. 매번 setTargetAtTime을 걸면
      // 곡 첫 벨 어택이 40ms 만에 전면으로 튀어 UI 확인음처럼 들린다.
      if (gainChanged && current.envelope !== null && this.ctx !== null) {
        current.envelope.gain.setTargetAtTime(
          normalizedGain,
          this.ctx.currentTime,
          AUDIO_MIX.loopGainSmoothingSeconds,
        );
      }
      this.startLoop(channel, current);
      return;
    }

    this.releaseLoop(channel, AUDIO_MIX.loopFadeInSeconds);
    const playback: LoopPlayback = {
      key, gain: normalizedGain, source: null, envelope: null, startedAt: null,
      ...(armed === undefined ? {} : { attackSeconds: armed }),
      ...(armedOffset === undefined ? {} : { offsetSeconds: armedOffset }),
    };
    this.loops.set(channel, playback);
    if (this.ctx !== null) this.requestSample(this.ctx, key);
    this.startLoop(channel, playback);
    // 잠김·디코딩 전이라 나중에 시작하면 첫 입력에 곡이 확인음처럼 튀지 않게 평소 페이드로, 곡 처음부터 연다.
    if (playback.source === null) { delete playback.attackSeconds; delete playback.offsetSeconds; }
  }

  /**
   * 채널의 다음 새 루프(같은 곡을 다시 선언하면 소비만 된다)를 짧은 어택으로 연다. 박자에 맞춘 연출이 곡의
   * 첫 박을 들려야 할 때만 쓴다(첫 타이틀 웹툰 프롤로그). 바로 다음 `setLoop` 에서 소비된다.
   */
  armLoopAttack(channel: string, attackSeconds: number): void {
    if (Number.isFinite(attackSeconds) && attackSeconds > 0) this.armedAttack.set(channel, attackSeconds);
  }

  /**
   * 채널의 다음 새 루프를 파일의 `offsetSeconds` 위치에서 연다(한 번, 바로 다음 `setLoop` 에서 소비). 프롤로그를 중간 박에서
   * 시작하는 부팅이 곡도 같은 박에서 들려준다. `loopPlaybackMs` 는 그 위치부터 센다(파일 기준 재생 위치).
   */
  armLoopStart(channel: string, offsetSeconds: number): void {
    if (Number.isFinite(offsetSeconds) && offsetSeconds > 0) this.armedOffset.set(channel, offsetSeconds);
  }

  /**
   * 채널 루프가 실제로 들린 시간(ms): 소스 시작 뒤 지난 컨텍스트 시간에서 출력 지연을 뺀다(곡 첫 박 직후 잠깐 음수).
   * 컨텍스트가 잠겼거나 멈췄거나 아직 시작 전이면 null. 박자에 맞춘 연출이 이 값을 시계로 쓴다.
   */
  loopPlaybackMs(channel: string): number | null {
    const ctx = this.ctx;
    const playback = this.loops.get(channel);
    if (ctx === null || ctx.state !== "running" || playback === undefined || playback.source === null
      || playback.startedAt === null) return null;
    const latency = (ctx as { outputLatency?: number }).outputLatency ?? ctx.baseLatency ?? 0;
    return (ctx.currentTime - playback.startedAt - (Number.isFinite(latency) ? latency : 0)) * 1_000;
  }

  /**
   * 망치처럼 의미가 큰 한 박자에만 음악·환경층을 잠깐 비운다. 새 루프를 만들거나
   * 음소거하지 않고 현재 설정된 채널별 기준 음량으로 자연스럽게 돌아온다.
   */
  pulseLoopGain(multiplier: number, holdMs: number): void {
    if (this.ctx === null || this.silenced) return;
    const now = this.ctx.currentTime;
    const duck = Math.max(0.08, Math.min(1, multiplier));
    const holdSeconds = Math.max(0, holdMs) / 1_000;
    for (const playback of this.loops.values()) {
      const envelope = playback.envelope;
      if (envelope === null) continue;
      const current = Math.max(FILE_LOOP_SILENCE_GAIN, envelope.gain.value);
      envelope.gain.cancelScheduledValues(now);
      envelope.gain.setValueAtTime(current, now);
      envelope.gain.setTargetAtTime(
        Math.max(FILE_LOOP_SILENCE_GAIN, playback.gain * duck),
        now,
        0.035,
      );
      envelope.gain.setTargetAtTime(
        Math.max(FILE_LOOP_SILENCE_GAIN, playback.gain),
        now + holdSeconds,
        0.18,
      );
    }
  }

  /**
   * 채널 루프를 멈춘다(컷신 진입·잠입 종료). 채널은 즉시 비어 다음 `setLoop` 이 새로
   * 시작할 수 있고, 소리만 `loopStopFadeSeconds` 꼬리로 물러나 파형 중간의 클릭을 막는다.
   */
  stopLoop(channel: string): void {
    this.releaseLoop(channel, AUDIO_MIX.loopStopFadeSeconds);
  }

  /**
   * 채널에서 루프를 떼어 내고 지금 들리는 크기에서 무음까지 내린 뒤 멈춘다.
   *
   * `pulseLoopGain` 은 채널 장부(`loops`)만 돌므로 물러나는 루프를 다시 끌어올리지 않는다.
   * 탭이 숨은 동안에는 마스터가 이미 0 이라 꼬리도 들리지 않고, 예약된 정지는 그대로 온다.
   */
  private releaseLoop(channel: string, releaseSeconds: number): void {
    const playback = this.loops.get(channel);
    if (playback === undefined) return;
    this.loops.delete(channel);
    this.dropUnloopedTrack(playback.key);
    const ctx = this.ctx;
    const { source, envelope } = playback;
    if (ctx === null || source === null || envelope === null || releaseSeconds <= 0) {
      disposeLoop(playback);
      return;
    }
    const now = ctx.currentTime;
    const endAt = now + releaseSeconds;
    try {
      // 진입 페이드나 덕킹 복귀가 예약돼 있으면 걷어 내고, 지금 크기에서 출발한다.
      const current = Math.max(FILE_LOOP_SILENCE_GAIN, envelope.gain.value);
      envelope.gain.cancelScheduledValues(now);
      envelope.gain.setValueAtTime(current, now);
      envelope.gain.exponentialRampToValueAtTime(FILE_LOOP_SILENCE_GAIN, endAt);
      source.onended = () => {
        this.releasingLoops.delete(playback);
        source.disconnect();
        envelope.disconnect();
      };
      source.stop(endAt);
      this.releasingLoops.add(playback);
    } catch {
      // 예약을 거부하는 구현체에서는 예전처럼 즉시 끊는다. 소리 때문에 전환이 멈추면 안 된다.
      this.releasingLoops.delete(playback);
      disposeLoop(playback);
    }
  }

  /** 앱 종료/HMR 때 WebAudio와 예약된 음성 참조를 해제한다. */
  shutdown(): void {
    // 종료는 꼬리를 기다리지 않는다 — 곧 컨텍스트째 닫힌다.
    for (const playback of [...this.loops.values(), ...this.releasingLoops]) disposeLoop(playback);
    this.loops.clear();
    this.releasingLoops.clear();
    const context = this.releaseContextGraph();
    this.sampleBuffers.clear();
    this.sampleLoads.clear();
    this.endsAt = [];
    closeAudioContext(context);
  }

  /** 부분 초기화 실패와 정상 종료가 같은 순서로 그래프 참조를 끊게 한다. */
  private releaseContextGraph(): AudioContext | null {
    const context = this.ctx;
    for (const node of [this.voiceBus, this.effectsBus, this.effectsDynamics, this.ambienceDynamics, this.master]) {
      try {
        node?.disconnect();
      } catch {
        // 일부 브라우저는 연결되기 전 노드의 disconnect를 거부한다.
      }
    }
    this.ctx = null;
    this.master = null;
    this.effectsBus = null;
    this.voiceBus = null;
    this.effectsDynamics = null;
    this.ambienceDynamics = null;
    this.noiseBuffer = null;
    return context;
  }

  /** 첫 입력: 짧은 효과음 전부와, 지금 루프가 부르고 있거나 미리 받으라고 한(`prefetch`) 긴 곡. */
  private preloadSamples(context: AudioContext): void {
    for (const asset of this.sampleAssets) {
      if (!onDemandSample(asset) || this.looped(asset.key) || this.prefetched.has(asset.key)) this.requestSample(context, asset.key);
    }
  }

  /**
   * 긴 곡을 루프가 부르기 전에 받아 디코드해 둔다(타이틀 곡: 박자 연출이 첫 박부터 곡을 시계로 쓴다). 잠겨 있으면 깨어날 때 받는다.
   * 그 곡을 튼 루프가 놓으면 다른 긴 곡처럼 PCM 을 놓는다(`dropUnloopedTrack`).
   */
  prefetch(key: string): void {
    if (!this.sampleAssets.some((asset) => asset.key === key)) return;
    this.prefetched.add(key);
    if (this.ctx !== null) this.requestSample(this.ctx, key);
  }

  /**
   * `prefetch` 한 짧은 클립(대결 목소리)을 놓는다: 다시 부르기 전까지 첫 입력에도 받지 않고, 디코드한 PCM 을 비운다.
   * 울리던 소리는 소스 노드가 버퍼를 쥐고 있어 끝까지 난다.
   */
  release(key: string): void {
    this.dropUnloopedTrack(key);
  }

  /** 이 샘플이 디코드되어 바로 울릴 수 있으면 참. 받는 중이면 그 받기가 끝날 때까지 기다리고, 받지 않는 중이면 거짓. */
  async whenReady(key: string): Promise<boolean> {
    if (this.sampleBuffers.has(key)) return true;
    const load = this.sampleLoads.get(key);
    if (load === undefined) return false;
    await load;
    return this.sampleBuffers.has(key);
  }

  private requestSample(context: AudioContext, key: string): void {
    if (this.sampleBuffers.has(key) || this.sampleLoads.has(key)) return;
    const asset = this.sampleAssets.find((candidate) => candidate.key === key);
    if (asset === undefined) return;
    const load = this.loadSample(context, asset).finally(() => this.sampleLoads.delete(key));
    this.sampleLoads.set(key, load);
  }

  /** 어느 채널의 루프가 이 곡을 틀고 있다(또는 틀려고 기다린다). */
  private looped(key: string): boolean {
    for (const playback of this.loops.values()) if (playback.key === key) return true;
    return false;
  }

  /**
   * 아무 루프도 틀지 않는 긴 곡의 PCM 을 놓는다. 물러나는 꼬리는 소스 노드가 버퍼를 쥐고 있어 끝까지 울리고, 그 뒤에 비워진다.
   * 다시 부르면 새로 받는다(파일은 브라우저 캐시에 있다).
   */
  private dropUnloopedTrack(key: string): void {
    this.prefetched.delete(key);
    const asset = this.sampleAssets.find((candidate) => candidate.key === key);
    if (asset !== undefined && onDemandSample(asset) && !this.looped(key)) this.sampleBuffers.delete(key);
  }

  private async loadSample(context: AudioContext, asset: AudioAssetDefinition): Promise<void> {
    try {
      const response = await fetch(versionedAudioUrl(asset, document.baseURI));
      if (!response.ok) return;
      const bytes = await response.arrayBuffer();
      const buffer = await context.decodeAudioData(isScrambledAudioPath(asset.path) ? unscrambleAudio(bytes) : bytes);
      // 받는 사이 그 곡을 부르던 루프가 떠났으면 긴 곡은 쥐지 않는다.
      if (this.ctx === context && (!onDemandSample(asset) || this.looped(asset.key) || this.prefetched.has(asset.key))) {
        this.sampleBuffers.set(asset.key, buffer);
        for (const [channel, playback] of this.loops) this.startLoop(channel, playback);
      }
    } catch {
      // 네트워크·디코딩 실패 시 voices.ts의 합성 획득음으로 계속 플레이한다.
    }
  }

  private startLoop(channel: string, playback: LoopPlayback): void {
    const ctx = this.ctx;
    const master = this.master;
    const buffer = this.sampleBuffers.get(playback.key);
    if (ctx === null || master === null || buffer === undefined || playback.source !== null) return;
    if (this.loops.get(channel) !== playback) return;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const envelope = ctx.createGain();
    const now = ctx.currentTime;
    envelope.gain.setValueAtTime(FILE_LOOP_SILENCE_GAIN, now);
    envelope.gain.exponentialRampToValueAtTime(
      Math.max(FILE_LOOP_SILENCE_GAIN, playback.gain),
      now + (playback.attackSeconds ?? AUDIO_MIX.loopFadeInSeconds),
    );
    source.connect(envelope);
    envelope.connect(channel === "ambience" ? this.ambienceDynamics ?? master : master);
    playback.source = source;
    playback.envelope = envelope;
    const offset = playback.offsetSeconds !== undefined && buffer.duration > 0 ? playback.offsetSeconds % buffer.duration : 0;
    // 파일 위치 기준 시계: 중간에서 시작했으면 그만큼 앞에서 시작한 것으로 센다.
    playback.startedAt = now - offset;
    if (offset > 0) source.start(now, offset);
    else source.start();
  }

  private playVoice(
    voice: Voice,
    gain: number,
    cutoffCapHz: number | null,
    bus: AudioVoiceBus,
  ): void {
    const ctx = this.ctx;
    const destination = bus === "voice" ? this.voiceBus ?? this.effectsBus : this.effectsBus;
    if (ctx === null || destination === null) return;

    const startAt = ctx.currentTime + (voice.delayMs ?? 0) / 1000;
    const durSec = voice.durMs / 1000;
    const peak = voice.gain * gain;
    if (peak <= 0.002) return;

    const envelope = ctx.createGain();
    // 환경층은 앞뒤를 충분히 겹쳐 유지하고, 사건음은 기존의 짧은 감쇠 실루엣을 쓴다.
    const attack = Math.min((voice.fadeInMs ?? 12) / 1_000, durSec * 0.45);
    envelope.gain.setValueAtTime(0.0001, startAt);
    envelope.gain.exponentialRampToValueAtTime(peak, startAt + attack);
    if (voice.fadeInMs !== undefined || voice.fadeOutMs !== undefined) {
      const release = Math.min((voice.fadeOutMs ?? voice.fadeInMs ?? 12) / 1_000, durSec - attack);
      envelope.gain.setValueAtTime(peak, Math.max(startAt + attack, startAt + durSec - release));
    }
    envelope.gain.exponentialRampToValueAtTime(0.0001, startAt + durSec);
    envelope.connect(destination);

    const source =
      voice.kind === "tone"
        ? this.createTone(voice, startAt, cutoffCapHz)
        : this.createNoise(voice, startAt, cutoffCapHz);
    if (source === null) return;

    source.node.connect(envelope);
    const endAt = startAt + durSec + 0.02;
    this.endsAt.push(endAt);
    source.stop.onended = () => envelope.disconnect();
    source.stop.start(startAt);
    source.stop.stop(endAt);
  }

  private createTone(
    voice: Extract<Voice, { kind: "tone" }>,
    startAt: number,
    cutoffCapHz: number | null,
  ): { node: AudioNode; stop: OscillatorNode } | null {
    const ctx = this.ctx;
    if (ctx === null) return null;

    const osc = ctx.createOscillator();
    osc.type = voice.wave;
    osc.frequency.setValueAtTime(voice.freq, startAt);
    if (voice.freqTo !== undefined) {
      // 0 으로 미끄러지면 exponential 이 터지므로 하한을 둔다.
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, voice.freqTo), startAt + voice.durMs / 1000);
    }
    if (cutoffCapHz === null) return { node: osc, stop: osc };

    // 층간 감쇠는 음량만 줄이는 것이 아니라 고역도 막는다. 휘파람처럼 tone으로
    // 합성한 소리도 바닥을 통과하면 먹먹해야 위층/아래층에서 난 소리로 읽힌다.
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(cutoffCapHz, startAt);
    osc.connect(filter);
    return { node: filter, stop: osc };
  }

  private createNoise(
    voice: Extract<Voice, { kind: "noise" }>,
    startAt: number,
    cutoffCapHz: number | null,
  ): { node: AudioNode; stop: AudioBufferSourceNode } | null {
    const ctx = this.ctx;
    if (ctx === null || this.noiseBuffer === null) return null;

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    const cap = (hz: number): number => (cutoffCapHz === null ? hz : Math.min(hz, cutoffCapHz));
    filter.frequency.setValueAtTime(cap(voice.cutoffHz), startAt);
    if (voice.cutoffToHz !== undefined) {
      filter.frequency.exponentialRampToValueAtTime(
        Math.max(60, cap(voice.cutoffToHz)),
        startAt + voice.durMs / 1000,
      );
    }
    src.connect(filter);
    return { node: filter, stop: src };
  }
}

function createDynamics(
  ctx: AudioContext,
  profile: AudioDynamicsProfile,
): DynamicsCompressorNode {
  const node = ctx.createDynamicsCompressor();
  node.threshold.value = profile.thresholdDb;
  node.knee.value = profile.kneeDb;
  node.ratio.value = profile.ratio;
  node.attack.value = profile.attackSeconds;
  node.release.value = profile.releaseSeconds;
  return node;
}

function dynamicsDebugState(node: DynamicsCompressorNode | null): {
  readonly thresholdDb: number;
  readonly kneeDb: number;
  readonly ratio: number;
  readonly attackSeconds: number;
  readonly releaseSeconds: number;
} | null {
  if (node === null) return null;
  return Object.freeze({
    thresholdDb: node.threshold.value,
    kneeDb: node.knee.value,
    ratio: node.ratio.value,
    attackSeconds: node.attack.value,
    releaseSeconds: node.release.value,
  });
}

/** 루프 하나를 즉시 끊고 노드 연결을 푼다. */
function disposeLoop(playback: LoopPlayback): void {
  try {
    playback.source?.stop();
  } catch {
    // 이미 끝난 source를 다시 정리해도 앱 종료는 계속되어야 한다.
  }
  playback.source?.disconnect();
  playback.envelope?.disconnect();
}

function closeAudioContext(context: AudioContext | null): void {
  if (context === null || context.state === "closed") return;
  try {
    void context.close().catch(() => undefined);
  } catch {
    // 부분 초기화된 구현체가 close까지 거부해도 게임 종료는 계속되어야 한다.
  }
}

/**
 * 해시 없는 런타임 미디어 경로는 CDN·브라우저에서 오래 캐시될 수 있다.
 * 등록부의 내용 해시를 URL 버전으로 써서 파일이 바뀐 배포는 즉시 새 바이트를 받는다.
 */
export function versionedAudioUrl(asset: AudioAssetDefinition, baseUri: string): URL {
  const url = new URL(asset.path, baseUri);
  url.searchParams.set("v", asset.sha256);
  return url;
}

/** 1초짜리 화이트 노이즈. 매번 만들면 GC 가 튄다. */
function createNoiseBuffer(ctx: AudioContext): AudioBuffer {
  const frames = ctx.sampleRate;
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i += 1) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

/**
 * 루프가 부를 때만 받는 긴 곡(`ON_DEMAND_SAMPLE_MS`)과, 대결이 `prefetch` 할 때만 받는 목소리 클립(`FIGHT_VOICE_DIR`, 2026-10-21 —
 * 아홉 명의 클립 약 150개를 첫 입력에 모두 풀면 그 대결에 서지 않는 사람의 목소리까지 메모리에 남는다).
 */
function onDemandSample(asset: AudioAssetDefinition): boolean {
  return asset.durationMs >= ON_DEMAND_SAMPLE_MS || asset.path.startsWith(FIGHT_VOICE_DIR);
}

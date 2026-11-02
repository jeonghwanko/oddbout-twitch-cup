/**
 * 시뮬레이션 값 타입 전용 모듈.
 *
 * 이 파일을 포함한 src/sim/** 은 Phaser·DOM·Date.now()·Math.random()·localStorage 를
 * 절대 참조하지 않는다. 시간은 dtMs 인자로, 난수는 rng.ts 의 시드 PRNG 로만 들어온다.
 * 이 경계는 test/architecture.test.ts 가 강제한다.
 */

import type { RunPhase } from "./RunRules";
import type { AttackMoveId, AttackTier } from "./AttackMoves";
import type { CombatWeaponId } from "./CombatDamage";
import type { ToolId } from "./ToolRules";
import type { WeaponModId } from "./WeaponModRules";
import type { TacticId } from "./TacticRules";
import type { ShowtimeBeat } from "./ShowtimeRules";
import type { DisguiseBreakReason } from "./DisguiseRules";
import type { AuctionBidderId, AuctionReactionCue } from "./AuctionModel";

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

/** 좌상단 기준 사각형. 월드 좌표는 X 우측 증가, Y 하방 증가. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** 중심점과 반경으로 정의한 원. 연막의 판정과 화면이 함께 소비한다. */
export interface Circle {
  readonly at: Vec2;
  readonly radius: number;
}

export type Facing = -1 | 1;

/** 탈출구 ID와 별개인 캐릭터 연출 종류. 튜토리얼·샌드박스도 같은 세 동작을 공유한다. */
export type EscapeKind = "door" | "window" | "chimney";

/** 플레이어 자세. 노출도 계산의 pose 계수와 대응한다. */
export type Pose = "stand" | "crouch" | "climb" | "hang" | "hide" | "vent";

/** 이동 상태. 노출도 계산의 motion 계수와 대응한다. */
export type Motion = "still" | "walk" | "run";

/** 경비 의심 티어. 값 순서가 곧 심각도 순서다. */
export const SUSPICION_TIERS = ["calm", "curious", "alert", "spotted"] as const;
export type SuspicionTier = (typeof SUSPICION_TIERS)[number];

/** 한 프레임 분량의 플레이어 입력. 리플레이 기록 단위이기도 하다. */
export interface InputFrame {
  readonly moveX: -1 | 0 | 1;
  readonly moveY: -1 | 0 | 1;
  readonly run: boolean;
  readonly crouch: boolean;
  /** 웅크리기 키를 새로 누른 프레임. 구르기는 홀드가 아니라 이 의도로 한 번만 시작한다. */
  readonly crouchPressed: boolean;
  readonly jump: boolean;
  /** 가변 점프 높이를 위해 점프 키를 계속 누르는지 별도로 보존한다. */
  readonly jumpHeld: boolean;
  readonly interact: boolean;
  /** E 홀드 행동은 근처에서 새로 누른 경우에만 대상을 잡는다. */
  readonly interactPressed: boolean;
  readonly hide: boolean;
  readonly whistle: boolean;
  /** 홀드다. 누르고 있는 동안 세기가 차고, 놓는 순간 날아간다. */
  readonly throw: boolean;
  readonly throwPressed: boolean;
  /** 장착한 첫 번째·두 번째 도구를 직접 고르는 엣지 입력. */
  readonly toolSlot1: boolean;
  readonly toolSlot2: boolean;
  /** 등 끄기는 홀드다. 탭 한 번에 꺼지면 '지금 어둠을 산다'는 판단이 사라진다. */
  readonly snuffHold: boolean;
  readonly snuffPressed: boolean;
  readonly drop: boolean;
  readonly thiefEye: boolean;
  readonly thiefEyePressed: boolean;
  readonly attack: boolean;
  readonly heavy: boolean;
}

/**
 * 첫 스텝 이후에 쓸 입력. 엣지성 입력만 꺼서 중복 발동을 막는다.
 *
 * 고정 스텝 누산기는 한 렌더 프레임에 sim 을 여러 번 돌릴 수 있는데,
 * 같은 InputFrame 을 그대로 재사용하면 이 값들이 스텝 수만큼 발동한다.
 * 점프 한 번에 두 번 뛰는 식이다.
 *
 * 투척의 발사는 여전히 홀드 해제 전이로 결정되고, throwPressed는 거절 피드백에만 쓴다.
 */
export function consumeEdges(input: InputFrame): InputFrame {
  return {
    ...input,
    crouchPressed: false,
    jump: false,
    interactPressed: false,
    hide: false,
    whistle: false,
    throwPressed: false,
    toolSlot1: false,
    toolSlot2: false,
    snuffPressed: false,
    drop: false,
    thiefEyePressed: false,
    attack: false,
    heavy: false,
  };
}

export const EMPTY_INPUT: InputFrame = Object.freeze({
  moveX: 0,
  moveY: 0,
  run: false,
  crouch: false,
  crouchPressed: false,
  jump: false,
  jumpHeld: false,
  interact: false,
  interactPressed: false,
  hide: false,
  whistle: false,
  throw: false,
  throwPressed: false,
  toolSlot1: false,
  toolSlot2: false,
  snuffHold: false,
  snuffPressed: false,
  drop: false,
  thiefEye: false,
  thiefEyePressed: false,
  attack: false,
  heavy: false,
});

/**
 * sim 이 렌더·오디오에 통보하는 이벤트. append-only.
 * 연출 추가는 sim 수정이 아니라 구독자 추가로 끝나야 한다.
 */
export type SimEvent =
  | { readonly kind: "GrappleAttached"; readonly anchorId: string; readonly at: Vec2 }
  /** 사슬 비행이 끝나 몸이 고리에 걸린 틱. 쏘기(`GrappleAttached`)와 박자를 나눠야 잡는 손맛을 따로 연출한다. */
  | { readonly kind: "GrappleCaught"; readonly anchorId: string; readonly at: Vec2; readonly transfer: boolean; readonly facing: Facing }
  /** 매달림을 입력으로 놓은 틱. boost = 보는 쪽으로 차고 나감, hop = 뒤로 흔들릴 때 놓음, drop = ↓. `at` 은 놓은 발 위치다. */
  | { readonly kind: "GrappleReleased"; readonly anchorId: string; readonly at: Vec2; readonly release: "boost" | "hop" | "drop"; readonly facing: Facing }
  | { readonly kind: "NoiseEmitted"; readonly at: Vec2; readonly floor: number; readonly radius: number; readonly source: NoiseSource; readonly lure?: boolean }
  /** 경매 규칙의 확정 박자. 화면·카메라·효과음이 같은 프레임을 소비한다. */
  | {
      readonly kind: "AuctionCue";
      readonly cue: AuctionReactionCue;
      readonly at: Vec2;
      readonly bidderId?: AuctionBidderId;
      readonly price?: number;
      readonly forged?: boolean;
      readonly priceDelta?: number;
    }
  // 개인 유물의 봉인을 푼 순간 저택 전체에 전달되는 무음 경보다. 일반 소음 반경과 섞지 않는다.
  | { readonly kind: "PersonalArtifactAlarmTriggered"; readonly at: Vec2 }
  // 개인 유물 회수로 기존 입구가 닫힌 순간. 추천 퇴로와 월드 셔터는 같은 exitId를 쓴다.
  | { readonly kind: "ArtifactRouteSealed"; readonly exitId: string; readonly at: Vec2 }
  | { readonly kind: "GrandEscapeStarted"; readonly at: Vec2 }
  | {
      readonly kind: "GrandEscapeBeatChanged";
      readonly beat: "exposure" | "cascade" | "last-curtain";
      readonly beatIndex: 1 | 2 | 3;
      readonly at: Vec2;
      /** 현재 봉쇄·적재를 반영해 디렉터가 고른 실제 남은 출구. */
      readonly targetExitId?: string;
      /** 2막에서 다시 쓰는, 플레이어가 회수 전에 완주한 연쇄. */
      readonly preparedChainId?: string;
    }
  | { readonly kind: "EscapeFinaleStarted"; readonly escapeKind: EscapeKind; readonly facing: Facing; readonly at: Vec2 }
  // 투척물이 손을 떠난 순간. 착탄 소음과 분리해야 릴리스 동작과 비행 시작을 연출할 수 있다.
  | {
      readonly kind: "ProjectileThrown";
      readonly projectileId: number;
      readonly at: Vec2;
      readonly facing: Facing;
      readonly power: number;
      readonly tool?: ToolId;
    }
  | { readonly kind: "ToolSelected"; readonly tool: ToolId; readonly at: Vec2 }
  | { readonly kind: "SmokeDeployed"; readonly smokeId: number; readonly at: Vec2; readonly radius: number }
  | { readonly kind: "SmokeCleared"; readonly smokeId: number; readonly at: Vec2 }
  | { readonly kind: "ClockworkMouseReleased"; readonly mouseId: number; readonly at: Vec2; readonly facing: Facing }
  | { readonly kind: "ClockworkMouseChirped"; readonly mouseId: number; readonly at: Vec2 }
  | { readonly kind: "ClockworkMouseStopped"; readonly mouseId: number; readonly at: Vec2 }
  | { readonly kind: "SilkWireVaulted"; readonly from: Vec2; readonly at: Vec2; readonly facing: Facing }
  | { readonly kind: "DisguiseActivated"; readonly at: Vec2; readonly durationMs: number }
  | { readonly kind: "DisguiseBroken"; readonly at: Vec2; readonly reason: DisguiseBreakReason }
  | { readonly kind: "DisguiseExpired"; readonly at: Vec2 }
  | { readonly kind: "RibbonSnarePlaced"; readonly snareId: number; readonly at: Vec2; readonly radius: number }
  | { readonly kind: "RibbonSnareTriggered"; readonly snareId: number; readonly guardId: string; readonly at: Vec2 }
  /**
   * 괴도 무기 개조가 이번 스텝에 실제로 새 쓰임을 냈다(`WeaponModRules`). 판정은 각 규칙이 이미
   * 적용했고, 이 사건은 금색 개조 표식·효과음과 경보 올가미의 괴도의 눈 핑이 소비한다.
   */
  | {
      readonly kind: "WeaponModTriggered";
      readonly mod: WeaponModId;
      readonly at: Vec2;
      readonly guardId?: string;
      readonly propId?: string;

      readonly facing?: Facing;
      /** 당기기: 경비가 끌려오기 전 자리. 끌려온 길의 잔상(표현)만 읽는다. */
      readonly from?: Vec2;
    }
  | { readonly kind: "RibbonSnareExpired"; readonly snareId: number; readonly at: Vec2 }
  | { readonly kind: "MansionWeaknessExploited"; readonly tactic: TacticId; readonly at: Vec2 }
  | { readonly kind: "ShowtimeBeatAdded"; readonly beat: ShowtimeBeat; readonly count: number; readonly at: Vec2 }
  | { readonly kind: "ShowtimeMasterpiece"; readonly beats: readonly ShowtimeBeat[]; readonly at: Vec2 }
  // 홀드 상호작용은 진행 상태와 완료 순간을 분리한다. 완료 이벤트가 오브젝트 반응의 기준 프레임이다.
  | { readonly kind: "LootCollected"; readonly anchorId: string; readonly at: Vec2 }
  | { readonly kind: "LootDropped"; readonly anchorId: string; readonly at: Vec2 }
  | { readonly kind: "LampSnuffed"; readonly lampId: string; readonly at: Vec2 }
  | { readonly kind: "ChandelierDropped"; readonly hazardId: string; readonly from: Vec2; readonly at: Vec2 }
  | {
      readonly kind: "CaperDeviceTriggered";
      readonly chainId: string;
      readonly deviceId: string;
      readonly deviceKind: "cart" | "armor" | "wine-rack" | "chandelier";
      readonly chainIndex: number;
      readonly from: Vec2;
      readonly at: Vec2;
    }
  | { readonly kind: "CaperChainCompleted"; readonly chainId: string; readonly length: number; readonly at: Vec2 }
  | { readonly kind: "CaperChainPrepared"; readonly chainId: string; readonly at: Vec2 }
  | { readonly kind: "CaperChainReactivated"; readonly chainId: string; readonly at: Vec2 }
  | { readonly kind: "PlayerHid"; readonly hideSpotId: string; readonly at: Vec2 }
  | { readonly kind: "PlayerRevealed"; readonly hideSpotId: string; readonly at: Vec2 }
  | {
      readonly kind: "PlayerEscaped";
      readonly escapeId: string;
      readonly escapeKind: EscapeKind;
      readonly facing: Facing;
      readonly at: Vec2;
    }
  | { readonly kind: "RunPhaseChanged"; readonly from: RunPhase; readonly to: RunPhase }
  | { readonly kind: "PlayerEnteredVent"; readonly linkId: string; readonly at: Vec2; readonly facing: Facing }
  | { readonly kind: "PlayerExitedVent"; readonly linkId: string; readonly at: Vec2; readonly facing: Facing }
  | { readonly kind: "SuspicionTierChanged"; readonly guardId: string; readonly from: SuspicionTier; readonly to: SuspicionTier }
  /** 접촉 유지가 끝나 실제 발버둥 상태로 들어간 순간. 발각과 포박을 연출에서 섞지 않는다. */
  | { readonly kind: "PlayerGrabbed"; readonly guardId: string; readonly at: Vec2; readonly escapeCharges: number }
  /** 좌우 교대 입력이 한 번 성립한 순간. 포박 진행도와 효과음이 같은 박자를 쓴다. */
  | { readonly kind: "StruggleBeat"; readonly guardId: string; readonly at: Vec2; readonly presses: number; readonly direction: -1 | 1 }
  | { readonly kind: "PlayerBrokeFree"; readonly guardId: string; readonly at: Vec2; readonly remainingCharges: number }
  | { readonly kind: "PlayerBusted"; readonly guardId: string; readonly at: Vec2 }
  | { readonly kind: "PlayerDamaged"; readonly guardId: string; readonly at: Vec2; readonly damage: number; readonly hp: number; readonly maxHp: number }
  | {
      readonly kind: "PlayerLanded";
      readonly at: Vec2;
      readonly fallTiles: number;
      readonly rolled: boolean;
      readonly impact: "soft" | "hard" | "roll";
      readonly facing: Facing;
    }
  | { readonly kind: "PlayerJumped"; readonly at: Vec2 }
  | { readonly kind: "PlayerExhausted"; readonly at: Vec2 }
  | { readonly kind: "PlayerDodged"; readonly at: Vec2; readonly facing: Facing }
  | { readonly kind: "PerfectDodge"; readonly guardId: string; readonly at: Vec2 }
  | {
      readonly kind: "GuardAttackTelegraphed";
      readonly guardId: string;
      readonly attackKind: "melee" | "ranged";
      readonly at: Vec2;
      readonly facing: Facing;
    }
  /** 근접 공격의 안전 회피 입력 구간이 열린 한 프레임. */
  | { readonly kind: "GuardAttackImminent"; readonly guardId: string; readonly at: Vec2; readonly facing: Facing }
  | { readonly kind: "GuardAttackTurnClaimed"; readonly guardId: string; readonly at: Vec2 }
  | { readonly kind: "GuardRecoveryOpened"; readonly guardId: string; readonly at: Vec2 }
  /** 돌진하던 적이 막힌 곳에 몸째 부딪혀 멈췄다. `facing`은 돌진 방향(벽 쪽), `at`은 멈춘 발 위치. */
  | { readonly kind: "GuardChargeCrashed"; readonly guardId: string; readonly at: Vec2; readonly facing: Facing }

  | { readonly kind: "KeeperPhaseShifted"; readonly guardId: string; readonly at: Vec2; readonly facing: Facing }

  | {
      readonly kind: "KeeperRoarShockwave";
      readonly guardId: string;
      readonly at: Vec2;
      readonly radiusPx: number;
      readonly pushedPx?: number;
      readonly pushFacing?: Facing;
    }
  /** 마지막 한 칸에서 평타를 맞아 쥔 열쇠가 풀렸다(무방비). 이 창 안의 타격은 무엇이든 결정타다. */
  | {
      readonly kind: "KeeperExposed";
      readonly guardId: string;
      readonly at: Vec2;
      readonly facing: Facing;
      readonly windowMs: number;

      readonly pushedPx?: number;
      readonly pushFacing?: Facing;
    }

  | {
      readonly kind: "KeeperKeyStolen";
      readonly guardId: string;
      readonly at: Vec2;
      readonly keyAt: Vec2;
      readonly facing: Facing;
      readonly towardPlayer: Facing;
    }

  | { readonly kind: "KeeperKeyCaught"; readonly guardId: string; readonly at: Vec2; readonly facing: Facing }
  | { readonly kind: "KeeperServantDoorOpened"; readonly at: Vec2 }
  | { readonly kind: "KeeperServantLeft"; readonly at: Vec2 }
  | { readonly kind: "AttackQueued"; readonly at: Vec2; readonly facing: Facing; readonly combo: 1 | 2 | 3 }
  /**
   * 공격 무브가 커밋된 입력 틱. 판정(`PlayerAttacked`)은 `contactMs` 뒤다 — 소리·예비동작 연출이
   * 접촉보다 앞서 들리도록 표현층이 이 간격을 안다.
   */
  | {
      readonly kind: "PlayerAttackStarted";
      readonly at: Vec2;
      readonly facing: Facing;
      readonly moveId: AttackMoveId;
      readonly tier: AttackTier;
      readonly contactMs: number;
    }
  | {
      readonly kind: "PlayerAttacked";
      readonly at: Vec2;
      readonly facing: Facing;
      /** 사슬 밖 무브(강공격·대시)는 표현층 계약 때문에 1로 보고한다. 실제 무브는 moveId. */
      readonly combo: 1 | 2 | 3;
      readonly tier?: AttackTier;
      readonly moveId?: AttackMoveId;
    }
  | {
      readonly kind: "ComboConfirmed";
      readonly guardId: string;
      readonly at: Vec2;
      readonly facing: Facing;
      readonly combo: 1 | 2;
    }
  | {
      readonly kind: "ComboDropped";
      readonly at: Vec2;
      readonly facing: Facing;
      readonly combo: 1 | 2;
      readonly reason: "miss" | "blocked" | "invalid-target" | "interrupted";
    }
  | { readonly kind: "PerfectCounter"; readonly guardId: string; readonly at: Vec2; readonly weaponId?: CombatWeaponId; readonly contactAt?: Vec2 }
  | {
      readonly kind: "ComboFinisherLaunched";
      readonly guardId: string;
      readonly from: Vec2;
      readonly at: Vec2;
      readonly facing: Facing;
      readonly weaponId?: CombatWeaponId;
      readonly contactAt?: Vec2;
    }
  | { readonly kind: "PhysicsPropImpact"; readonly propId: string; readonly at: Vec2; readonly strength: number }
  | { readonly kind: "PlayerShoved"; readonly at: Vec2; readonly facing: Facing }
  /** 대시 공격이 접촉 뒤 플레이어를 순간 전진시켰다. 렌더는 넉백과 같은 따라잡기로 잇는다. */
  | { readonly kind: "PlayerLunged"; readonly at: Vec2; readonly facing: Facing; readonly distancePx: number }
  | { readonly kind: "GuardShoved"; readonly guardId: string; readonly from: Vec2; readonly at: Vec2; readonly tier?: AttackTier; readonly facing?: Facing }
  | {
      readonly kind: "GuardChainShoved";
      readonly sourceGuardId: string;
      readonly guardIds: readonly string[];
      readonly at: Vec2;
      readonly impacts: readonly Vec2[];
      readonly facing: Facing;
    }
  | { readonly kind: "GuardWallSlammed"; readonly guardId: string; readonly at: Vec2; readonly facing: Facing; readonly tier?: AttackTier }
  | {
      readonly kind: "CombatHit";
      readonly guardId: string;
      readonly at: Vec2;
      readonly punish: boolean;
      /** 공격 무게. 없으면 렌더는 light 로 읽는다 (sim 이 채우기 전 호환). */
      readonly tier?: AttackTier;
      readonly facing?: Facing;
      readonly knockbackPx?: number;
      readonly wallHit?: boolean;
      readonly weaponId?: CombatWeaponId;
      readonly contactAt?: Vec2;
      readonly damage?: number;
      /** 경직 저항이 경직을 먹었다 — 피해·넉백은 들어갔지만 phase 는 안 끊겼다. */
      readonly absorbed?: boolean;
      /**
       * 괴도 무기 개조가 연 빈틈을 이 타격이 닫았다("도구로 열고, 주먹으로 닫는다"). 완벽 반격은 제 연출이 있어
       * 싣지 않는다. 표현(보상 화음·금빛 닫힘)만 읽는다.
       */
      readonly toolOpening?: boolean;
      /**
       * 이 타격이 한 개조의 결과다(반격 단도의 박힘). 던지는 순간은 손끝 박자만 주고 멈춤·카메라의 절정은 이
       * 타격이 받는다(`WeaponModFeel.payoff`). 표현만 읽는다.
       */
      readonly viaMod?: WeaponModId;
    }
  | {
      readonly kind: "CombatBlocked";
      readonly guardId: string;
      readonly at: Vec2;
      /**
       * 무적 프로필(`CombatProfile.invulnerable` — 금고지기 2막 포효)이 막았다. 연출은 일반 막기("챙!")가 아니라
       * 열기 막에 튕겨 나가는 한 박을 쓴다. 판정은 같다(피해·경직·밀림 없음).
       */
      readonly invulnerable?: boolean;
    }
  // 근접 공격이 일반 경비를 스쳤다. 단도의 비살상 경직은 DaggerDazed가 소유한다.
  | { readonly kind: "GuardGrazed"; readonly guardId: string; readonly at: Vec2 }
  // 단도가 판금 갑옷 정면 이외의 경비에게 맞아 비살상 경직을 일으켰다.
  | { readonly kind: "DaggerDazed"; readonly guardId: string; readonly at: Vec2; readonly durationMs: number }
  | {
      readonly kind: "GuardSubdued";
      readonly guardId: string;
      readonly at: Vec2;
      /** 등 뒤 E 홀드인지 샹들리에 같은 환경 공격인지 구분한다. */
      readonly method: "hold" | "environment";
    }
  | { readonly kind: "GuardAwoke"; readonly guardId: string; readonly at: Vec2 }
  | { readonly kind: "BodyDragStarted"; readonly guardId: string; readonly at: Vec2 }
  | { readonly kind: "BodyDragReleased"; readonly guardId: string; readonly at: Vec2 }
  /** 지상 사람 경비와 처음 몸이 닿아 관통 대신 접촉 경계에서 멈춘 순간. */
  | { readonly kind: "GuardBodyContact"; readonly guardId: string; readonly at: Vec2; readonly facing: Facing }
  | { readonly kind: "CrowdBumped"; readonly crowdId: string; readonly crowdKind: "guest" | "drunk"; readonly at: Vec2 }
  | {
      readonly kind: "GuardPickpocketed";
      readonly guardId: string;
      readonly intelId: IntelId;
      readonly at: Vec2;
    }
  // 쓰러진 동료를 발견했다. 이 순간부터 저택이 조용해지지 않는다.
  | { readonly kind: "BodyFound"; readonly guardId: string; readonly at: Vec2 }
  | { readonly kind: "CombatDefeated"; readonly guardId: string; readonly at: Vec2; readonly weaponId?: CombatWeaponId; readonly contactAt?: Vec2 }
  /**
   * 적의 공격이 플레이어에게 닿았다. `tier`·`facing`이 없으면 곤봉 한 대(강공 무게)로 읽는다.
   * 보스처럼 공격마다 무게가 다른 적만 채운다(휩쓸기 heavy, 돌진 dash).
   */
  | {
      readonly kind: "PlayerStruck";
      readonly guardId: string;
      readonly at: Vec2;
      readonly tier?: AttackTier;
      readonly facing?: Facing;
      /**
       * 이 명중으로 플레이어가 실제로 밀린 가로 거리(월드 px, 부호 없음). 벽에 막히면 줄어든다.
       * 렌더는 이 거리만큼 몸을 맞은 자리에 붙들었다가 히트스톱 뒤 미끄러뜨린다.
       */
      readonly knockbackPx?: number;
      /** 이 명중의 피해. 비어 있으면 때린 무기의 기본 피해다(2막 금고지기 돌진만 2를 싣는다). */
      readonly damage?: number;
    }
  | {
      readonly kind: "CrossbowFired";
      readonly guardId: string;
      readonly from: Vec2;
      readonly to: Vec2;
      readonly blocked: boolean;
    }
  | {
      readonly kind: "ActionRejected";
      readonly action: RejectedAction;
      readonly reason: ActionRejectReason;
      readonly at: Vec2;
      readonly targetId?: string;
      readonly current?: number;
      readonly required?: number;
    };

/** 플레이어가 의도한 행동을 규칙이 거절한 이유. 화면·소리가 같은 사건을 소비한다. */
export type RejectedAction = "interact" | "steal" | "escape" | "vent" | "hide" | "whistle" | "throw" | "snuff" | "environment" | "drop" | "thief-eye" | "attack" | "heavy";
export type ActionRejectReason =
  | "keeper-key"
  | "start-pulley"
  | "wait-display"
  | "release-catch"
  | "skill"
  | "capacity"
  | "load-limit"
  | "closed"
  | "objective"
  | "locked"
  | "cooldown"
  | "no-ammo"
  | "hidden"
  | "empty"
  | "no-target"
  | "already-done"
  | "depleted";

/**
 * 소매치기로 얻는 정보의 판정 ID. 어느 아키타입이 무엇을 들고 다니는지는
 * GuardArchetypes 표가, 화면 이름은 app/ActionLabels 의 INTEL_LABELS 가 소유한다.
 */
export type IntelId = "patrol-schedule" | "area-key" | "vault-code";

export type NoiseSource =
  | "footstep"
  | "landing"
  | "whistle"
  | "throw"
  | "panting"
  | "lootDropped"
  | "crowd"
  | "combat"
  | "prop"
  | "mouse"
  | "disguise";

/** 시드 PRNG 상태. 순수 함수로만 전진시킨다. */
export interface RngState {
  readonly seed: number;
}

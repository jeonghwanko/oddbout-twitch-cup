import { createCityFightFighterBout, type CityFightBoutSession } from "../sim/cityFight/bout/CityFightFighterBout";
import { ArenaBoutLog, runLoggedBout } from "../sim/tournament/ArenaBoutLog";
import { arenaCupBoutKey, arenaCupBoutSeed, arenaCupMatch, arenaCupNextMatch, arenaCupUnlogged, type ArenaCupState } from "../sim/tournament/ArenaCupRules";
import { cityTournamentRegisteredId, type CityTournamentMatch } from "../sim/tournament/CityTournamentRules";
import { currentArenaCup, noteCurrentArenaCupBout, recordArenaCupResult, stepArenaCup, type ArenaCupProgress } from "./ArenaCupProgress";
import { cityTournamentBoutResolver, cityTournamentBoutSetup, type CityTournamentArt, type CityTournamentRegistered } from "./CityTournamentBouts";

/**
 * The cup's registered fighters as its bouts fight them (내 선수 출전, 2026-10-27): his package only while it is the one the cup started with
 * (`ArenaCupState.registered`) — after his owner changed him the cup's bouts of his wait (`arenaCupRegisteredStale` says so).
 */
export function arenaCupRegistered(cup: Pick<ArenaCupState, "registered">, registered: CityTournamentRegistered): CityTournamentRegistered {
  return id => {
    const fighter = registered(id), pinned = cup.registered?.[id];
    return fighter && pinned !== undefined && fighter.manifestSha256 === pinned ? fighter : null;
  };
}

/** A registered entrant of `cup` came in with another package than the cup's (his owner changed him): his bouts cannot be fought. */
export function arenaCupRegisteredStale(cup: Pick<ArenaCupState, "registered" | "entrants">, registered: CityTournamentRegistered): boolean {
  return cup.entrants.some(entrant => arenaCupChanged(cup, entrant.id, registered));
}

/**
 * A corner of `bout` is such a changed fighter: the bout cannot be fought (the duel screen leaves it at once — 2026-11-02, the live 16강's
 * FIGHT went back to the bracket on every press) nor skipped; 포기 ends the cup.
 */
export function arenaCupBoutStale(cup: Pick<ArenaCupState, "registered">, bout: { readonly a: string; readonly b: string },
  registered: CityTournamentRegistered): boolean {
  return arenaCupChanged(cup, bout.a, registered) || arenaCupChanged(cup, bout.b, registered);
}

function arenaCupChanged(cup: Pick<ArenaCupState, "registered">, id: string, registered: CityTournamentRegistered): boolean {
  if (!cityTournamentRegisteredId(id)) return false;
  const fighter = registered(id);
  return fighter !== null && fighter.manifestSha256 !== cup.registered?.[id];
}

/** `match` has a registered entrant whose package is not in (or not the cup's): it waits — a rating judgement would not be his bout. */
function arenaCupMatchWaits(cup: ArenaCupState, match: CityTournamentMatch, registered: CityTournamentRegistered): boolean {
  const pinned = arenaCupRegistered(cup, registered);
  return [match.a, match.b].some(id => id !== null && cityTournamentRegisteredId(id) && pinned(id) === null);
}

/**
 * 컵의 화면 없는 경기를 프레임 예산 안에서 나눠 돌린다(2026-10-24, docs/Plan/2026-10-24-oddbout-cup-and-free-play 5단계). 경기 한 판은 한
 * 프레임(16 ms)보다 길어서(평균 약 51 ms) 한 번에 돌리면 첫 씬이 끊긴다. 그래서 할 일의 세션을 만들어 프레임마다 예산만큼 `step` 한다.
 * 엔진·출전자 몸·경기 시드·코너 순서가 `cityTournamentBoutResolver` 와 같아서 한 번에 돌린 결과와 같다. 원화가 없는 짝(세기 판정)은 바로 정한다.
 *
 * 할 일은 둘이다(기록실 A단계, 2026-10-24):
 * - 정하기: 다음에 정할 경기(`arenaCupNextMatch`)를 돌려 기록(`ArenaBoutLog`)을 달고 결과를 적는다.
 * - 채우기: 정해졌는데 기록이 없는 경기(`arenaCupUnlogged` — 화면에서 본 대표의 경기)를 같은 시드로 다시 돌려 기록만 단다. 정하기가 먼저다.
 * 컵이 다 끝나고 기록이 차면 기록실에 남는다(`noteCurrentArenaCupBout`).
 *
 * 이 파일은 경기 엔진을 끌어오므로 첫 씬은 무투장 청크(`ArenaModule`)를 거쳐 쓴다.
 */
export class ArenaCupStepper {
  private bout: { readonly seed: number; readonly round: number; readonly slot: number; readonly a: string; readonly b: string;
    readonly decide: boolean; readonly session: CityFightBoutSession; readonly log: ArenaBoutLog } | null = null;

  /** `registered`: a registered entrant's package (내 선수 출전) — his bouts wait until it is in. */
  constructor(private readonly art: CityTournamentArt, private readonly registered: CityTournamentRegistered = () => null) {}

  /** 할 일이 남았다(정할 경기, 또는 기록을 채울 경기). */
  get pending(): boolean {
    const cup = currentArenaCup().cup;
    return cup !== null && arenaCupStepperJob(cup) !== null;
  }

  /** `budgetMs` 안에서 할 일을 진행한다. 경기 하나를 적었거나 기록을 달았으면 true(화면이 다시 그린다). */
  tick(budgetMs: number, now: () => number = () => performance.now()): boolean {
    const cup = currentArenaCup().cup, job = cup ? arenaCupStepperJob(cup) : null, match = job?.match ?? null;
    const a = match?.a ?? null, b = match?.b ?? null;
    if (!cup || !job || !match || a === null || b === null) { this.bout = null; return false; }
    const decide = job.decide;
    let bout = this.bout;
    if (!bout || bout.seed !== cup.seed || bout.round !== match.round || bout.slot !== match.slot || bout.a !== a || bout.b !== b
      || bout.decide !== decide) {
      const session = this.session(cup, match);
      // A registered fighter not in yet: his bout waits (the rating judgement would not be the bout the screen and the server fight).
      if (!session && arenaCupMatchWaits(cup, match, this.registered)) { this.bout = null; return false; }
      // A pair that cannot fight (art missing): the rating judgement, at once, and no record to replay.
      if (!session) {
        this.bout = null;
        noteCurrentArenaCupBout(cup.seed, match.round, match.slot, a, b, null);
        return decide ? stepArenaCup(cityTournamentBoutResolver(this.art)) : true;
      }
      const made = { seed: cup.seed, round: match.round, slot: match.slot, a, b, decide, session, log: new ArenaBoutLog(session.snapshot) };
      this.bout = made;
      bout = made;
    }
    const start = now();
    let result = bout.session.step();
    bout.log.observe(bout.session.snapshot);
    while (!result && now() - start < budgetMs) { result = bout.session.step(); bout.log.observe(bout.session.snapshot); }
    if (!result) return false;
    this.bout = null;
    // The record first: the result may end the cup, and the cup goes to the archive once every bout has its record.
    noteCurrentArenaCupBout(bout.seed, bout.round, bout.slot, bout.a, bout.b, bout.log.finish(result));
    if (!bout.decide) return true;
    const winner = result.winner === 0 ? bout.a : bout.b, how = result.how;
    return stepArenaCup(() => ({ winner, how }));
  }

  /**
   * 대표의 경기를 화면 없이 정해 적는다(첫 씬의 "결과만 보기" — 같은 시드·같은 엔진이라 화면 경기와 같은 결과), 기록과 함께. 그 경기로
   * 지갑에 넣은 금화도 돌려준다(G3 동전 연출).
   */
  skipBout(): { readonly progress: ArenaCupProgress; readonly gold: number } | null {
    const cup = currentArenaCup().cup, key = cup ? arenaCupBoutKey(cup) : null, match = cup ? arenaCupMatch(cup) : null;
    if (!cup || !key || !match) return null;
    const session = this.session(cup, match);
    if (!session && arenaCupMatchWaits(cup, match, this.registered)) return null;
    if (!session) {
      noteCurrentArenaCupBout(cup.seed, key.round, key.slot, key.a, key.b, null);
      const rated = cityTournamentBoutResolver(this.art)(cup, match);
      if (rated.how === "bye" || rated.how === "forfeit") return null;
      const outcome = recordArenaCupResult(key, rated.winner, rated.how);
      return outcome.recorded ? { progress: outcome.progress, gold: outcome.gold } : null;
    }
    const summary = runLoggedBout(session);
    noteCurrentArenaCupBout(cup.seed, key.round, key.slot, key.a, key.b, summary);
    const outcome = recordArenaCupResult(key, summary.winner === 0 ? key.a : key.b, summary.how);
    return outcome.recorded ? { progress: outcome.progress, gold: outcome.gold } : null;
  }

  /** The match's bout as the bracket fights it (its entrants, the seed of its round and slot), or null when the pair cannot fight. */
  private session(cup: ArenaCupState, match: CityTournamentMatch): CityFightBoutSession | null {
    const entrant = (id: string | null) => cup.entrants.find(candidate => candidate.id === id) ?? null;
    const a = entrant(match.a), b = entrant(match.b);
    const setup = a && b ? cityTournamentBoutSetup(a, b, this.art, undefined, arenaCupRegistered(cup, this.registered)) : null;
    return setup ? createCityFightFighterBout(setup.corners[0], setup.corners[1], setup.arena, setup.rules,
      arenaCupBoutSeed({ seed: cup.seed, round: match.round, slot: match.slot })) : null;
  }
}

/** The stepper's next job on `cup`: the next bout to decide, else a decided one without its record; null when none. */
export function arenaCupStepperJob(cup: ArenaCupState): { readonly match: CityTournamentMatch; readonly decide: boolean } | null {
  const next = arenaCupNextMatch(cup);
  if (next) return { match: next, decide: true };
  const unlogged = arenaCupUnlogged(cup);
  return unlogged ? { match: unlogged, decide: false } : null;
}

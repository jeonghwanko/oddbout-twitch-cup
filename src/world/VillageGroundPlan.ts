import { VILLAGE_RESIDENTIAL_COURTS, VILLAGE_RESIDENTIAL_ROUTES } from "./VillageNeighborhoodPlan.ts";
import { VILLAGE_WATERFRONT } from "./VillageWaterfrontPlan.ts";
/** Assembly plan for the 1920×800 ground (art x = world x + 320).
 * The ground compiler, collisions and NPC waypoints share these coordinates.
 * Widths include the soft grass verge, but never the planted islands or building gardens.
 */
export function villageRoadHalfWidth(id: string): number {
  return id.startsWith('residential') ? 20 : id === 'south' ? 54 : id.endsWith('Ring') ? 44 : 30;
}
export const VILLAGE_GROUND_ROUTES = {
  south: [[640, 784], [640, 680], [640, 570], [640, 550]],
  westRing: [[640, 570], [505, 500], [430, 445], [480, 380], [600, 370]],
  eastRing: [[640, 570], [745, 525], [825, 460], [780, 395], [700, 375], [600, 370]],
  westStreet: [[-350, 740], [20, 555], [175, 495], [305, 480], [330, 450], [390, 455], [505, 500]],
  eastStreet: [[825, 460], [950, 490], [1100, 480], [1250, 510], [1640, 705]],
  northwest: [[-350, 10], [90, 230], [260, 305], [400, 370], [480, 380]],
  northeast: [[780, 395], [930, 310], [1100, 245], [1180, 205], [1640, -25]],
  tutorial: [[640, 750], [500, 680], [413.6, 626.6]],
  manor: [[600, 370], [600, 354]],
  auction: [[1100, 480], [1120, 465]],
  waterfront: VILLAGE_WATERFRONT.route,
  ...VILLAGE_RESIDENTIAL_ROUTES,
} as const;

export const VILLAGE_PUBLIC_COURTS = [
  ...VILLAGE_RESIDENTIAL_COURTS,
  { id: 'central-square', points: [[480,380],[700,375],[810,410],[870,485],[745,550],[640,650],[500,550],[400,490]] },
  { id: 'manor-court', points: [[405.6,217.28],[628.8,109.28],[895.2,217.28],[708.0,310.88],[686.4,404.48],[578.4,411.68],[564.0,318.08]] },
  { id: 'guild-court', points: [[0,350],[175,255],[365,355],[195,455]] },
  { id: 'auction-court', points: [[842.8,313.52],[1136.8,153.92],[1388.8,330.32],[1103.2,506.72]] },
  { id: 'tutorial-court', points: [[99.0,586.3],[320.0,469.3],[502.0,586.3],[320.0,716.3]] },
  { id: 'waterfront-garden', points: VILLAGE_WATERFRONT.garden },
  { id: 'south-gate', points: [[590,690],[685,690],[820,800],[440,800]] },
] as const;

export const VILLAGE_CITIZEN_ITINERARIES = {
  'west-courier': [[30,550],[130,510],[240,495]],
  'east-porter': VILLAGE_WATERFRONT.route,
  'south-vendor': [[1050,485],[1100,480],[1240,508]],
  'guild-runner': [[90,230],[260,305],[400,370]],
  'market-browser': [[815,375],[840,361],[865,347]],
} as const;

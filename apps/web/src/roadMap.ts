/** Road strip model shared by the map card and tests. */
export const MILES_PER_CELL = 10;
export interface RoadCell { index: number; startMile: number; townId: string | null; hero: boolean }
/** One cell per 10 miles, from mile 0 to one cell past the furthest of the last town and the hero. */
export function roadCells(towns: readonly { id: string; base_mile: number }[], heroMile: number): RoadCell[] {
  const last = Math.max(heroMile, ...towns.map(town => town.base_mile));
  const count = Math.floor(last / MILES_PER_CELL) + 2;
  const heroCell = Math.floor(heroMile / MILES_PER_CELL);
  return Array.from({ length: count }, (_, index) => ({
    index, startMile: index * MILES_PER_CELL,
    townId: towns.find(town => Math.floor(town.base_mile / MILES_PER_CELL) === index)?.id ?? null,
    hero: index === heroCell,
  }));
}

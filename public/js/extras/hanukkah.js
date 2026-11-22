// The nights of Hanukkah 2026, in the guest's own time. The menorah (menorah.js) burns one candle for each night.
// A new night starts at 4 pm, a simple stand-in for sundown in winter.
// Night 1 starts at 4 pm on Friday, December 4. Night 8 starts at 4 pm on December 11 and lasts to the end of December 12.

const FIRST = { year: 2026, month: 11, day: 4 };
const NIGHTS = 8;
const SUNDOWN = 16;

// The night of Hanukkah at the Date `now`, from 1 to 8, or 0 outside Hanukkah.
export function hanukkahNight(now) {
  const { year, month, day } = FIRST;
  if (now >= new Date(year, month, day + NIGHTS + 1)) return 0;
  for (let night = NIGHTS; night >= 1; night--) {
    if (now >= new Date(year, month, day + night - 1, SUNDOWN)) return night;
  }
  return 0;
}

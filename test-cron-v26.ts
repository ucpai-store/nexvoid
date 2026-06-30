// Simulasi cron-service.ts v2.6 logic — FIXED (copy Date, no mutation)

const WIB_OFFSET = 7;

function getWibDateString(date: Date): string {
  const wibDate = new Date(date.getTime() + date.getTimezoneOffset() * 60000 + WIB_OFFSET * 3600000);
  return `${wibDate.getFullYear()}-${String(wibDate.getMonth() + 1).padStart(2, '0')}-${String(wibDate.getDate()).padStart(2, '0')}`;
}

function countWeekdaysMissed(lastCreditDateStr: string, todayStr: string): number {
  const [ly, lm, ld] = lastCreditDateStr.split('-').map(Number);
  const [ty, tm, td] = todayStr.split('-').map(Number);
  const start = new Date(Date.UTC(ly, lm - 1, ld + 1));
  const end = new Date(Date.UTC(ty, tm - 1, td));
  let count = 0;
  const cursor = new Date(start);
  let safety = 60;
  while (cursor < end && safety-- > 0) {
    const dow = cursor.getUTCDay();
    if (dow !== 0 && dow !== 6) count++;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

function getDowWIB(date: Date): number {
  const wibDate = new Date(date.getTime() + date.getTimezoneOffset() * 60000 + WIB_OFFSET * 3600000);
  return wibDate.getDay();
}

function simulateCronRun(inv: { startDate: Date; lastProfitDate: Date | null }, now: Date): { credited: number; newLastProfitDate: Date | null } {
  const todayWIB = getWibDateString(now);
  const todayDow = getDowWIB(now);
  const isTodayWeekday = todayDow !== 0 && todayDow !== 6;
  
  if (!isTodayWeekday) return { credited: 0, newLastProfitDate: inv.lastProfitDate };
  
  if (inv.lastProfitDate) {
    const lastProfitWIB = getWibDateString(new Date(inv.lastProfitDate));
    if (lastProfitWIB === todayWIB) return { credited: 0, newLastProfitDate: inv.lastProfitDate };
  }
  
  const createdDate = inv.startDate;
  const createdWIB = getWibDateString(createdDate);
  if (createdWIB === todayWIB) return { credited: 0, newLastProfitDate: inv.lastProfitDate };
  
  let lastCreditDateStr: string;
  if (inv.lastProfitDate) {
    lastCreditDateStr = getWibDateString(new Date(inv.lastProfitDate));
  } else {
    lastCreditDateStr = createdWIB;
  }
  
  const missedDays = countWeekdaysMissed(lastCreditDateStr, todayWIB);
  const totalDays = Math.min(missedDays + (isTodayWeekday ? 1 : 0), 30);
  
  if (totalDays <= 0) return { credited: 0, newLastProfitDate: inv.lastProfitDate };
  
  return { credited: totalDays, newLastProfitDate: new Date(now) }; // COPY date
}

function d(s: string): Date { return new Date(s + "T00:00:00+07:00"); }

const scenarios = [
  { name: "Beli Sabtu→Selasa (expect 2)", start: "2025-06-28", today: "2025-07-01", expected: 2 },
  { name: "Beli Minggu→Selasa (expect 2)", start: "2025-06-29", today: "2025-07-01", expected: 2 },
  { name: "Beli Jumat→Senin (expect 1)", start: "2025-06-27", today: "2025-06-30", expected: 1 },
  { name: "Beli Jumat→Selasa (expect 2)", start: "2025-06-27", today: "2025-07-01", expected: 2 },
  { name: "Beli Senin→Rabu (expect 2)", start: "2025-06-30", today: "2025-07-02", expected: 2 },
  { name: "Beli Senin→Kamis (expect 3)", start: "2025-06-30", today: "2025-07-03", expected: 3 },
  { name: "Beli Kamis→Senin (expect 2)", start: "2025-06-26", today: "2025-06-30", expected: 2 },
  { name: "Beli Rabu→Senin (expect 3)", start: "2025-06-25", today: "2025-06-30", expected: 3 },
  { name: "Beli Senin→Jumat (expect 4)", start: "2025-06-30", today: "2025-07-04", expected: 4 },
];

console.log("Scenario".padEnd(45) + "Expected  Credited  Match");
console.log("-".repeat(75));

let allOK = true;
for (const s of scenarios) {
  const startDate = d(s.start);
  const todayDate = d(s.today);
  
  let inv = { startDate, lastProfitDate: null as Date | null };
  let totalCredited = 0;
  const simCur = new Date(startDate);
  while (simCur <= todayDate) {
    const nowCopy = new Date(simCur);
    const result = simulateCronRun(inv, nowCopy);
    if (result.credited > 0) {
      totalCredited += result.credited;
      inv = { startDate, lastProfitDate: result.newLastProfitDate };
    }
    simCur.setDate(simCur.getDate() + 1);
  }
  
  const match = s.expected === totalCredited ? "OK" : "❌ MISMATCH";
  if (s.expected !== totalCredited) allOK = false;
  console.log(`${s.name}`.padEnd(45) + `${String(s.expected).padStart(8)}  ${String(totalCredited).padStart(8)}  ${match}`);
}

console.log("-".repeat(75));
console.log(allOK ? "✅ ALL OK — cron v2.6 logic benar" : "❌ ADA BUG");

// Edge case: cron down 3 hari (Jumat-Sabtu-Minggu), beli Kamis, Senin up lagi
console.log("\n--- EDGE: Cron down Jumat-Sabtu-Minggu, beli Kamis, Senin up ---");
let inv2 = { startDate: d("2025-06-26"), lastProfitDate: null as Date | null };
const seninUp = d("2025-06-30");
const r2 = simulateCronRun(inv2, seninUp);
console.log(`  Senin 00:00 WIB (first cron after downtime): credited ${r2.credited} hari (expect 3: Jumat+Senin... wait)`);
// Beli Kamis 26 Jun. same-day purchase = skip (Kamis). Jumat = weekday, missed. Sabtu-Minggu = libur. Senin = today.
// missedDays = countWeekdaysMissed("2025-06-26", "2025-06-30") = weekdays dari 27 Jun to 30 Jun (exclusive end)
//   = 27 Jun (Jumat) = 1, 28 Jun (Sabtu) skip, 29 Jun (Minggu) skip, 30 Jun excluded
//   = 1
// totalDays = 1 + 1 (today Senin) = 2
// Expected: Jumat (missed) + Senin (today) = 2 hari. Kamis (same-day) = skip.
console.log(`  Expected: 2 (Jumat missed + Senin today, Kamis same-day skip)`);

import assert from "node:assert/strict";
import { formatDateInTimeZone } from "./date.js";

assert.equal(formatDateInTimeZone(new Date("2026-05-20T19:15:00.000Z")), "2026-05-21");
assert.equal(formatDateInTimeZone(new Date("2026-05-20T14:59:00.000Z")), "2026-05-20");
assert.equal(formatDateInTimeZone(new Date("2026-05-20T15:00:00.000Z")), "2026-05-21");

console.log("date tests passed");

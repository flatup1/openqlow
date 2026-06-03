import assert from "node:assert/strict";
import { optimizePostForDestinations } from "./platform_optimizer.js";

const optimized = optimizePostForDestinations({
  body: "弱い自分と向き合う練習。今日も一歩ずつ。 #FLATUPGYM #成田 #キックボクシング",
  destinations: ["threads", "google_business", "line_voom"],
});

assert(optimized.threads);
assert(optimized.google_business);
assert(optimized.line_voom);

assert.equal(optimized.threads.hashtags.length, 1);
assert(optimized.threads.text.includes("#FLATUPGYM"));
assert(!optimized.threads.text.includes("#成田"));

assert(optimized.google_business.text.includes("成田"));
assert(optimized.google_business.text.includes("FLATUP GYM"));
assert(!optimized.google_business.text.includes("#"));

assert(optimized.line_voom.text.includes("弱い自分と向き合う練習"));
assert(optimized.line_voom.text.includes("#FLATUPGYM"));
assert(optimized.line_voom.text.length <= 10000);

console.log("platform optimizer tests passed");

import assert from "node:assert/strict";
import { formatDailyCheckPrompt } from "./daily_check.js";

const prompt = formatDailyCheckPrompt();

assert.match(prompt, /OPENQLOW Daily Check/);
assert.match(prompt, /昨日のFLATUP GYM/);
assert.match(prompt, /このまま1回でまとめて返信/);
assert.doesNotMatch(prompt, /そのあと、OPENQLOWが1つずつ聞きます/);
assert.match(prompt, /体験/);
assert.match(prompt, /入会/);
assert.match(prompt, /フォロー/);
assert.match(prompt, /Obsidian/);
assert.match(prompt, /AIは決めません/);

console.log("daily check tests passed");

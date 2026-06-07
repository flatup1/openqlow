import assert from "node:assert/strict";
import { formatDailyCheckPrompt } from "./daily_check.js";

const prompt = formatDailyCheckPrompt();

assert.match(prompt, /OPENQLOW Daily Check/);
assert.match(prompt, /昨日のFLATUPを1通で送ってください/);
assert.doesNotMatch(prompt, /そのあと、OPENQLOWが1つずつ聞きます/);
assert.match(prompt, /体験 ひかりちゃん1名/);
assert.match(prompt, /入会予定あり/);
assert.match(prompt, /今日やること 広告を打つ/);
assert.match(prompt, /「なし」だけでもOK/);
assert.doesNotMatch(prompt, /1\. 昨日の体験/);

console.log("daily check tests passed");

import assert from "node:assert/strict";
import { validateMediaPlan } from "./media_rules.js";

const ok = validateMediaPlan({
  body: "弱い自分と向き合う練習。 #FLATUPGYM",
  mediaFiles: ["/tmp/post.mp4"],
  destinations: ["threads", "line_voom"],
});
assert.equal(ok.ok, true);

const threadsHashtag = validateMediaPlan({
  body: "今日の練習 #FLATUPGYM #成田",
  mediaFiles: ["/tmp/post.jpg"],
  destinations: ["threads"],
});
assert.equal(threadsHashtag.ok, false);
assert(threadsHashtag.issues.some(issue => issue.destination === "threads" && issue.code === "too_many_hashtags"));

const voomTooMany = validateMediaPlan({
  body: "今日の練習",
  mediaFiles: Array.from({ length: 21 }, (_, index) => `/tmp/${index}.jpg`),
  destinations: ["line_voom"],
});
assert.equal(voomTooMany.ok, false);
assert(voomTooMany.issues.some(issue => issue.destination === "line_voom" && issue.code === "too_many_media_files"));

const googleNeedsUrl = validateMediaPlan({
  body: "今日の練習",
  mediaFiles: ["/tmp/post.jpg"],
  destinations: ["google_business"],
});
assert.equal(googleNeedsUrl.ok, false);
assert(googleNeedsUrl.issues.some(issue => issue.destination === "google_business" && issue.code === "media_url_required"));

const unsupported = validateMediaPlan({
  body: "今日の練習",
  mediaFiles: ["/tmp/post.gif"],
  destinations: ["threads"],
});
assert.equal(unsupported.ok, false);
assert(unsupported.issues.some(issue => issue.code === "unsupported_media_type"));

console.log("media rules tests passed");

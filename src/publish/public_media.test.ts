import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { resolvePublicMediaUrl } from "./public_media.js";

const root = await mkdtemp(path.join(tmpdir(), "openqlow-public-media-"));
const publicDir = path.join(root, "public", "media");
const nestedDir = path.join(publicDir, "nested folder");
await mkdir(nestedDir, { recursive: true });

const file = path.join(nestedDir, "post image.jpg");
await writeFile(file, "image");

const env = {
  OPENQLOW_PUBLIC_MEDIA_DIR: publicDir,
  OPENQLOW_PUBLIC_MEDIA_BASE_URL: "https://media.example.com/openqlow/",
};

assert.equal(
  await resolvePublicMediaUrl(file, env),
  "https://media.example.com/openqlow/nested%20folder/post%20image.jpg",
);

assert.equal(
  await resolvePublicMediaUrl("https://example.com/post.jpg", {}),
  "https://example.com/post.jpg",
);

assert.equal(await resolvePublicMediaUrl(file, {}), undefined);
assert.equal(await resolvePublicMediaUrl(path.join(publicDir, "missing.jpg"), env), undefined);

const outsideFile = path.join(root, "outside.jpg");
await writeFile(outsideFile, "outside");
assert.equal(await resolvePublicMediaUrl(outsideFile, env), undefined);

await rm(root, { recursive: true, force: true });

console.log("public media tests passed");

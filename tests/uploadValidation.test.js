const test = require("node:test");
const assert = require("node:assert/strict");
const { hasValidVideoSignature } = require("../middleware/upload");

test("accepts MP4 and WebM signatures", () => {
  const mp4 = Buffer.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0, 0, 0, 0]);
  const webm = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);

  assert.equal(hasValidVideoSignature(mp4, "video/mp4"), true);
  assert.equal(hasValidVideoSignature(webm, "video/webm"), true);
});

test("rejects content that only claims to be a supported video", () => {
  const fakeVideo = Buffer.from("this is not a video");

  assert.equal(hasValidVideoSignature(fakeVideo, "video/mp4"), false);
  assert.equal(hasValidVideoSignature(fakeVideo, "video/webm"), false);
});

import assert from "node:assert/strict";
import { formatLineMessageLog } from "./logging.js";

function testLineMessageLogMasksUserIdAndMessageBody(): void {
  const line = formatLineMessageLog("U123456789abcdef", "小学生の体験を相談したいです");

  assert.equal(line, "LINE message received from U1234567*** (14文字)");
  assert.doesNotMatch(line, /小学生/);
  assert.doesNotMatch(line, /abcdef/);
}

function testLineMessageLogHandlesUnknownUser(): void {
  assert.equal(formatLineMessageLog(undefined, "問い合わせです"), "LINE message received from unknown (7文字)");
}

testLineMessageLogMasksUserIdAndMessageBody();
testLineMessageLogHandlesUnknownUser();

console.log("line bot logging tests passed");

import process from "node:process";

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);

let input;
try {
  input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
} catch {
  process.stderr.write("Invalid hook input; blocking by default.\n");
  process.exit(2);
}

const command = String(input?.tool_input?.command ?? input?.tool_input?.cmd ?? "");
if (!command.trim()) {
  process.stderr.write("Missing command in hook input; blocking by default.\n");
  process.exit(2);
}

const destructive = [
  /(?:^|[;&|]\s*)(?:sudo\s+)?(?:\/[^\s]+\/)?rm\s+-(?=[^\s]*r)(?=[^\s]*f)[^\s]*/i,
  /\bgit\s+reset\s+--hard\b/i,
  /\bgit\s+clean\s+-(?=[^\s]*f)(?=[^\s]*d)[^\s]*/i,
  /\bgit\s+push\b[^\n]*\s(?:--force(?:-with-lease)?|-f)(?:\s|$)/i,
  /\bgh\s+repo\s+delete\b/i,
  /\bdropdb\b/i,
  /\bDROP\s+DATABASE\b/i,
  /\bTRUNCATE\s+TABLE\b/i,
];

const approvalRequired = [
  /\bgit\s+(?:commit|push)\b/i,
  /\bgh\s+(?:pr\s+create|issue\s+|project\s+)/i,
  /\b(?:curl|wget|scp|rsync)\b/i,
  /\b(?:vercel|netlify|firebase)\b/i,
  /\bterraform\s+apply\b/i,
  /\bnpm\s+publish\b/i,
  /\b(?:rm|mv)\s+/i,
];

function emit(decision, reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: decision,
      permissionDecisionReason: reason,
    },
  }));
}

if (destructive.some((pattern) => pattern.test(command))) {
  emit("deny", "FLATUP policy blocks destructive deletion, history loss, force push, repository deletion, or full database deletion.");
  process.exit(0);
}

if (process.env.FLATUP_HOOK_ENGINE === "claude" && approvalRequired.some((pattern) => pattern.test(command))) {
  emit("ask", "FLATUP policy requires Jin's approval before deletion, external writes, publication, deployment, commit, or push.");
}

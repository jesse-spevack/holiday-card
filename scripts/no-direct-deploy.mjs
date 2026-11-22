// A Claude Code hook (see .claude/settings.json). It stops a Bash command that deploys the Worker
// directly with wrangler. A direct deploy from a branch replaces the live site with that branch.
// Use pnpm preview to check a branch. Only pnpm run deploy on main deploys.
let input = "";
for await (const chunk of process.stdin) input += chunk;
const command = JSON.parse(input || "{}").tool_input?.command ?? "";
if (/\bwrangler\b[^\n;&|]*\s(deploy|versions\s+deploy|triggers\s+deploy)\b/.test(command)) {
  console.error("Blocked: do not deploy with wrangler directly. Use pnpm preview to check a branch. Only pnpm run deploy on main deploys. See AGENTS.md.");
  process.exit(2);
}

"use server";

import { cookies } from "next/headers";

// Clears the pending-prompt cookie set by /start once the workspace has fired
// the initial prompt at the agent, so a reload can't re-send it.
export async function clearPendingPrompt() {
  (await cookies()).delete("kk_pending_prompt");
}

import { randomBytes, timingSafeEqual } from "node:crypto";

// The 健康助手 tool and API run in the same process. The secret never leaves the API service.
export const dailyStatusToken = randomBytes(32).toString("hex");

export function authorizedDailyStatus(request) {
  const supplied = request.headers["x-daily-status-token"];
  if (typeof supplied !== "string" || supplied.length !== dailyStatusToken.length) return false;
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(dailyStatusToken));
}

import { randomUUID } from "node:crypto";

const limit = 5;
const windowMs = 24 * 60 * 60 * 1000;

// Pruning, checking, and recording a question run together on Redis.
export const quotaScript = `
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local member = ARGV[3]
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)

redis.call('ZREMRANGEBYSCORE', key, '-inf', now - window)
local count = redis.call('ZCARD', key)
local accepted = 0
if member ~= '' and count < limit then
  redis.call('ZADD', key, now, member)
  redis.call('PEXPIRE', key, window)
  count = count + 1
  accepted = 1
end

local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
local reset = 0
if oldest[2] then reset = tonumber(oldest[2]) + window end
return {accepted, limit - count, reset}
`;

export async function tutorQuota(userId: string, consume = false) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error("Tutor Redis is not configured");

  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(["EVAL", quotaScript, 1, `scribbler:tutor:v1:${userId}`, limit, windowMs, consume ? randomUUID() : ""]),
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error("Tutor Redis request failed");
  const { result } = await response.json();
  if (!Array.isArray(result) || result.length !== 3 || !result.every(Number.isSafeInteger)) {
    throw new Error("Tutor Redis returned an invalid result");
  }
  const [accepted, remaining, reset] = result;
  return { accepted: accepted === 1, usage: { limit, remaining, nextAvailableAt: reset || null } };
}

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { loadEnvFile } from 'node:process';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
try { loadEnvFile(resolve(ROOT, '.env')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
export const runtimeDir = () => resolve(process.env.BUSINESS_DATA_DIR || resolve(ROOT, 'runtime'));
const positiveMoney = z.number().finite().nonnegative().max(1000000);
const schema = z.object({
  model: z.string().min(1),
  daily_spend_limit: positiveMoney,
  total_loss_limit: positiveMoney,
  owner_hourly_rate: positiveMoney,
  max_turns: z.number().int().min(1).max(20),
  max_tool_calls: z.number().int().min(1).max(40),
  request_timeout_seconds: z.number().int().min(1).max(600),
  run_timeout_seconds: z.number().int().min(1).max(1800),
  context_length: z.number().int().min(4096).max(32768),
  max_output_tokens: z.number().int().min(1024).max(8192),
  max_searches_per_day: z.number().int().min(0).max(20)
}).strict().refine(value => value.max_output_tokens < value.context_length, {
  message: 'context_length must exceed max_output_tokens to leave room for instructions and evidence.'
});

export function loadConfig() {
  const defaults = JSON.parse(readFileSync(resolve(ROOT, 'config.example.json'), 'utf8'));
  let local = {};
  try { local = JSON.parse(readFileSync(resolve(ROOT, 'config.local.json'), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  return schema.parse({ ...defaults, ...local, ...(process.env.OLLAMA_MODEL ? { model: process.env.OLLAMA_MODEL } : {}) });
}

export function cents(value) {
  positiveMoney.parse(value);
  const amount = Math.round(value * 100);
  if (Math.abs(value * 100 - amount) > 0.000001) throw new Error('Use at most two decimal places for money.');
  return amount;
}

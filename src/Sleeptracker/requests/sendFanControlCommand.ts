import { logError, logInfo } from '@utils/logger';
import axios from 'axios';
import { Credentials } from '../options';
import { Snapshot } from '../types/Snapshot';
import { getAuthHeader } from './getAuthHeader';
import defaultHeaders from './shared/defaultHeaders';
import { buildDefaultPayload } from './shared/defaultPayload';
import { urls } from './shared/urls';

type Response = { statusCode: number; statusMessage: string; body: { snapshots: Snapshot[] } };

export type FanSide = 'left' | 'right';

export type FanSideCommand = {
  level: number; // 0 = off, 1 = low, 2 = medium, 3 = high
  isHeating: boolean;
  isConstant: boolean; // false = temp-curve, true = constant cool
};

// Timer values as sent by the official app (seconds)
export const COOLING_TIMER_SECS = 36000; // 10 hours
export const HEATING_TIMER_SECS = 3600; // 1 hour

const buildSidePayload = (side: FanSide, { level, isHeating, isConstant }: FanSideCommand) => ({
  [`${side}Level`]: level,
  [`${side}Timer`]: isHeating ? HEATING_TIMER_SECS : COOLING_TIMER_SECS,
  [`${side}IsHeating`]: isHeating,
  [`${side}IsConstant`]: isConstant,
});

// The bed drops off Sleeptracker's cloud regularly (weak bedroom Wi-Fi). While it is
// off-cloud the endpoint answers but reports "null response from processor" - the cloud
// could not reach the bed - and the command was simply discarded, so a fan press from HA
// silently did nothing. These dropouts are usually short, so hold the command and keep
// offering it for a window instead of losing it.
const RETRY_WINDOW_MS = 30_000;
const RETRY_INTERVAL_MS = 3_000;

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Retrying for 30s means an older command can still be in flight when a newer one
// arrives - press High, change your mind, press Off, and the stale High could land
// AFTER the Off and undo it. Scrolling a dropdown can queue several in a second.
// Each side therefore carries a generation counter: issuing a command bumps it for
// every side that command targets, and a retry loop abandons as soon as it sees a
// newer command for a side it was setting. Last intent wins; stale intent is dropped.
const latestGeneration: Record<FanSide, number> = { left: 0, right: 0 };

// ActiveBreeze fan/heat control. Sends via the processorCommand endpoint (not adjustableBaseControls).
// Pass one or both sides; omitted sides are left unchanged by the base.
export const sendFanControlCommand = async (
  sides: Partial<Record<FanSide, FanSideCommand>>,
  credentials: Credentials
) => {
  const authHeader = await getAuthHeader(credentials);
  if (!authHeader) return [];

  const { appHost, processorBaseUrl } = urls(credentials);
  const fanControl = {
    position: { side: 0 },
    ...(sides.left ? buildSidePayload('left', sides.left) : {}),
    ...(sides.right ? buildSidePayload('right', sides.right) : {}),
  };
  const targetedSides = (Object.keys(sides) as FanSide[]).filter((side) => sides[side]);
  const myGeneration = {} as Record<FanSide, number>;
  for (const side of targetedSides) myGeneration[side] = ++latestGeneration[side];
  const superseded = () => targetedSides.some((side) => latestGeneration[side] !== myGeneration[side]);

  const deadline = Date.now() + RETRY_WINDOW_MS;
  let attempt = 0;
  let lastProblem = '';

  for (;;) {
    attempt++;
    try {
      const response = await axios.request<Response>({
        method: 'POST',
        url: `${processorBaseUrl}/processorCommand`,
        headers: {
          ...defaultHeaders,
          Host: appHost,
          Authorization: authHeader,
        },
        data: {
          ...buildDefaultPayload('processorCommand', credentials),
          endpoint: '/command/v1/motor-command',
          processorCommand: { fanControl },
        },
      });
      const { statusCode, body } = response.data;
      if (statusCode === 0) {
        if (attempt > 1) logInfo(`[Sleeptracker] Fan command landed on attempt ${attempt}`);
        return body?.snapshots || [];
      }
      lastProblem = JSON.stringify(response.data);
    } catch (err: any) {
      lastProblem = err?.message ?? String(err);
    }

    // A newer command for one of these sides exists - drop this one rather than
    // letting stale intent land after it.
    if (superseded()) {
      logInfo(`[Sleeptracker] Fan command superseded, abandoning after ${attempt} attempt(s)`);
      return [];
    }

    // Out of time: report the last failure exactly as before, so nothing is hidden.
    if (Date.now() + RETRY_INTERVAL_MS > deadline) {
      logError(
        `[Sleeptracker] Fan command failed after ${attempt} attempt(s) over ${RETRY_WINDOW_MS / 1000}s:`,
        lastProblem
      );
      return [];
    }
    await delay(RETRY_INTERVAL_MS);
    if (superseded()) {
      logInfo(`[Sleeptracker] Fan command superseded, abandoning after ${attempt} attempt(s)`);
      return [];
    }
  }
};

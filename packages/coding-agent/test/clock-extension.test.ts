import { afterEach, beforeEach, describe, expect, it, setSystemTime, vi } from "bun:test";
import type {
	ExtensionAPI,
	ExtensionContext,
	ExtensionHandler,
	SessionShutdownEvent,
	SessionStartEvent,
} from "@oh-my-pi/pi-coding-agent/extensibility/extensions/types";
import clock from "../examples/extensions/clock";

function createClock(hasUI = true) {
	let start: ExtensionHandler<SessionStartEvent> | undefined;
	let shutdown: ExtensionHandler<SessionShutdownEvent> | undefined;
	const api = {
		on(event: string, handler: ExtensionHandler<SessionStartEvent> | ExtensionHandler<SessionShutdownEvent>) {
			if (event === "session_start") start = handler as ExtensionHandler<SessionStartEvent>;
			if (event === "session_shutdown") shutdown = handler as ExtensionHandler<SessionShutdownEvent>;
		},
	} as ExtensionAPI;
	const statuses = new Map<string, string>();
	const setStatus = vi.fn((key: string, text: string | undefined) => {
		if (text === undefined) statuses.delete(key);
		else statuses.set(key, text);
	});
	const ctx = {
		hasUI,
		ui: { setStatus },
		setInterval: vi.fn((callback: () => void, ms: number) => setInterval(callback, ms)),
		clearTimer: (timer: Timer) => clearInterval(timer),
	} as unknown as ExtensionContext;
	clock(api);
	return {
		statuses,
		setStatus,
		ctx,
		start: () => start?.({ type: "session_start" }, ctx),
		shutdown: () => shutdown?.({ type: "session_shutdown" }, ctx),
	};
}

describe("clock extension", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		setSystemTime(new Date(2026, 8, 30, 23, 59, 59));
	});
	afterEach(() => {
		vi.useRealTimers();
		setSystemTime();
		vi.restoreAllMocks();
	});

	it("shows local time immediately and advances across midnight without user input", async () => {
		const clock = createClock();
		try {
			await clock.start();
			expect(clock.statuses.get("clock")).toBe("23:59:59");
			vi.advanceTimersByTime(1000);
			expect(clock.statuses.get("clock")).toBe("00:00:00");
		} finally {
			await clock.shutdown();
		}
	});

	it("clears its status and stops updates on unload, and restarts only one clock on reload", async () => {
		const clock = createClock();
		clock.statuses.set("other-extension", "Keep me");
		try {
			await clock.start();
			await clock.shutdown();
			const callsAfterUnload = clock.setStatus.mock.calls.length;
			vi.advanceTimersByTime(3000);
			expect(clock.setStatus.mock.calls.length).toBe(callsAfterUnload);
			expect(clock.statuses.has("clock")).toBe(false);
			expect(clock.statuses.get("other-extension")).toBe("Keep me");

			await clock.start();
			await clock.start();
			clock.setStatus.mockClear();
			vi.advanceTimersByTime(1000);
			expect(clock.setStatus).toHaveBeenCalledTimes(1);
			expect(clock.statuses.get("clock")).toBe("00:00:03");
		} finally {
			await clock.shutdown();
		}
	});

	it("does not schedule or emit status updates in headless sessions", async () => {
		const clock = createClock(false);
		await clock.start();
		vi.advanceTimersByTime(3000);
		await clock.shutdown();
		expect(clock.ctx.setInterval).not.toHaveBeenCalled();
		expect(clock.setStatus).not.toHaveBeenCalled();
	});
});

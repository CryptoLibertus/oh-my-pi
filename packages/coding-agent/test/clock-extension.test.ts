import { afterEach, beforeEach, describe, expect, it, setSystemTime, vi } from "bun:test";
import clockExtension from "../examples/extensions/clock";
import { createExtensionHarness } from "./helpers/extension-harness";

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
		const clock = await createExtensionHarness(clockExtension);
		try {
			await clock.start();
			expect(clock.statuses.get("clock")).toBe("23:59:59");
			vi.advanceTimersByTime(1000);
			expect(clock.statuses.get("clock")).toBe("00:00:00");
		} finally {
			await clock.dispose();
		}
	});

	it("clears its status and stops updates on unload, and restarts only one clock on reload", async () => {
		const clock = await createExtensionHarness(clockExtension);
		clock.statuses.set("other-extension", "Keep me");
		try {
			await clock.start();
			await clock.shutdown();
			const callsAfterUnload = clock.statusUpdates.length;
			vi.advanceTimersByTime(3000);
			expect(clock.statusUpdates.length).toBe(callsAfterUnload);
			expect(clock.statuses.has("clock")).toBe(false);
			expect(clock.statuses.get("other-extension")).toBe("Keep me");

			await clock.reload();
			await clock.start();
			clock.statusUpdates.length = 0;
			vi.advanceTimersByTime(1000);
			expect(clock.statusUpdates).toHaveLength(1);
			expect(clock.statuses.get("clock")).toBe("00:00:03");
		} finally {
			await clock.dispose();
		}
	});

	it("does not schedule or emit status updates in headless sessions", async () => {
		const clock = await createExtensionHarness(clockExtension, { hasUI: false });
		try {
			await clock.start();
			vi.advanceTimersByTime(3000);
			await clock.shutdown();
			expect(vi.getTimerCount()).toBe(0);
			expect(clock.statusUpdates).toHaveLength(0);
		} finally {
			await clock.dispose();
		}
	});
});

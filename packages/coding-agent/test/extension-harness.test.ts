import { afterEach, beforeEach, describe, expect, it, vi } from "bun:test";
import { createExtensionHarness } from "./helpers/extension-harness";

describe("extension test harness", () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it("executes registered commands against supplied UI interactions", async () => {
		const harness = await createExtensionHarness(
			pi => {
				pi.registerCommand("uppercase", {
					handler: async (args, ctx) => {
						if (await ctx.ui.confirm("Convert?", args)) ctx.ui.setStatus("result", args.toUpperCase());
					},
				});
			},
			{ ui: { confirm: async () => true } },
		);
		try {
			await harness.start();
			const command = harness.runner.getRegisteredCommands().find(command => command.name === "uppercase");
			if (!command) throw new Error("Registered command was not available to the host");
			await command.handler("mixed Case", harness.runner.createCommandContext());
			expect(harness.statuses.get("result")).toBe("MIXED CASE");
		} finally {
			await harness.dispose();
		}
	});

	it("reload recreates factory state and removes the old runner's timers without extension cleanup", async () => {
		const harness = await createExtensionHarness(pi => {
			let count = 0;
			pi.on("session_start", (_event, ctx) => {
				ctx.setInterval(() => ctx.ui.setStatus("ticks", String(++count)), 1000);
			});
		});
		try {
			await harness.start();
			vi.advanceTimersByTime(2000);
			expect(harness.statuses.get("ticks")).toBe("2");
			await harness.reload();
			harness.statusUpdates.length = 0;
			vi.advanceTimersByTime(1000);
			expect(harness.statusUpdates).toEqual([{ key: "ticks", text: "1" }]);
		} finally {
			await harness.dispose();
		}
	});

	it("dispose contains a failing shutdown handler, releases timers, and rejects reuse", async () => {
		const harness = await createExtensionHarness(pi => {
			pi.on("session_start", (_event, ctx) => {
				ctx.setInterval(() => ctx.ui.notify("should not fire"), 1000);
			});
			pi.on("session_shutdown", () => {
				throw new Error("cleanup failed");
			});
		});
		try {
			await harness.start();
			await harness.dispose();
			vi.advanceTimersByTime(5000);
			expect(harness.notifications).toHaveLength(0);
			expect(harness.errors.map(error => error.error)).toEqual(["cleanup failed"]);
			await expect(harness.start()).rejects.toThrow("disposed");
		} finally {
			await harness.dispose();
		}
	});

	it("reports unstubbed host operations instead of silently passing", async () => {
		const harness = await createExtensionHarness(pi => {
			pi.on("session_start", () => pi.sendUserMessage("run this"));
		});
		try {
			await harness.start();
			expect(harness.errors).toHaveLength(1);
			expect(harness.errors[0]?.error).toContain("Supply an action override");
		} finally {
			await harness.dispose();
		}
	});
});

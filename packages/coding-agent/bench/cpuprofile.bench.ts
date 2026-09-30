/**
 * Full parse/build/render benchmark for synthetic V8 CPU profiles.
 * Run unchanged on each revision: bun packages/coding-agent/bench/cpuprofile.bench.ts
 * Fixture generation and warmup are excluded; JSON parsing and rendering are included.
 * Output hashes make before/after summary changes visible. This is not a CLI/I/O benchmark.
 */
import { type CpuProfile, type CpuProfileNode, renderCpuProfile } from "../src/utils/cpuprofile";

function fixture(width: number, duplicateEvery = 0): string {
	const children: number[] = [];
	const nodes: CpuProfileNode[] = [{ id: 1, callFrame: { functionName: "(root)" }, children }];
	for (let i = 0; i < width; i++) {
		const id = i + 2;
		children.push(id);
		nodes.push({
			id,
			callFrame: {
				functionName: `work${duplicateEvery ? i % duplicateEvery : i}`,
				url: "file:///app/work.ts",
				lineNumber: 1,
			},
			hitCount: 1,
		});
	}
	const profile: CpuProfile = { nodes, startTime: 0, endTime: width * 1000 };
	return JSON.stringify(profile);
}

console.log(`Bun ${Bun.version}; ${process.platform}/${process.arch}; 9 batches, 20 renders/batch`);
for (const [name, width, duplicateEvery] of [
	["small", 10, 0],
	["wide-100", 100, 0],
	["wide-1000", 1000, 0],
	["wide-5000", 5000, 0],
	["duplicates-5000", 5000, 100],
] as const) {
	const text = fixture(width, duplicateEvery);
	let output: string | null = null;
	for (let i = 0; i < 30; i++) output = renderCpuProfile(text);
	const timings: number[] = [];
	for (let batch = 0; batch < 9; batch++) {
		const start = Bun.nanoseconds();
		for (let i = 0; i < 20; i++) output = renderCpuProfile(text);
		timings.push((Bun.nanoseconds() - start) / 1e6 / 20);
	}
	if (!output) throw new Error(`${name}: missing summary`);
	timings.sort((a, b) => a - b);
	console.log(
		`${name}: ${text.length} bytes; median ${timings[4].toFixed(3)} ms/render; range ${timings[0].toFixed(3)}–${timings[8].toFixed(3)}; hash ${Bun.hash(output)}`,
	);
}

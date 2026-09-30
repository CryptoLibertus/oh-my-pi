# Clock extension screenshot

`clock-extension.png` shows a real interactive CLI session at source commit
`2ffa80a9171db1d0173b50f578700146cfee74d3`, captured on 2026-09-30 at
02:42:52 UTC. The visible local clock reads `02:42:51`; another frame captured
four seconds earlier reads `02:42:47`.

Command, run from the repository root:

```sh
bun packages/coding-agent/src/cli.ts --no-session --no-tools --extension .omp/extensions/clock.ts
```

The CLI ran in a Linux pseudo-terminal at 120 columns by 36 rows. Its unmodified
ANSI output was replayed with xterm.js 6.0.0 and photographed by headless Chromium.
This is rendered terminal output, not a UI mockup. No model request was sent.
The no-model warning is expected in the isolated, credential-free profile.

Capture used `TERM=xterm-256color`, `COLORTERM=truecolor`, a temporary
`PI_CODING_AGENT_DIR`, and `PI_CONFIG_DIR` pointing to temporary writable storage
because the cloud environment's home directory is read-only. The profile had
`setupVersion: 2` to skip onboarding. The explicit extension flag loads the same
repository entry point that `.omp/extensions` normally auto-discovers.

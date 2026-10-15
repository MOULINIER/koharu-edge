#!/usr/bin/env bun
// bun scripts/free-port.ts PORT
//
// Kills only processes listening on exactly PORT. `kill-port` matched `:3000` as a
// prefix on Windows and also killed listeners on 30000, 30001, ... (e.g. RustRover).

const port = Number(process.argv[2])
if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  console.error('usage: bun scripts/free-port.ts PORT')
  process.exit(1)
}

function listeningPids(): number[] {
  if (process.platform === 'win32') {
    const { stdout } = Bun.spawnSync(['netstat', '-ano', '-p', 'TCP'])
    const pids = new Set<number>()
    for (const line of stdout.toString().split(/\r?\n/)) {
      const [proto, local, , state, pid] = line.trim().split(/\s+/)
      if (proto !== 'TCP' || state !== 'LISTENING') continue
      if (Number(local?.slice(local.lastIndexOf(':') + 1)) !== port) continue
      if (Number(pid) > 0) pids.add(Number(pid))
    }
    return [...pids]
  }
  const { stdout } = Bun.spawnSync(['lsof', '-t', `-iTCP:${port}`, '-sTCP:LISTEN'])
  return [...new Set(stdout.toString().split(/\s+/).filter(Boolean).map(Number))]
}

for (const pid of listeningPids()) {
  try {
    process.kill(pid, 'SIGKILL')
    console.log(`killed pid ${pid} listening on port ${port}`)
  } catch (error) {
    console.error(`failed to kill pid ${pid}: ${error}`)
  }
}

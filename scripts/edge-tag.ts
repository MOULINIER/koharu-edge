#!/usr/bin/env bun
// bun scripts/edge-tag.ts
//
// Creates the next Koharu Edge release tag, `vX.Y.Z-edge.N`, on the current commit.
// X.Y.Z is the upstream workspace version. N counts the Edge releases built on that
// version. The tag is only created locally: pushing it starts the Edge Release workflow.

function git(...args: string[]): string {
  const result = Bun.spawnSync(['git', ...args])
  if (result.exitCode !== 0) {
    console.error(result.stderr.toString().trim())
    process.exit(1)
  }
  return result.stdout.toString().trim()
}

if (git('rev-parse', '--abbrev-ref', 'HEAD') !== 'main') {
  console.error('edge releases are tagged on main')
  process.exit(1)
}
if (git('status', '--porcelain', '--untracked-files=no') !== '') {
  console.error('commit or stash tracked changes first')
  process.exit(1)
}

const manifest = await Bun.file(new URL('../Cargo.toml', import.meta.url)).text()
const version = manifest.match(/\[workspace\.package\][^[]*?\nversion\s*=\s*"([^"]+)"/)?.[1]
if (!version) {
  console.error('could not read [workspace.package].version from Cargo.toml')
  process.exit(1)
}

const prefix = `v${version}-edge.`
const releases = git('tag', '--list', `${prefix}*`)
  .split('\n')
  .map((tag) => Number(tag.slice(prefix.length)))
  .filter(Number.isInteger)
const tag = `${prefix}${Math.max(0, ...releases) + 1}`

git('tag', '-a', tag, '-m', `Koharu Edge ${tag}`)
console.log(`created ${tag} on ${git('rev-parse', '--short', 'HEAD')}`)
console.log(`publish it with: git push origin ${tag}`)

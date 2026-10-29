// Publish only the built public website. Source remains on the main branch.
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const project = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(project, 'dist');
const run = (args, cwd = project, capture = false) => execFileSync('git', args, {
  cwd, encoding: 'utf8', stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
});
if (!existsSync(join(dist, 'index.html'))) throw new Error('请先运行 npm run build。');
const remote = run(['remote', 'get-url', 'origin'], project, true).trim();
const revision = run(['rev-parse', '--short', 'HEAD'], project, true).trim();
const userName = run(['config', 'user.name'], project, true).trim();
const userEmail = run(['config', 'user.email'], project, true).trim();
const stage = mkdtempSync(join(tmpdir(), 'tidal-pages-'));

try {
  const branch = spawnSync('git', ['ls-remote', '--exit-code', '--heads', remote, 'gh-pages'], {
    cwd: project, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'],
  });
  if (![0, 2].includes(branch.status)) throw new Error('无法连接仓库，请检查 Git 登录与网络。');
  run(['init', '-b', 'gh-pages'], stage);
  run(['remote', 'add', 'origin', remote], stage);
  run(['config', 'user.name', userName], stage);
  run(['config', 'user.email', userEmail], stage);
  if (branch.status === 0) {
    run(['fetch', '--depth=1', 'origin', 'gh-pages'], stage);
    run(['reset', '--hard', 'FETCH_HEAD'], stage);
    run(['rm', '-r', '--ignore-unmatch', '.'], stage);
  }
  cpSync(dist, stage, { recursive: true });
  run(['add', '.'], stage);
  const changes = spawnSync('git', ['diff', '--cached', '--quiet'], { cwd: stage });
  if (changes.status === 0) console.log('网站构建内容未变化，无需再次发布。');
  else {
    if (changes.status !== 1) throw new Error('无法检查待发布文件。');
    run(['commit', '-m', `Deploy website from ${revision}`], stage);
    run(['push', '--progress', 'origin', 'HEAD:gh-pages'], stage);
    console.log('网站文件已上传，GitHub Pages 将自动更新。');
  }
} finally {
  rmSync(stage, { recursive: true, force: true });
}

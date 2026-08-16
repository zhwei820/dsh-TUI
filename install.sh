#!/bin/sh
# dsh-TUI 一键安装。
#
# 默认（npm 版）：走官方 dsh CLI 的 profile 插件机制——`add` 自动初始化
# profile（首层 dsh-base），pnpm 从 registry 安装本包后按 dsh.bundle.patch
# 元数据把它追加为 bundle 层；本包的 patch 会一并 insert 工作状态行
# （dsh-working-activity，作为 npm 依赖自动带入）。无需源码快照。
#
# `--local`（本地构建）：把 profile 指向当前这份仓库检出，而不是 registry。
# 先 `pnpm install --frozen-lockfile` 补齐依赖、再 `pnpm build` 重新编译
# lib/ 并跑构建门禁，最后才安装——依赖缺一半时 tsc 会半途失败并留下不完整
# 的 lib/types/，profile 随即以 ERR_MODULE_NOT_FOUND 整棵插件树加载失败，
# 所以本地安装必须自己保证「依赖齐 + 编译过」这两步。
#
#   sh install.sh                  # registry 版（默认）
#   sh install.sh --local          # 本地构建，link: 软链（改完重新编译即生效）
#   sh install.sh --local --pack   # 本地构建，打 tarball 装副本（快照，不随仓库变）
#   sh install.sh --local --no-build   # 跳过依赖安装与编译，直接用现有 lib/
#   sh install.sh --local --profile dsh-tui-dev   # 装到另一个 profile 并存对比
set -eu

ROOT="$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)"
PACKAGE='@deepseek-harness-tui/dsh-tui'
PROFILE='dsh-tui'
SOURCE='registry'   # registry | link | pack
BUILD=1

usage() {
  cat <<'EOF'
用法：sh install.sh [选项]

  --local           安装当前仓库检出的本地构建（默认 link: 软链）
  --link            同 --local
  --pack            本地构建打成 tarball 后安装副本（隐含 --local）
  --no-build        本地安装时跳过 pnpm install / pnpm build
  --profile <名字>  目标 profile（默认 dsh-tui）
  -h, --help        显示本帮助
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --local|--link) SOURCE='link' ;;
    --pack|--tarball) SOURCE='pack' ;;
    --no-build|--skip-build) BUILD=0 ;;
    --profile)
      [ $# -ge 2 ] || { echo "install.sh: --profile 需要一个 profile 名字" >&2; exit 2; }
      shift
      PROFILE="$1"
      ;;
    --profile=*) PROFILE="${1#--profile=}" ;;
    -h|--help) usage; exit 0 ;;
    *) echo "install.sh: 未知参数 $1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

if ! command -v dsh >/dev/null 2>&1; then
  echo "未检测到 dsh CLI。先安装官方客户端：" >&2
  echo "  npm install -g @deepseek-ai/dsh" >&2
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "未检测到 pnpm。dsh plugin 把安装转发给 pnpm，请先安装：" >&2
  echo "  npm install -g pnpm   （或启用 corepack：corepack enable pnpm）" >&2
  exit 1
fi

if [ "$SOURCE" = 'registry' ]; then
  dsh plugin --profile "$PROFILE" add "$PACKAGE"
else
  # --- 本地构建 ---------------------------------------------------------
  [ -f "$ROOT/package.json" ] && [ -d "$ROOT/src" ] || {
    echo "install.sh: ${ROOT} 不是 dsh-TUI 仓库检出，无法本地安装" >&2
    exit 1
  }

  if [ "$BUILD" = 1 ]; then
    # 变量一律写成 ${VAR}：macOS 的 /bin/sh 是 bash 3.2，`$VAR）` 这种
    # 紧跟全角字符的写法会把后面的字节吞进变量名，报 unbound variable。
    echo "=== 安装依赖（${ROOT}）==="
    # --ignore-scripts 跳过 prepare 里的那次 compile：紧接着的 pnpm build
    # 会 clean 后重编，重复编译只是白等一轮。
    (cd "$ROOT" && pnpm install --frozen-lockfile --ignore-scripts)
    echo "=== 编译 src → lib/types 并跑构建门禁 ==="
    (cd "$ROOT" && pnpm run build)
  fi

  # profile 加载的是 lib/types/*.js（package.json 的 exports 入口）。缺文件
  # 就直接停在这里，别把半成品装进 profile 换来一屏 loader 堆栈。
  for entry in index working-activity workspaces command-trees; do
    [ -f "$ROOT/lib/types/$entry.js" ] || {
      echo "install.sh: 缺少构建产物 lib/types/$entry.js" >&2
      echo "  先执行 pnpm install && pnpm build（或去掉 --no-build 重跑本脚本）" >&2
      exit 1
    }
  done

  if [ "$SOURCE" = 'link' ]; then
    # link: 是软链——profile 直接读这份检出的 lib/，改完 pnpm build 即生效，
    # 无需重装；代价是仓库的 node_modules 也成了运行时依赖来源，别删。
    dsh plugin --profile "$PROFILE" add "link:$ROOT"
  else
    command -v npm >/dev/null 2>&1 || {
      echo "install.sh: --pack 需要 npm（npm pack 负责按 files 字段打包）" >&2
      exit 1
    }
    PACK_DIR="$ROOT/.local-pack"
    mkdir -p "$PACK_DIR"
    rm -f "$PACK_DIR"/*.tgz
    echo "=== 打包 → $PACK_DIR ==="
    # 已经 build 过了，--ignore-scripts 避免 prepare 再编一遍；--silent 时
    # npm pack 的标准输出只有 tarball 文件名。
    TARBALL_NAME="$(cd "$ROOT" && npm pack --ignore-scripts --silent --pack-destination "$PACK_DIR")"
    TARBALL="$PACK_DIR/$TARBALL_NAME"
    [ -f "$TARBALL" ] || {
      echo "install.sh: npm pack 未生成预期的 tarball（${TARBALL}）" >&2
      exit 1
    }
    # profile 的 package.json 会记下这个 tarball 的绝对路径，后续在 profile
    # 里跑 pnpm install 时还要按路径回读，所以留在仓库内（.gitignore 已忽略
    # *.tgz），不要放临时目录。
    dsh plugin --profile "$PROFILE" add "$TARBALL"
  fi
fi

echo
case "$SOURCE" in
  registry) echo "安装完成（registry 版）。启动：dsh --profile ${PROFILE}" ;;
  link) echo "安装完成（本地构建 · link:${ROOT}）。启动：dsh --profile ${PROFILE}" ;;
  pack) echo "安装完成（本地构建 · tarball 副本）。启动：dsh --profile ${PROFILE}" ;;
esac
if [ "$PROFILE" = 'dsh-tui' ]; then
  echo "Windows 也可以用仓库根目录的 dsh-tui.cmd（--resume 恢复上次会话）。"
fi
if [ "$SOURCE" = 'link' ]; then
  echo "改动源码后执行 pnpm build 重新编译即可生效，不必重跑本脚本；"
  echo "改动 package.json 依赖后需要重跑（或自行 pnpm install）。"
fi
echo
echo "注意：不要再对同一 profile 单独 add dsh-working-activity——它已随"
echo "dsh-tui 的补丁层自动挂载，重复 add 会产生重复行。想调参（如"
echo "publishIntervalMs）在 \$DSH_HOME/profiles/$PROFILE/cordis.patch.yml 按 id 覆盖："
echo "  - id: working-activity"
echo "    config:"
echo "      publishIntervalMs: 500"

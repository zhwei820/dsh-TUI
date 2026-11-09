#!/bin/sh
# 全局 dsh-tui / dst 启动器的维护（make install / install-launcher / uninstall 调用）。
#
#   sh scripts/global-launcher.sh install <tarball>  PATH 上已有启动器 → 用它自己的包管理器从 tarball 重装；
#                                                    没有 → npm 全局安装
#   sh scripts/global-launcher.sh remove             卸掉 PATH 上的启动器（npm / pnpm 全局），直到 PATH 上不再有
#
# 为什么要按 PATH 判定：启动器只是瘦壳，委托 $DSH_HOME/profiles/dsh-tui 里的插件副本；profile 为空时
# 它按「自己的版本」从 npm 自举安装（bin/dsh-tui.js installVersion）。所以 PATH 上残留的旧启动器
# 会把 profile 装回旧版，而它未必是 npm 装的（pnpm 全局、另一个 node 的 npm 前缀），`npm ls -g` 看不见。
# 归属按启动器所在目录与 `npm prefix -g`/bin、`pnpm bin -g` 比对；认不出的只报告路径，不删任何文件。
set -eu

PKG=@deepseek-harness-tui/dsh-tui
NPM=${NPM:-npm}
PNPM=${PNPM:-pnpm}

launcher_path() { command -v dsh-tui 2>/dev/null || true; }

# 启动器的 `--version` 在角色分支之前应答，不委托、不自举；第一行是 "<pkg> <version> (launcher)"。
launcher_version() { "$1" --version 2>/dev/null | awk 'NR == 1 { print $2 }'; }

# npm | pnpm | npm-prefix:<prefix> | unknown：启动器所在目录属于哪个包管理器的全局 bin。
# npm-prefix：另一个 node 的 npm 全局前缀（如换过 node 后 /usr/local 里的旧副本）——
# <prefix>/bin/dsh-tui 指向 <prefix>/lib/node_modules/$PKG/bin/dsh-tui.js 就是 npm 布局，用 --prefix 定位它。
launcher_owner() {
  dir=$(cd "$(dirname "$1")" && pwd -P)
  npm_bin=$("$NPM" prefix -g 2>/dev/null || true)
  if [ -n "$npm_bin" ] && [ -d "$npm_bin/bin" ] && [ "$dir" = "$(cd "$npm_bin/bin" && pwd -P)" ]; then echo npm; return; fi
  pnpm_bin=$("$PNPM" bin -g 2>/dev/null || true)
  if [ -n "$pnpm_bin" ] && [ -d "$pnpm_bin" ] && [ "$dir" = "$(cd "$pnpm_bin" && pwd -P)" ]; then echo pnpm; return; fi
  prefix=$(dirname "$dir")
  target=$(readlink -f "$1" 2>/dev/null || true)
  if [ -n "$target" ] && [ "$target" = "$(cd "$prefix" && pwd -P)/lib/node_modules/$PKG/bin/dsh-tui.js" ]; then echo "npm-prefix:$prefix"; return; fi
  echo unknown
}

# 另一个前缀不可写（多半要 sudo）时不替用户提权，只给出命令。
prefix_writable() {
  case "$1" in
    npm-prefix:*)
      p=${1#npm-prefix:}
      [ -w "$p/lib/node_modules" ] && [ -w "$p/bin" ] && return 0
      echo "global-launcher: $p is not writable; run it yourself:" >&2
      echo "  sudo $NPM $2 -g --prefix $p $3" >&2
      return 1
      ;;
  esac
}

install_with() {
  case "$1" in
    # --legacy-peer-deps：npm 12 解析全局 peer 会崩（启动器是瘦壳，跳过安全；见 bin/dsh-tui.js 同款提示）。
    npm) "$NPM" install -g --legacy-peer-deps "$2"; strip_deps "$("$NPM" root -g)" ;;
    pnpm) "$PNPM" add -g "$2" ;;
    npm-prefix:*)
      "$NPM" install -g --prefix "${1#npm-prefix:}" --legacy-peer-deps "$2"
      strip_deps "${1#npm-prefix:}/lib/node_modules"
      ;;
  esac
}

# npm 全局副本不留运行时依赖：启动器只用 node 内置模块；而与 dsh 同前缀时，宿主沿自身上级目录
# 解析 $PKG 会命中这份副本，profile 里的 react-reconciler 随之拿到它的 react —— 两份 React，
# 首个 hook 即抛错，整屏空白。pnpm 全局目录不在宿主的上级路径上，不处理。
strip_deps() {
  dir="$1/$PKG/node_modules"
  [ -d "$dir" ] || return 0
  echo "Removing the launcher's runtime dependencies: $dir"
  rm -rf "$dir"
}

install() {
  tarball=$1
  [ -f "$tarball" ] || { echo "global-launcher: tarball not found: $tarball" >&2; exit 1; }
  bin=$(launcher_path)
  if [ -z "$bin" ]; then
    echo "Installing the global dsh-tui / dst launcher (npm)"
    install_with npm "$tarball"
    return
  fi
  owner=$(launcher_owner "$bin")
  before=$(launcher_version "$bin")
  if [ "$owner" = unknown ]; then
    echo "global-launcher: $bin (v${before:-?}) is not an npm/pnpm global install; not touched." >&2
    echo "  It may install its own version into the profile. Remove it, then run: make install" >&2
    return
  fi
  prefix_writable "$owner" install "--legacy-peer-deps $tarball" || return 0
  echo "Reinstalling the global dsh-tui launcher at $bin (v${before:-?}, $owner)"
  install_with "$owner" "$tarball"
  after=$(launcher_version "$(launcher_path)")
  echo "dsh-tui launcher: v${before:-?} -> v${after:-?}"
}

remove() {
  removed=
  for _ in 1 2 3; do
    bin=$(launcher_path)
    [ -n "$bin" ] || break
    owner=$(launcher_owner "$bin")
    case "$owner" in
      npm) echo "Removing the global dsh-tui launcher at $bin (npm)"; "$NPM" uninstall -g "$PKG" ;;
      pnpm) echo "Removing the global dsh-tui launcher at $bin (pnpm)"; "$PNPM" remove -g "$PKG" ;;
      npm-prefix:*)
        prefix_writable "$owner" uninstall "$PKG" || return 0
        echo "Removing the global dsh-tui launcher at $bin (npm, prefix ${owner#npm-prefix:})"
        "$NPM" uninstall -g --prefix "${owner#npm-prefix:}" "$PKG"
        ;;
      *)
        echo "global-launcher: $bin (v$(launcher_version "$bin")) is not an npm/pnpm global install; remove it by hand." >&2
        return
        ;;
    esac
    # 包管理器没删掉它（另一个前缀的同名 bin 等）就别原地打转。
    [ "$(launcher_path)" != "$bin" ] || { echo "global-launcher: $bin is still on PATH after removal" >&2; return; }
    removed=1
  done
  # PATH 之外的 npm 全局副本（bin 目录不在 PATH 上）也一并清掉。
  if "$NPM" ls -g --depth=0 "$PKG" >/dev/null 2>&1; then
    echo "Removing the npm global $PKG (its bin is not on PATH)"
    "$NPM" uninstall -g "$PKG"
    removed=1
  fi
  [ -n "$removed" ] || echo "Global launcher not installed; nothing to remove"
}

case "${1:-}" in
  install) install "${2:?tarball}" ;;
  remove) remove ;;
  *) echo "usage: $0 install <tarball> | remove" >&2; exit 2 ;;
esac

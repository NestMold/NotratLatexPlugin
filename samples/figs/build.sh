#!/usr/bin/env bash
# ================================================================
#  figs/build.sh —— 把本目录所有 .tex 图源导出成 PDF
#
#  用法：   bash samples/figs/build.sh
#
#  特性：
#    · 只重编**有改动**的图（latexmk 自己比对，没改的一步不跑）；
#    · 编完自动清掉 aux / log / xdv 等中间产物，只留 .pdf；
#    · 任一图编译失败就立刻停下并指向它的 .log，不会带着坏图往下走。
#
#  什么时候需要它：你**只改了图、还没编正文**的时候，想立刻在预览里
#  看到新图。平时光跑 `latexmk -xelatex ../test.tex` 就够了 —— 同目录的
#  latexmkrc 会在正文编译前自动把变过的图先编好。
# ================================================================
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v latexmk >/dev/null 2>&1; then
  echo "✗ 找不到 latexmk。装 TeX Live / MiKTeX 时它一般自带；" >&2
  echo "  MiKTeX 的路径通常在 C:\\Program Files\\MiKTeX\\miktex\\bin\\x64" >&2
  exit 127
fi

shopt -s nullglob
figs=( *.tex )
if [ ${#figs[@]} -eq 0 ]; then
  echo "figs/ 下没有 .tex 图源，无事可做。"
  exit 0
fi

echo "▶ 图形源目录：$(pwd)"
for f in "${figs[@]}"; do
  printf '  · %-22s ' "$f"
  if latexmk -xelatex -norc -silent -interaction=nonstopmode -halt-on-error "$f" >/dev/null 2>&1; then
    latexmk -c -norc "$f" >/dev/null 2>&1 || true
    echo "→ ${f%.tex}.pdf   ✓"
  else
    echo "✗ 编译失败 —— 看 ${f%.tex}.log"
    exit 1
  fi
done

echo "✓ 全部图形已导出："
ls -1 *.pdf 2>/dev/null | sed 's/^/    /'
echo
echo "提示：正文里这样引：\\includegraphics[...]{figs/<名字>.pdf}"
echo "      **必须写全 .pdf 后缀** —— 本目录同时有同名 .tex 图源，"
echo "      不带后缀时预览的资产通道会先命中那个 .tex，把图当文本读走，图就不显示了。"

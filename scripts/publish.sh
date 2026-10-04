#!/usr/bin/env bash
# Sonic Canvas — 一键发布到 GitHub（含 GitHub Pages 在线试玩）
# 前置：只要求你先完成一次 `gh auth login`（浏览器授权），其余全部自动。
set -euo pipefail
cd "$(dirname "$0")/.."

command -v gh >/dev/null 2>&1 || { echo "✗ 未找到 gh，请先安装：brew install gh"; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "✗ 尚未登录 GitHub，请先运行：gh auth login"; exit 1; }

echo "→ 读取 GitHub 账号信息"
LOGIN=$(gh api user -q .login)
USERID=$(gh api user -q .id)
NAME=$(gh api user -q '.name // .login')
echo "  你好，$NAME (@$LOGIN)"

echo "→ 配置 git 身份（使用隐私保护邮箱，不暴露真实邮箱）"
git config user.name  "$NAME"
git config user.email "$USERID+$LOGIN@users.noreply.github.com"

echo "→ 填入 LICENSE / README 中的用户名"
sed -i '' "s/GITHUB_USER/$LOGIN/g" LICENSE README.md 2>/dev/null \
  || sed -i "s/GITHUB_USER/$LOGIN/g" LICENSE README.md

REPO=sonic-canvas
echo "→ 提交并推送"
git add -A
git commit -m "Sonic Canvas — local music visualizer (Web Audio API + Canvas 2D)" --allow-empty
git branch -M main

if gh repo view "$LOGIN/$REPO" >/dev/null 2>&1; then
  echo "  远程仓库已存在，推送到它"
  git remote remove origin 2>/dev/null || true
  git remote add origin "https://github.com/$LOGIN/$REPO.git"
  git push -u origin main
else
  gh repo create "$REPO" --public --source=. --remote=origin --push
fi

echo "→ 优化仓库主页信息（简介 + 话题标签）"
gh repo edit "$LOGIN/$REPO" \
  --description "🎵 Local music visualizer — Web Audio API + Canvas 2D, zero dependencies, runs entirely in your browser" \
  --add-topic music-visualizer --add-topic web-audio-api --add-topic canvas2d \
  --add-topic javascript --add-topic creative-coding >/dev/null 2>&1 || true

echo "→ 开启 GitHub Pages（在线试玩）"
gh api -X POST "repos/$LOGIN/$REPO/pages" \
  -f "source[branch]=main" -f "source[path]=/" >/dev/null 2>&1 \
  && echo "  Pages 已开启" \
  || echo "  Pages 可能已开启（如未开启请到 Settings → Pages → Branch 选 main / (root)）"

echo
echo "✅ 仓库地址：  https://github.com/$LOGIN/$REPO"
echo "🌐 在线试玩（首次部署约 1-2 分钟后生效）："
echo "   https://$LOGIN.github.io/$REPO/"

@echo off
setlocal
set "GIT=C:\Program Files\Git\cmd\git.exe"
cd /d "E:\NASA\PS League\website"
(
echo === status ===
"%GIT%" status --short
echo === add ===
"%GIT%" add -A
echo === commit ===
"%GIT%" commit -m "Tidy .gitignore"
echo === push ===
"%GIT%" push
echo === log ===
"%GIT%" log --oneline -5
echo === DONE EXIT=%ERRORLEVEL% ===
) > push2.log 2>&1
type push2.log
endlocal

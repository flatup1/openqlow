#!/bin/bash
# Mac でダブルクリックすると UIZIN Event OS が起動し、ブラウザで画面が開きます。
# OBS なしで試すときは、ターミナルで  ./start.command --demo
cd "$(dirname "$0")" || exit 1
(sleep 2 && open "http://localhost:8787/") &
exec node src/server/main.mjs "$@"

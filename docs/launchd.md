# OPENQLOW launchd Setup

Phase 1 runs locally on Jin's Mac.

The daily command is:

```bash
cd "/Users/jin/Desktop/OPENQLOW HelMES/openqlow"
npm run daily
```

Suggested launchd plist path:

```text
~/Library/LaunchAgents/com.flatup.openqlow.daily.plist
```

Suggested plist content:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.flatup.openqlow.daily</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>-lc</string>
    <string>cd "/Users/jin/Desktop/OPENQLOW HelMES/openqlow" && npm run daily >> logs/launchd.log 2>&1</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>8</integer>
    <key>Minute</key>
    <integer>0</integer>
  </dict>
  <key>RunAtLoad</key>
  <false/>
</dict>
</plist>
```

Load command:

```bash
launchctl load ~/Library/LaunchAgents/com.flatup.openqlow.daily.plist
```

Unload command:

```bash
launchctl unload ~/Library/LaunchAgents/com.flatup.openqlow.daily.plist
```

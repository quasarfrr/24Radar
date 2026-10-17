24RADAR v0.4 — Render-ready package

WHAT THIS DOES
- Hosts the website and Node.js server together, so the browser can use /api/state on the same site.
- The server fetches 24data from https://24data.ptfs.app/acft-data; the browser does not call 24data directly.
- Includes Render deployment configuration in render.yaml.

RUN LOCALLY
Requirements: Node.js 18 or newer.
1. Extract this folder.
2. Open Command Prompt/Terminal inside the 24radar folder.
3. Run: npm start
4. Open http://localhost:3000 in Chrome.

PUBLISH ONLINE (NO CHATGPT IN THE SITE URL)
This ZIP cannot publish itself; you need your own hosting account. The simplest route for this Node.js app is Render:
1. Create/sign in to a GitHub account and create a NEW private or public repository named 24radar.
2. Extract this ZIP on your computer.
3. Upload the CONTENTS of the 24radar folder (including server.js, package.json, render.yaml, README.txt, and public/index.html) into the repository root. Do not upload the outer ZIP as the only file.
4. In Render, choose New + → Blueprint, connect the GitHub repository, and let Render read render.yaml.
5. Deploy. When it finishes, Render will give you a URL similar to https://24radar.onrender.com. You can change the service name if the name is available.
6. Open the URL and check /api/health if the live feed seems stuck.

NOTES
- The free hosting plan may sleep after inactivity, so the first visit after a while can take a little time to wake up. Availability and free-plan terms are controlled by Render and can change.
- The server polls 24data every 3 seconds. One deployed server instance makes one upstream poll every 3 seconds; do not run multiple copies unnecessarily.
- This is a prototype, not an official ATC24 service. The live feed and community chart assets can change or be unavailable.
- 24data source: https://24data.ptfs.app/acft-data
- Enroute chart and point database: DayzdRB/PTFSFlightPlanner, https://github.com/DayzdRB/PTFSFlightPlanner
- Airport ground charts: Treelon/ptfs-charts, https://github.com/Treelon/ptfs-charts — CC BY-SA 4.0.
- Ground chart browser: https://ptfs.app/charts

# Wacky McLovin Stream Boards

Live game boards for breaks and rips, driven by Google Sheets. Hosted at https://boards.wackymclovin.com

- Boards: `/auction/` `/prefill/` `/pack/` `/custom/` `/rtyh/` `/types/` `/case/` `/hits/`
- Tools: `/print/` (Print Station for shop-order spot labels), `/picture/` (Picture Link Maker)
- Help: `/how-to/` and `/downloads/` (printable setup guide PDF)
- Sheets + shop order robot: `apps-script/WackyBoards.gs` (Google Apps Script, run `createWackyBoards()` once, then `turnOnAutoOrders()`)
- Settings: `assets/config.js`

Add `?clean=1` to a board link for OBS / TikTok LIVE Studio. Add `?sheet=SHEET_ID` to point any board at another sheet.

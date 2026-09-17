/* Wacky McLovin Stream Boards - site settings.
   sheetId: the long ID from the Main Google Sheet's web address
   (docs.google.com/spreadsheets/d/THIS_PART/edit). You can also paste the whole link.
   Any board link can use a different sheet by adding ?sheet=SHEET_ID to the end. */
window.DONHUNT_CONFIG = {
  sheetId: "",
  pollSeconds: 4,      // how often the boards check the sheet
  psaProxy: "",        // PSA photo helper (off until PSA approves API access)
  brand: "WACKY HUNT",
  // Each extra game reads its own Google Sheet (filled in by the setup script)
  gameSheets: { rtyh: "", types: "", case: "", hits: "" }
};

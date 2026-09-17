/* Wacky McLovin Stream Boards - site settings.
   sheetId: the long ID from the Main Google Sheet's web address
   (docs.google.com/spreadsheets/d/THIS_PART/edit). You can also paste the whole link.
   Any board link can use a different sheet by adding ?sheet=SHEET_ID to the end. */
window.DONHUNT_CONFIG = {
  sheetId: "1Dsa_TPinBtpX_Pr9v-uznRWrwIEfINqPQKfFbqFBSUg",
  pollSeconds: 4,      // how often the boards check the sheet
  psaProxy: "",        // PSA photo helper (off until PSA approves API access)
  brand: "WACKY HUNT",
  // Each extra game reads its own Google Sheet (filled in by the setup script)
  gameSheets: {
    rtyh: "1TS8M-OOagtzuUNpCigBELVeyn_7qVsc4wcgqJoq7Hh8",
    types: "1A7VVVBoDk2emZSZVoBYAww1wlLQkODcnj_s58GUedPw",
    case: "1288BiKcqTMA5s1GlG0jeQtkPlW0o0F5JenqpJGfgPlI",
    hits: "1uZb55uwMM7SgDav2hEfHCJ6Igt8eJrRsDxhmzTlFhPA"
  }
};

# Issue Checklist

- [x] #1 Treasury Mode balance summary and multi-payer overview: keep the per-asset treasury summary and member contributions in `TreasuryView`; add a group expense overview totaling each payer separately by asset.
- [x] #2 Keyboard navigation and focus traps: use the shared dialog focus management, cover Tab/Shift+Tab wrapping, and retain focus containment for the mobile navigation drawer and receipt preview.
- [x] #3 SEP-24 deposit and withdrawal: use the full secure, session-polling SEP-24 modal from the dashboard as well as the Anchors page.
- [x] #4 Settlement optimism and feedback: optimistically adjust balances after wallet signing, roll back on submission errors, and refresh group data when Stellar reports a terminal status.
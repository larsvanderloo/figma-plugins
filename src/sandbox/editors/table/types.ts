// ============================================================
// editors/table/types.ts — TOMBSTONE
//
// TABLE_CONTENT_NAME was het naam-stempel van de legacy WelderTable-
// content-FRAME (renderer-output). De huidige architectuur gebruikt
// Slot-based rendering: de plugin bouwt rows + cells direct binnen
// de SlotNode, er is geen outer-content-FRAME meer en dus ook geen
// `TABLE_CONTENT_NAME`-constant nodig.
//
// Bestand behouden zodat oude imports duidelijk "not found" geven i.p.v.
// silent iets anders matchen; verwijderen kan wanneer niemand meer
// terug-merged.
// ============================================================

export {};

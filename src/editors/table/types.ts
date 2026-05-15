// ============================================================
// editors/table/types.ts — TOMBSTONE (T34.2)
//
// TABLE_CONTENT_NAME was het naam-stempel van de legacy WelderTable-
// content-FRAME (v0.1.x renderer-output). T34.2 vervangt die architectuur
// door Slot-based rendering: de plugin bouwt rows + cells direct binnen
// de SlotNode, er is geen outer-content-FRAME meer en dus ook geen
// `TABLE_CONTENT_NAME`-constant nodig.
//
// Bestand behouden zodat oude imports duidelijk "not found" geven i.p.v.
// silent iets anders matchen; verwijderen kan wanneer de v0.2.0-release
// door Git-history heen is en niemand meer terug-merged.
// ============================================================

export {};

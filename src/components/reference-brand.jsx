import React from "react";

/** The tri-colour rule that signs the reference identity. */
export function HeritageRule({ compact = false }) {
  return <span className={`jd-rule${compact ? " is-compact" : ""}`} aria-hidden="true"><i/><i/><i/></span>;
}

/** The supplied JD tile: engraved-style italics on a near-black plate. */
export function HeritageTile({ size = 46, radius = 11, label = "JD" }) {
  return <span aria-hidden="true" style={{
    width: size, height: size, borderRadius: radius, flexShrink: 0,
    background: "linear-gradient(160deg,#242a31,#0e1216)", color: "#fdfbf6",
    display: "grid", placeItems: "center", lineHeight: 1,
    fontFamily: "'JD Caslon Text',Georgia,serif", fontStyle: "italic",
    fontSize: Math.round(size * 0.44), boxShadow: "0 2px 7px rgba(16,20,24,.22)",
  }}>{label}</span>;
}

/** Wordmark: product name set in Caslon, optionally with its rule beneath. */
export function HeritageWordmark({ as: Tag = "span", rule = false, className = "", style }) {
  return <Tag className={className} style={style}>
    <span className="jd-wordmark" style={{fontSize:"inherit"}}><b>James-Denning</b></span>
    {rule && <HeritageRule/>}
  </Tag>;
}

/** Shared brand lockup: tile + wordmark. Used by public pages and the header. */
export function ReferenceBrand({ divided = false }) {
  return <span className={`reference-brand${divided ? " reference-brand-divided" : ""}`}>
    <img src="/design/jd-monogram.png" alt="" width="44" height="35"/>
    <span>James-Denning</span>
  </span>;
}

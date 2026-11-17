import React from "react";

/** Uses the monogram supplied in the design reference, not a replacement logo. */
export function ReferenceBrand({ divided = false }) {
  return <span className={`reference-brand${divided ? " reference-brand-divided" : ""}`}>
    <img src="/design/jd-monogram.png" alt="" width="44" height="35"/>
    <span>James-Denning</span>
  </span>;
}

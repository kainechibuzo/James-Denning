# Supplied reference assets

These assets come from the user's three UI reference attachments, not generated imagery or third-party stock images. Browser chrome and device status bars are not part of the application.

- `dashboard-laptop.webp`: WebP conversion of `file_000000008e0c81f4b5f299434a8e8dd6.png` (1672 × 941). Used on wider screens.
- `dashboard-laptop-front.webp`: crop of `file_0000000004c48210b5352c27c7d6d885.png`, source rectangle x=0, y=890, width=843, height=560. Used on narrow screens. Sample dashboard figures are artwork, never queried or presented as real tenant metrics.
- `jd-tile.png`: crop of `file_00000000e81081f4b1822152ebb87386.png`, rectangle x=370, y=607, width=108, height=108.
- `jd-monogram.png`: same workspace reference resized to 709 px wide, header mark cropped at x=110, y=164, width=44, height=35; light background converted to transparency, preserving the supplied silhouette.
- `workspace-curves.svg`: vector reconstruction of the reference's pale decorative curves; no text or application state embedded.

Typography is implemented with self-hosted Inter, Pinyon Script and Libre Caslon Text, selected to reproduce the reference appearance. Exact original font files were not provided. Each redistributed font has its OFL license in `public/fonts/`; no external font network request is required.

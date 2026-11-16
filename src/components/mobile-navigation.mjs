// Bind only while the authenticated mobile drawer is mounted and open.
// Return cleanup for close, logout, workspace changes, PDF replacement or resize.
export function bindMobileNavigation(drawer, { onClose, returnFocus }) {
  const doc = drawer.ownerDocument;
  const body = doc.body;
  const previousOverflow = body.style.overflow;
  const controls = () => [...drawer.querySelectorAll(
    'button:not([disabled]), input:not([disabled]), a[href], select:not([disabled]), textarea:not([disabled]), [tabindex="0"]'
  )].filter((element) => element.tabIndex >= 0 && !element.closest('[hidden], [inert], [aria-hidden="true"]'));
  body.style.overflow = "hidden";
  (controls()[0] || drawer).focus();

  const onKeyDown = (event) => {
    if (event.key === "Escape") {
      // A native search-field Escape may clear input as well; closing is explicit.
      event.preventDefault();
      event.stopPropagation();
      onClose();
      returnFocus?.focus();
      return;
    }
    if (event.key !== "Tab") return;
    const elements = controls(); // Query fresh after search results/group changes.
    const first = elements[0], last = elements[elements.length - 1];
    if (!first) { event.preventDefault(); drawer.focus(); return; }
    if (event.shiftKey && (doc.activeElement === first || doc.activeElement === drawer)) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && (doc.activeElement === last || doc.activeElement === drawer)) {
      event.preventDefault(); first.focus();
    }
  };
  drawer.addEventListener("keydown", onKeyDown);
  return () => {
    drawer.removeEventListener("keydown", onKeyDown);
    body.style.overflow = previousOverflow;
    // Do not steal focus from another dialog opened by a navigation action.
    if (drawer.contains(doc.activeElement)) returnFocus?.focus();
  };
}

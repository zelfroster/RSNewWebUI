const m = require('mithril');

// Mount only while open. Native modal dialogs make the rest of the page inert
// and provide dialog semantics; callers own the open state and sheet content.
const Dialog = () => {
  let opener;
  let onclose = () => { };
  let desktopQuery;
  let onLayoutChange;
  return {
    oncreate: ({ dom }) => {
      opener = document.activeElement;
      dom.showModal();
      //  The sheets are phone chrome: above 700px their CSS hides the dialog,
      //  but showModal() keeps the whole page inert regardless -- rotating to
      //  landscape with a sheet open left the UI untappable with no visible
      //  way out. Crossing into the desktop layout closes the sheet instead.
      //  The SAME condition the stylesheet uses to show the sheet
      //  (max-width: 700px), so JS and CSS agree at every width -- a
      //  min-width: 701px mirror leaves a fractional crack (700 < w < 701,
      //  common at desktop zoom levels) where the sheet is hidden but still
      //  modal.
      desktopQuery = window.matchMedia('(max-width: 700px)');
      onLayoutChange = (event) => {
        if (!event.matches) {
          onclose();
          m.redraw();
        }
      };
      if (desktopQuery.addEventListener) desktopQuery.addEventListener('change', onLayoutChange);
      else desktopQuery.addListener(onLayoutChange);
    },
    onremove: ({ dom }) => {
      if (desktopQuery && onLayoutChange) {
        if (desktopQuery.removeEventListener) desktopQuery.removeEventListener('change', onLayoutChange);
        else desktopQuery.removeListener(onLayoutChange);
      }
      dom.close();
      if (opener && opener.isConnected) opener.focus();
    },
    view: ({ attrs, children }) => {
      onclose = attrs.onclose;
      return m('dialog.accessible-dialog', {
      class: attrs.overlayClass,
      'aria-label': attrs.label,
      'aria-modal': 'true',
      oncancel: (event) => {
        event.preventDefault();
        attrs.onclose();
      },
      onclick: (event) => {
        if (event.target === event.currentTarget) attrs.onclose();
      },
      onkeydown: (event) => {
        if (event.key !== 'Tab') return;
        const dialog = event.currentTarget;
        const controls = Array.from(dialog.querySelectorAll(
          'a[href], button, input, select, textarea, [tabindex], [contenteditable="true"]'
        )).filter((element) => element.tabIndex >= 0 &&
          !element.matches(':disabled') && !element.closest('[inert]') &&
          element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden');
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (!first) {
          event.preventDefault();
        } else if (event.shiftKey && (document.activeElement === first || !controls.includes(document.activeElement))) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !controls.includes(document.activeElement))) {
          event.preventDefault();
          first.focus();
        }
      },
      }, m('div', { class: attrs.sheetClass }, children));
    },
  };
};

module.exports = Dialog;

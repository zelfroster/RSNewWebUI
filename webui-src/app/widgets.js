const m = require('mithril');
const Sidebar = () => {
  let mobileOpen = false;

  const links = (v) => v.attrs.tabs.map((panelName) => {
    const href = v.attrs.baseRoute + panelName;
    const selected = m.route.get().toLowerCase().startsWith(href.toLowerCase());
    return m('a', {
      class: selected ? 'selected-sidebar-link' : '',
      href,
      onclick: (event) => {
        event.preventDefault();
        mobileOpen = false;
        m.route.set(href);
      },
    }, panelName);
  });

  return {
    view: (v) => {
      if (!v.attrs.mobileDrawer) return m('.sidebar', links(v));
      return m('.sidebar-drawer', [
        m('button.sidebar-mobile-toggle[type=button][aria-label=Open navigation]', {
          'aria-expanded': mobileOpen,
          onclick: () => { mobileOpen = !mobileOpen; },
        }, m('i.fas.fa-bars')),
        mobileOpen ? m('.sidebar-drawer__backdrop', { onclick: () => { mobileOpen = false; } }) : null,
        m('.sidebar', { class: mobileOpen ? 'sidebar--mobile-open' : '' }, [
          m('.sidebar-drawer__title', 'Navigation'),
          ...links(v),
        ]),
      ]);
    },
  };
};
const SidebarQuickView = () => {
  // for the Mail tab, to be moved later.
  let quickactive = -1;
  return {
    view: (v) =>
      m(
        '.sidebarquickview',
        m('h4', 'Quick View'),
        v.attrs.tabs.map((panelName, index) =>
          m(
            m.route.Link,
            {
              class: index === quickactive ? 'selected-sidebarquickview-link' : '',
              onclick: () => (quickactive = index),
              href: v.attrs.baseRoute + panelName,
            },
            panelName
          )
        )
      ),
  };
};

// There are ways of doing this inside m.route but it is probably
// cleaner and faster when kept outside of the main auto
// rendering system
function closePopupMessage() {
  const container = document.getElementById('modal-container');
  if (!container) return;
  m.mount(container, null);
  container.style.display = 'none';
}

function popupMessage(message, modalClass = '') {
  const container = document.getElementById('modal-container');
  if (!container) return;
  container.style.display = 'block';

  //  A vnode carries the DOM node it owns, so the same one cannot be
  //  rendered twice. Most call sites hand popupMessage a ready-made vnode
  //  (or an array of them); re-rendering it on every global redraw needs a
  //  fresh copy each time -- and a copy all the way down, since mithril
  //  skips a subtree whose children array is identical (old === vnodes) and
  //  freezes it at its first render. Component call sites go through m()
  //  and need no copying.
  const freshVnode = (vnode) => {
    if (Array.isArray(vnode)) return vnode.map(freshVnode);
    if (!vnode || typeof vnode !== 'object' || !vnode.tag) return vnode;
    //  '<' is m.trust and '[' is m.fragment: neither is a selector m() can
    //  parse. Rebuilding them with m() would silently turn trusted html into
    //  an empty div, so they go back through their own factory. '#' is a
    //  text vnode, whose children is the string itself.
    if (vnode.tag === '<') return m.trust(vnode.children);
    if (vnode.tag === '#') return vnode.children;
    if (vnode.tag === '[') return m.fragment(vnode.attrs, freshVnode(vnode.children));
    if (typeof vnode.tag !== 'string') return m(vnode.tag, vnode.attrs, vnode.children);
    return m(vnode.tag, vnode.attrs, freshVnode(vnode.children));
  };

  const renderContent = () => {
    if (typeof message === 'function') {
      const res = message();
      if (res && typeof res.view === 'function') {
        return m(message);
      }
      return freshVnode(res);
    }
    if (message && typeof message.view === 'function') {
      return m(message);
    }
    return freshVnode(message);
  };

  const Popup = {
    view: () => m(`.modal-content${modalClass ? `.${modalClass}` : ''}`, [
      m(
        'button.red.close-btn',
        {
          onclick: () => {
            closePopupMessage();
          },
        },
        m('i.fas.fa-times')
      ),
      renderContent(),
    ]),
  };

  m.mount(container, Popup);
}

module.exports = {
  Sidebar,
  SidebarQuickView,
  popupMessage,
  closePopupMessage,
};

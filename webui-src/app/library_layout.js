const m = require('mithril');

function navigation(attrs, tabs, mobile = false) {
  return m('.library-navigation__tabs', {
    class: attrs.mobileTabs ? (mobile ? 'library-navigation__tabs--mobile' : 'library-navigation__tabs--desktop') : '',
  }, tabs.map((entry) => {
    const tab = typeof entry === 'string' ? entry : entry.tab;
    const href = attrs.baseRoute + tab;
    const currentTab = m.route.get().slice(attrs.baseRoute.length).split('/')[0];
    const active = currentTab.toLowerCase() === tab.toLowerCase() ||
      (mobile && tab === 'All' && ['Popular', 'Other'].includes(currentTab));
    const label = entry.label || (attrs.baseRoute === '/files/' && tab === 'files'
      ? 'Transfers' : tab.replace(/([a-z])([A-Z])/g, '$1 $2'));
    return m(m.route.Link, {
      href,
      class: active ? 'active' : '',
      'aria-current': active ? 'page' : undefined,
    }, label);
  }));
}

// Shared visual shell, matching Network / People.
module.exports = {
  view: ({ attrs, children }) => m('.library-layout', {
    class: attrs.detailOpen ? 'library-layout--detail' : '',
  }, [
    m('nav.library-navigation', { 'aria-label': attrs.title }, [
      m('.library-navigation__heading', [m(`i.fas.fa-${attrs.icon}`, { 'aria-hidden': 'true' }), m('h2', attrs.title)]),
      navigation(attrs, attrs.tabs),
      attrs.mobileTabs ? navigation(attrs, attrs.mobileTabs, true) : null,
    ]),
    m('.node-panel.library-content', children),
  ]),
};

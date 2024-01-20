const m = require('mithril');
const widget = require('components/widgets');

const sections = {
  network: require('pages/config/config_network'),
  node: require('pages/config/config_node'),
  services: require('pages/config/config_services'),
  files: require('pages/config/config_files'),
  people: require('pages/config/config_people'),
  mail: require('pages/config/config_mail'),
};

const Layout = {
  view: (vnode) => [
    m(widget.Sidebar, {
      tabs: Object.keys(sections),
      baseRoute: '/config/',
    }),
    m('.node-panel', vnode.children),
  ],
};

module.exports = {
  view: (vnode) => {
    const tab = vnode.attrs.tab;
    return m(Layout, m(sections[tab]));
  },
};

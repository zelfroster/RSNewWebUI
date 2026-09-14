const m = require('mithril');
const LibraryLayout = require('library_layout');

const sections = {
  network: require('config/config_network'),
  node: require('config/config_node'),
  services: require('config/config_services'),
  files: require('config/config_files'),
  people: require('config/config_people'),
  chat: require('config/config_chat'),
  mail: require('config/config_mail'),
};

const Layout = {
  view: (vnode) => m(LibraryLayout, {
    title: 'Configuration',
    icon: 'cog',
    tabs: Object.keys(sections),
    baseRoute: '/config/',
  }, vnode.children),
};
module.exports = {
  view: (vnode) => {
    const tab = vnode.attrs.tab;
    return m(Layout, m(sections[tab]));
  },
};

const m = require('mithril');

//  The page header names this tab; there is no list behind it yet.
const Layout = () => {
  return {
    view: () => m('.empty', m('b', 'No forums to show')),
  };
};

module.exports = Layout();

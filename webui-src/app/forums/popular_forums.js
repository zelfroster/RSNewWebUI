const m = require('mithril');
const util = require('forums/forums_util');

const Layout = () => {
  return {
    view: (v) => [
      m('.widget__heading', m('h3', v.attrs.title || 'Popular Forums')),
      m('.widget__body', [
        m(
          util.ForumTable,
          m('tbody', [
            v.attrs.list.map((forum) =>
              m(util.ForumSummary, {
                details: forum,
                category: v.attrs.category || 'Popular',
              })
            ),
            v.attrs.list.map((forum) =>
              m(util.DisplayForumsFromList, {
                id: forum.mGroupId,
                category: v.attrs.category || 'Popular',
              })
            ),
          ])
        ),
      ]),
    ],
  };
};

module.exports = Layout;

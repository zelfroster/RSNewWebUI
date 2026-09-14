const m = require('mithril');
const util = require('boards/boards_util');

const Layout = () => {
  return {
    view: (v) => [
      m('.widget__heading', [
        m('h3', v.attrs.title || 'Popular Boards'),
        m('button.popular-boards-create[type=button][title=Create Board][aria-label=Create Board]', {
          onclick: v.attrs.onCreateBoard,
        }, m('i.fas.fa-plus')),
      ]),
      m('.widget__body', [
        m(
          util.BoardTable,
          m('tbody', [
            v.attrs.list &&
              v.attrs.list.map((board) =>
                m(util.BoardSummary, {
                  key: board.mGroupId,
                  details: board,
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

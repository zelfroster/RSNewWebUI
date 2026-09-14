const m = require('mithril');
const util = require('boards/boards_util');

const Layout = () => {
  return {
    view: (v) => [
      m('.widget__heading', [
        m('h3', 'Other Boards'),
        m('button.other-boards-create[type=button][title=Create Board][aria-label=Create Board]', {
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
                  category: 'Other',
                })
              ),
          ])
        ),
      ]),
    ],
  };
};

module.exports = Layout;

const m = require('mithril');
const util = require('boards/boards_util');

const Layout = () => {
  return {
    view: (v) => [
      m('.widget__heading', [
        m('h3', 'Subscribed Boards'),
        //  The heading button is the only create entry point on phones, where
        //  the toolbar Create is hidden; this tab was the one without it.
        m('button.my-boards-create[type=button][title=Create Board][aria-label=Create Board]', {
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
                  category: 'Subscribed',
                })
              ),
          ])
        ),
      ]),
    ],
  };
};

module.exports = Layout;

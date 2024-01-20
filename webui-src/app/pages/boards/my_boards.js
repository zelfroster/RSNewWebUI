const m = require('mithril');
const util = require('pages/boards/boards_util');

const Layout = () => {
  return {
    view: (v) => [
      m('.widget__heading', m('h3', 'My Boards')),
      m('.widget__body', [
        m(
          util.BoardTable,
          m('tbody', [
            v.attrs.list.map((board) =>
              m(util.BoardSummary, {
                details: board,
                category: 'MyBoards',
              })
            ),
            v.attrs.list.map((board) =>
              m(util.DisplayBoardsFromList, {
                id: board.mGroupId,
                category: 'MyBoards',
              })
            ),
          ])
        ),
      ]),
    ],
  };
};

module.exports = Layout();
